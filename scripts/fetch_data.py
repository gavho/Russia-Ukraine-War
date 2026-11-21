"""Download open geolocation data and write the static files the map reads.

Sources:
  - Centre for Information Resilience "Eyes on Russia" (public ArcGIS layer) -> data/events.geojson
  - DeepStateMap.live history (volunteer/non-commercial use, attribution) -> data/frontline/YYYY-MM.geojson

Run: python scripts/fetch_data.py            (full refresh)
     python scripts/fetch_data.py --selftest  (normalizer checks only, no network)
"""
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
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
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
        "properties": {
            "d": date,
            "t": (p.get("Description") or "").strip()[:400],
            "u": url,
            "c": p.get("Primary_category") or "Other",
            "g": int(level) if level.isdigit() else 0,
            "p": place,
            "s": p.get("Credit") or "CIR",
        },
    }


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
    """DeepState polygon name -> 'occupied' | 'unknown' | None (ignore).

    Names changed over time ("Окуповано /// Occupied" in 2022, "... /// geoJSON.status.occupied" later),
    so match the English label. DeepState also tags satirical "occupied" areas outside Ukraine; drop those.
    """
    n = name.lower()
    if any(k in n for k in ("abkhaz", "tskhinvali", "prussia", "karelia", "ichker", "transnistria")):
        return None
    if any(k in n for k in ("unknown status", "status.unknown", "contested", "під питанням")):
        return "unknown"
    if any(k in n for k in ("occupied", "окупова", "crimea", "ордло", "cadr", "tuzla")):
        return "occupied"
    return None


def round_coords(c):
    return [round_coords(x) for x in c] if isinstance(c[0], list) else [round(c[0], 4), round(c[1], 4)]


def normalize_frontline(gj):
    out = []
    for f in gj.get("features", []):
        cls = frontline_class((f.get("properties") or {}).get("name") or "")
        geom = f.get("geometry") or {}
        # 2022 snapshots wrap some polygons in GeometryCollections.
        parts = geom.get("geometries", []) if geom.get("type") == "GeometryCollection" else [geom]
        for g in parts:
            if cls and g.get("type") in ("Polygon", "MultiPolygon"):
                out.append({"type": "Feature", "properties": {"k": cls},
                            "geometry": {"type": g["type"], "coordinates": round_coords(g["coordinates"])}})
    return {"type": "FeatureCollection", "features": out}


def fetch_frontline():
    out_dir = DATA / "frontline"
    out_dir.mkdir(parents=True, exist_ok=True)
    hist = get_json(DS_HISTORY)
    last_per_month = {}
    for h in sorted(hist, key=lambda h: h["createdAt"]):
        last_per_month[h["createdAt"][:7]] = h["id"]
    months = sorted(last_per_month)
    current = months[-1]  # the current month is still changing, so always refetch it
    for m in months:
        path = out_dir / f"{m}.geojson"
        if path.exists() and m != current:
            continue
        gj = normalize_frontline(get_json(DS_SNAPSHOT.format(id=last_per_month[m])))
        path.write_text(json.dumps(gj, separators=(",", ":")), encoding="utf-8")
        print(f"  frontline {m}: {len(gj['features'])} polygons", flush=True)
        time.sleep(1)  # be polite
    (out_dir / "index.json").write_text(json.dumps(months), encoding="utf-8")


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
    assert frontline_class("Окупований Крим /// Occupied Crimea /// geoJSON.territories.crimea") == "occupied"
    assert frontline_class("Статус невідомий /// Unknown status /// geoJSON.status.unknown") == "unknown"
    assert frontline_class("Звільнено /// Liberated /// geoJSON.status.dismissed") is None
    assert frontline_class("Окупована Абхазія.\n///\nOccupied Abkhazia. /// geoJSON.territories.abkhazia") is None
    assert frontline_class("Окуповано /// Occupied ") == "occupied"  # 2022-era naming
    assert frontline_class("Статус невідомий /// Unknown status") == "unknown"
    assert frontline_class("ОРДЛО /// CADR and CALR /// geoJSON.territories.ordlo") == "occupied"
    assert frontline_class("Окуповано") == "occupied" and frontline_class("Під питанням /// Contested") == "unknown"
    gc = {"features": [{"properties": {"name": "Окуповано"}, "geometry": {"type": "GeometryCollection",
          "geometries": [{"type": "Polygon", "coordinates": [[[30, 47], [31, 47], [31, 48], [30, 47]]]}]}}]}
    assert normalize_frontline(gc)["features"][0]["geometry"]["type"] == "Polygon"
    assert round_coords([[[1.123456, 2.987654]]]) == [[[1.1235, 2.9877]]]
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
