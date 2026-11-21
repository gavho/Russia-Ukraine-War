import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"
import { useEffect, useRef } from "react"
import {
  CATEGORIES, FRONT_COLORS, dayOf, mapFilter,
  type Episode, type EventFeature, type EventProps, type Filters,
} from "@/lib/data"

type Props = {
  events: GeoJSON.FeatureCollection<GeoJSON.Point, EventProps>
  prewar: GeoJSON.FeatureCollection
  front: GeoJSON.FeatureCollection | null
  episodes: Episode[]
  filters: Filters
  day: number
  layers: { front: boolean; changes: boolean; heat: boolean }
  flyTo: { center: [number, number]; zoom: number; key: number } | null
  onSelectEvent: (f: EventFeature) => void
  onSelectEpisode: (e: Episode) => void
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] }
const colorExpr = ["match", ["get", "c"], ...CATEGORIES.flat(), "#9e9e9e"]

export function MapView(p: Props) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<MlMap | null>(null)
  const ready = useRef(false)
  const latest = useRef(p)
  latest.current = p

  // Create the map once; later props are applied by the effects below.
  useEffect(() => {
    const m = new maplibregl.Map({
      container: box.current!,
      style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
      center: [35.5, 48.3], zoom: 5.4, maxPitch: 70, attributionControl: false,
    })
    map.current = m
    if (import.meta.env.DEV) Object.assign(window, { __map: m }) // for debugging in the console
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right")
    m.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'Footage: <a href="https://www.info-res.org/eyes-on-russia/">CIR Eyes on Russia</a> · Front line: <a href="https://deepstatemap.live">DeepStateMap.live</a> · Terrain: Mapzen/AWS',
    }), "bottom-right")

    m.on("load", () => {
      const { events, prewar, episodes } = latest.current
      const below = m.getStyle().layers.find(l => l.type === "symbol")?.id
      m.addSource("dem", { type: "raster-dem", encoding: "terrarium", tileSize: 256, maxzoom: 13,
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"] })
      m.addLayer({ id: "hillshade", type: "hillshade", source: "dem",
        paint: { "hillshade-exaggeration": 0.5, "hillshade-shadow-color": "#000", "hillshade-highlight-color": "#3a4350" } }, below)

      m.addSource("prewar", { type: "geojson", data: prewar })
      m.addSource("front", { type: "geojson", data: EMPTY })
      m.addLayer({ id: "prewar-fill", type: "fill", source: "prewar",
        paint: { "fill-color": FRONT_COLORS.prewar, "fill-opacity": 0.35 } }, below)
      m.addLayer({ id: "front-fill", type: "fill", source: "front", filter: ["in", ["get", "k"], ["literal", ["occupied", "unknown"]]],
        paint: { "fill-color": ["match", ["get", "k"], "occupied", FRONT_COLORS.occupied, FRONT_COLORS.unknown], "fill-opacity": 0.24 } }, below)
      m.addLayer({ id: "front-line", type: "line", source: "front", filter: ["==", ["get", "k"], "occupied"],
        paint: { "line-color": "#ff6b5e", "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 10, 2.2] } }, below)
      m.addLayer({ id: "change-fill", type: "fill", source: "front", filter: ["in", ["get", "k"], ["literal", ["gain", "loss"]]],
        paint: { "fill-color": ["match", ["get", "k"], "gain", FRONT_COLORS.gain, FRONT_COLORS.loss], "fill-opacity": 0.75 } }, below)
      m.addLayer({ id: "change-line", type: "line", source: "front", filter: ["in", ["get", "k"], ["literal", ["gain", "loss"]]],
        paint: { "line-color": ["match", ["get", "k"], "gain", "#ffc08a", "#a9cdff"], "line-width": 1.2 } }, below)

      m.addSource("events", { type: "geojson", data: events })
      m.addLayer({ id: "heat", type: "heatmap", source: "events", maxzoom: 9,
        paint: {
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 4, 6, 9, 18],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 9, 1.4],
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.8, 9, 0],
          "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(0,0,0,0)", 0.2, "#3b1c5a", 0.45, "#b33a3a", 0.7, "#ff8a1a", 1, "#ffe27a"],
        } })
      m.addLayer({ id: "pts", type: "circle", source: "events",
        paint: {
          "circle-color": colorExpr as never,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2.5, 10, 6, 14, 9],
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 8, 0.95],
          "circle-stroke-color": "#0e1116", "circle-stroke-width": 0.6,
        } })

      m.addSource("episodes", { type: "geojson", data: {
        type: "FeatureCollection",
        features: episodes.map(e => ({ type: "Feature", geometry: { type: "Point", coordinates: e.center },
          properties: { id: e.id, label: `${e.unit}: ${e.title}`, a: dayOf(e.start), b: dayOf(e.end), side: e.side } })),
      } })
      m.addLayer({ id: "ep-halo", type: "circle", source: "episodes",
        paint: { "circle-radius": 22, "circle-color": ["match", ["get", "side"], "UA", "#4f9dff", "#ff5a4f"],
          "circle-opacity": 0.18, "circle-stroke-width": 2, "circle-stroke-color": ["match", ["get", "side"], "UA", "#4f9dff", "#ff5a4f"] } })
      m.addLayer({ id: "ep-label", type: "symbol", source: "episodes",
        layout: { "text-field": ["get", "label"], "text-size": 12, "text-offset": [0, 2.4], "text-anchor": "top",
          "text-font": ["Montserrat Medium", "Open Sans Bold", "Noto Sans Regular"] },
        paint: { "text-color": "#e6e9ef", "text-halo-color": "#0e1116", "text-halo-width": 1.5 } })

      const pointer = (id: string) => {
        m.on("mouseenter", id, () => (m.getCanvas().style.cursor = "pointer"))
        m.on("mouseleave", id, () => (m.getCanvas().style.cursor = ""))
      }
      pointer("pts"); pointer("ep-halo")
      m.on("click", "pts", e => {
        const id = e.features?.[0]?.properties?.u
        const f = latest.current.events.features.find(x => x.properties.u === id)
        if (f) latest.current.onSelectEvent(f as EventFeature)
      })
      m.on("click", "ep-halo", e => {
        const ep = latest.current.episodes.find(x => x.id === e.features?.[0]?.properties?.id)
        if (ep) latest.current.onSelectEpisode(ep)
      })
      ready.current = true
      apply(m, latest.current)
      // On phones the expanded attribution sits under the timeline; keep it behind its (i) button.
      if (window.innerWidth < 768) box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show")
    })
    return () => { ready.current = false; m.remove() }
  }, [])

  useEffect(() => { if (ready.current && map.current) apply(map.current, p) },
    [p.filters, p.day, p.front, p.layers])

  useEffect(() => {
    if (p.flyTo && map.current) map.current.flyTo({ center: p.flyTo.center, zoom: p.flyTo.zoom, duration: 1600 })
  }, [p.flyTo])

  // Inline style: maplibre-gl.css (unlayered) sets position:relative, which beats Tailwind's layered `absolute`.
  return <div ref={box} style={{ position: "absolute", inset: 0 }} role="application" aria-label="Map of geolocated war footage" />
}

function apply(m: MlMap, p: Props) {
  const f = mapFilter(p.filters) as never
  m.setFilter("pts", f)
  m.setFilter("heat", f)
  m.setLayoutProperty("heat", "visibility", p.layers.heat ? "visible" : "none")
  for (const id of ["prewar-fill", "front-fill", "front-line"])
    m.setLayoutProperty(id, "visibility", p.layers.front ? "visible" : "none")
  for (const id of ["change-fill", "change-line"])
    m.setLayoutProperty(id, "visibility", p.layers.changes ? "visible" : "none")
  ;(m.getSource("front") as GeoJSONSource).setData(p.front ?? EMPTY)
  const epf = ["all", ["<=", ["get", "a"], p.day + 14], [">=", ["get", "b"], p.day - 14]] as never
  m.setFilter("ep-halo", epf)
  m.setFilter("ep-label", epf)
}
