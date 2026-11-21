"""Download open geolocation data and write the static files the map reads.

Sources:
  - Centre for Information Resilience "Eyes on Russia" (public ArcGIS layer) -> data/events.geojson
  - DeepStateMap.live history (volunteer/non-commercial use, attribution) -> data/frontline/YYYY-MM.geojson

Run: python scripts/fetch_data.py            (full refresh)
     python scripts/fetch_data.py --selftest  (normalizer checks only, no network)
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import shapely
from shapely.geometry import Polygon, box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"  # Vite copies public/ into the built site as-is
CIR_LAYER = ("https://services-eu1.arcgis.com/06WOSMGHsCnaFyMp/arcgis/rest/services/"
             "EoR_completed_entries/FeatureServer/0/query")
CIR_FIELDS = "Link,Description,Town_or_City,province,Primary_category,Graphic_content_level,TIMESTAMP,Credit"
DS_HISTORY = "https://deepstatemap.live/api/history/public"
DS_SNAPSHOT = "https://deepstatemap.live/api/history/{id}/geojson"
WAR_START = "2022-02-24"
UA = "ukraine-war-footage-map/1.0 (static GitHub Pages site)"


def get_json(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


# ---------- unit tags ----------

UNITS = [(u["name"], [re.compile(p, re.I) for p in u["patterns"]])
         for u in json.loads((ROOT / "scripts" / "units.json").read_text(encoding="utf-8"))]
BRIGADE = re.compile(
    r"\b(\d{1,3}(?:st|nd|rd|th))\s+(?:(?:separate|independent)\s+)?((?:guards\s+)?(?:mechani[sz]ed|assault|air assault|"
    r"airborne(?: assault)?|marine|motori[sz]ed(?: rifle)?|motor rifle|tank|artillery|jaeger|mountain assault|"
    r"naval infantry|territorial defen[cs]e))\s+brigade\b", re.I)


def tag_units(text):
    """Unit names mentioned in a description: named units from units.json plus numbered brigades."""
    found = {name for name, pats in UNITS if any(p.search(text) for p in pats)}
    for num, kind in BRIGADE.findall(text):
        kind = re.sub(r"mechanised", "mechanized", kind, flags=re.I).replace("defence", "defense")
        found.add(f"{num.lower()} {kind.title()} Brigade")
    return sorted(found)


# ---------- footage events ----------

def normalize_event(f):
    """CIR ArcGIS GeoJSON feature -> compact feature, or None if unusable."""
    p = f.get("properties") or {}
    g = f.get("geometry") or {}
    url = (p.get("Link") or "").strip()
    ts = p.get("TIMESTAMP")
    if g.get("type") != "Point" or not url.startswith("http") or not isinstance(ts, (int, float)):
        return None
    lon, lat = g["coordinates"][:2]
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None
    date = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
    if date < WAR_START:
        return None
    level = (p.get("Graphic_content_level") or "").strip()[:1]
    place = ", ".join(x for x in (p.get("Town_or_City"), p.get("province")) if x)
    text = (p.get("Description") or "").strip()
    out = {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
        "properties": {
            "d": date,
            "t": text[:400],
            "u": url,
            "c": p.get("Primary_category") or "Other",
            "g": int(level) if level.isdigit() else 0,
            "p": place,
            "s": p.get("Credit") or "CIR",
        },
    }
    units = tag_units(text)
    if units:
        out["properties"]["un"] = units
    return out


def fetch_events():
    feats, seen, offset = [], set(), 0
    while True:
        q = urllib.parse.urlencode({
            "where": "1=1", "outFields": CIR_FIELDS, "orderByFields": "OBJECTID",
            "resultOffset": offset, "resultRecordCount": 1000, "f": "geojson",
        })
        page = get_json(f"{CIR_LAYER}?{q}")
        batch = page.get("features", [])
        for f in batch:
            n = normalize_event(f)
            if n and n["properties"]["u"] not in seen:
                seen.add(n["properties"]["u"])
                feats.append(n)
        offset += len(batch)
        print(f"  events: {offset} read, {len(feats)} kept", flush=True)
        if not batch or not (page.get("properties") or {}).get("exceededTransferLimit"):
            break
    feats.sort(key=lambda f: f["properties"]["d"])
    return {"type": "FeatureCollection", "features": feats}


# ---------- front line ----------

def frontline_class(name):
    """DeepState polygon name -> 'prewar' | 'occupied' | 'unknown' | None (ignore).

    Names changed over time ("Окуповано", then "Окуповано /// Occupied", then "... /// geoJSON.status.occupied"),
    so match several spellings. DeepState also tags satirical "occupied" areas outside Ukraine; drop those.
    Crimea and the 2014 Donbas areas were only drawn as separate shapes from late 2022, so they get their own class.
    """
    n = name.lower()
    if any(k in n for k in SATIRE):
        return None
    if any(k in n for k in ("crimea", "крим", "ордло", "cadr", "tuzla", "тузла")):
        return "prewar"
    if any(k in n for k in ("unknown status", "status.unknown", "contested", "під питанням")):
        return "unknown"
    if any(k in n for k in ("occupied", "окупова")):
        return "occupied"
    return None


# DeepState also draws tongue-in-cheek "occupied" regions of Russia and its neighbours (Karelia, Kurils, ...);
# drop them by name in both languages, and clip everything to Ukraine's bounding box as a backstop.
SATIRE = ("abkhaz", "абхаз", "tskhinvali", "цхінвал", "prussia", "прусс", "karelia", "карел", "ichker", "ічкер",
          "kuril", "курил", "transnistria", "придністров", "chechn", "чечн")
UKRAINE_BBOX = box(22.0, 44.2, 40.3, 52.5)

SIMPLIFY = 0.002   # degrees (~200 m); keeps weekly files small
GRID = 1e-3        # coordinate precision (~100 m)
SLIVER = 0.001     # degrees; drops gain/loss slivers thinner than ~200 m caused by redrawing


def area_km2(geom):
    """Area on a sinusoidal (equal-area) projection; plenty accurate for a chart."""
    return shapely.transform(geom, lambda xy: np.column_stack(
        [xy[:, 0] * np.cos(np.radians(xy[:, 1])) * 111.32, xy[:, 1] * 110.574])).area


def tidy(geom):
    return shapely.set_precision(geom.simplify(SIMPLIFY), GRID)


def snapshot_areas(gj, prewar=None):
    """DeepState snapshot -> (occupied since 2022, contested, pre-2022 occupied) geometries."""
    parts = {"occupied": [], "unknown": [], "prewar": []}
    for f in gj.get("features", []):
        cls = frontline_class((f.get("properties") or {}).get("name") or "")
        geom = f.get("geometry") or {}
        # 2022 snapshots wrap some polygons in GeometryCollections.
        for g in geom.get("geometries", []) if geom.get("type") == "GeometryCollection" else [geom]:
            if cls and g.get("type") in ("Polygon", "MultiPolygon"):
                parts[cls].append(shape(g).buffer(0).intersection(UKRAINE_BBOX))
    pre = unary_union(parts["prewar"])
    base = prewar if prewar is not None else pre
    o = unary_union(parts["occupied"]).difference(base)
    u = unary_union(parts["unknown"]).difference(o).difference(base)
    return tidy(o), tidy(u), tidy(pre)


def changed(a, b):
    """Parts of a that are not in b, without redraw slivers."""
    return shapely.set_precision(a.difference(b).buffer(-SLIVER).buffer(SLIVER), GRID)


def features(**layers):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"k": k}, "geometry": mapping(g)}
        for k, g in layers.items() if not g.is_empty]}


def write_json(path, obj):
    path.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")


def fetch_frontline():
    """One snapshot per ISO week: occupied/contested areas plus gain/loss vs the week before.

    Areas held before 24 Feb 2022 (Crimea, 2014 Donbas) are a fixed layer, prewar.geojson, taken from the newest
    snapshot and subtracted from every week so they never show up as gains. Delete it to rebuild it.
    """
    out_dir = DATA / "frontline"
    out_dir.mkdir(parents=True, exist_ok=True)
    weekly = {}
    for h in sorted(get_json(DS_HISTORY), key=lambda h: h["createdAt"]):
        dt = datetime.fromisoformat(h["createdAt"].replace("Z", "+00:00"))
        weekly[dt.isocalendar()[:2]] = (dt.strftime("%Y-%m-%d"), h["id"])
    weeks = [weekly[k] for k in sorted(weekly)]
    dates = [d for d, _ in weeks]

    pre_path = out_dir / "prewar.geojson"
    if pre_path.exists():
        prewar = unary_union([shape(f["geometry"]) for f in json.loads(pre_path.read_text())["features"]])
    else:
        prewar = snapshot_areas(get_json(DS_SNAPSHOT.format(id=weeks[-1][1])))[2]
        write_json(pre_path, features(prewar=prewar))
    prewar_buf = prewar.buffer(SLIVER)  # tolerate small redraws along the 2022 boundary

    stats, prev = [], None
    for i, (d, sid) in enumerate(weeks):
        path = out_dir / f"{d}.geojson"
        if path.exists() and i < len(weeks) - 1:  # the newest week is still changing, so always refetch it
            saved = {f["properties"]["k"]: shape(f["geometry"])
                     for f in json.loads(path.read_text(encoding="utf-8"))["features"]}
            occ, unk = saved.get("occupied", Polygon()), saved.get("unknown", Polygon())
            gain, loss = saved.get("gain", Polygon()), saved.get("loss", Polygon())
        else:
            occ, unk, _ = snapshot_areas(get_json(DS_SNAPSHOT.format(id=sid)), prewar_buf)
            gain = changed(occ, prev) if prev is not None else Polygon()
            loss = changed(prev, occ) if prev is not None else Polygon()
            write_json(path, features(occupied=occ, unknown=unk, gain=gain, loss=loss))
            print(f"  frontline {d}: +{area_km2(gain):.0f} / -{area_km2(loss):.0f} km2", flush=True)
            time.sleep(1)  # be polite
        stats.append({"d": d, "occ": round(area_km2(occ)), "con": round(area_km2(unk)),
                      "gain": round(area_km2(gain), 1), "loss": round(area_km2(loss), 1)})
        prev = occ
    for p in out_dir.glob("????-??-??.geojson"):  # old files for the current week
        if p.stem not in dates:
            p.unlink()
    write_json(out_dir / "index.json", dates)
    write_json(out_dir / "stats.json", {"prewar_km2": round(area_km2(prewar)), "weeks": stats})


# ---------- self-check ----------

def selftest():
    ok = {"type": "Feature", "geometry": {"type": "Point", "coordinates": [37.8, 48.6]},
          "properties": {"Link": "https://t.me/x/1", "TIMESTAMP": 1684540800000,
                         "Graphic_content_level": "4 - Severe", "Description": " tank ",
                         "Town_or_City": "Bakhmut", "province": "Donetsk Oblast",
                         "Primary_category": "Ground Battle"}}
    n = normalize_event(ok)
    assert n["properties"] == {"d": "2023-05-20", "t": "tank", "u": "https://t.me/x/1", "c": "Ground Battle",
                               "g": 4, "p": "Bakhmut, Donetsk Oblast", "s": "CIR"}, n
    assert normalize_event({**ok, "properties": {**ok["properties"], "Link": None}}) is None
    assert normalize_event({**ok, "properties": {**ok["properties"], "TIMESTAMP": 1641600000000}}) is None  # pre-war
    assert normalize_event({**ok, "geometry": {"type": "Point", "coordinates": [200, 48]}}) is None
    assert frontline_class("Окуповано /// Occupied /// geoJSON.status.occupied\n") == "occupied"
    assert frontline_class("Окупований Крим /// Occupied Crimea /// geoJSON.territories.crimea") == "prewar"
    assert frontline_class("Статус невідомий /// Unknown status /// geoJSON.status.unknown") == "unknown"
    assert frontline_class("Звільнено /// Liberated /// geoJSON.status.dismissed") is None
    assert frontline_class("Окупована Абхазія.\n///\nOccupied Abkhazia. /// geoJSON.territories.abkhazia") is None
    assert frontline_class("Окуповано /// Occupied ") == "occupied"  # 2022-era naming
    assert frontline_class("Статус невідомий /// Unknown status") == "unknown"
    assert frontline_class("ОРДЛО /// CADR and CALR /// geoJSON.territories.ordlo") == "prewar"
    assert frontline_class("Окуповано") == "occupied" and frontline_class("Під питанням /// Contested") == "unknown"
    sq = lambda x0, x1: {"type": "Polygon", "coordinates": [[[x0, 48], [x1, 48], [x1, 49], [x0, 49], [x0, 48]]]}
    gc = {"features": [{"properties": {"name": "Окуповано"},
                        "geometry": {"type": "GeometryCollection", "geometries": [sq(30, 31)]}}]}
    occ, unk, pre = snapshot_areas(gc)
    assert unk.is_empty and 8000 < area_km2(occ) < 8300, area_km2(occ)  # 1x1 degree at 48.5N ~ 8150 km2
    grown = shape(sq(30, 31.5))
    assert 4000 < area_km2(changed(grown, occ)) < 4200 and changed(occ, grown).is_empty
    assert changed(shape(sq(30, 31.0003)), occ).is_empty  # redraw sliver ignored
    crimea = {"properties": {"name": "Окупований Крим /// Occupied Crimea"}, "geometry": sq(33, 34)}
    both = {"features": gc["features"] + [crimea]}
    o2, _, pre2 = snapshot_areas(both)
    assert abs(area_km2(o2) - area_km2(occ)) < 1 and area_km2(pre2) > 8000  # Crimea goes to prewar, not occupied
    generic = {"features": [{"properties": {"name": "Окуповано"}, "geometry": sq(30, 34)}]}
    o3, _, _ = snapshot_areas(generic, prewar=pre2)
    assert 3 * 8000 < area_km2(o3) < 3 * 8300  # a generic polygon covering Crimea has it subtracted
    assert frontline_class("Окуповані Південні Курильські острови /// Occupied Southern Kuril Islands") is None
    assert frontline_class("Тимчасово окупована територія Карелії.") is None
    far = {"features": [{"properties": {"name": "Окуповано"}, "geometry": sq(146, 147)}]}
    assert snapshot_areas(far)[0].is_empty  # outside Ukraine's bbox
    assert tag_units("Azov fighters near Kreminna; 3rd Separate Assault Brigade drone") == ["3rd Assault Brigade", "Azov"]
    assert tag_units("Strike on a port on the Sea of Azov and Azovstal") == []
    assert tag_units("47th Mechanized Brigade Bradley") == ["47th Mechanized Brigade"]
    print("selftest ok")


if __name__ == "__main__":
    selftest()
    if "--selftest" in sys.argv:
        sys.exit(0)
    DATA.mkdir(exist_ok=True)
    print("Fetching events...")
    ev = fetch_events()
    assert len(ev["features"]) > 1000, "suspiciously few events; not overwriting"
    (DATA / "events.geojson").write_text(json.dumps(ev, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("Fetching front line...")
    fetch_frontline()
    print("done")
