export type EventProps = {
  d: string // YYYY-MM-DD
  t: string // description
  u: string // original post URL
  c: string // category
  g: number // graphic level 0-5
  p: string // place
  s: string // credit
  un?: string[] // units named in the description
  n: number // day index, added on load
  uns: string // "|unit|unit|" for map filters (MapLibre stringifies array properties)
}
export type EventFeature = GeoJSON.Feature<GeoJSON.Point, EventProps>

export type Episode = {
  id: string
  title: string
  unit: string
  side: "UA" | "RU"
  start: string
  end: string
  place: string
  center: [number, number]
  notes?: string
  videos: { url: string; label: string }[]
  sources?: string[]
}

export type WeekStat = { d: string; occ: number; con: number; gain: number; loss: number }
export type FrontStats = { prewar_km2: number; weeks: WeekStat[] }

const START = Date.UTC(2022, 1, 24)
const DAY = 864e5
export const dayOf = (d: string) => Math.round((Date.parse(d) - START) / DAY)
export const dateOf = (n: number) => new Date(START + n * DAY).toISOString().slice(0, 10)
export const today = () => dayOf(new Date().toISOString().slice(0, 10))

export const CATEGORIES: [string, string][] = [
  ["Russian Military Losses", "#ffd34d"],
  ["Ground Battle", "#ff7a1a"],
  ["Russian Military Presence", "#e8523f"],
  ["Russian Firing Positions", "#c2185b"],
  ["Munitions", "#b388ff"],
  ["Military Infrastructure Damage", "#a1887f"],
  ["Bombing or explosion", "#ff4081"],
  ["Civilian Infrastructure Damage", "#4fc3f7"],
  ["Civilian Casualty", "#80deea"],
  ["Other", "#9e9e9e"],
]
const KNOWN = new Set(CATEGORIES.map(c => c[0]))

export const FRONT_COLORS = {
  prewar: "#7a1f1a",
  occupied: "#d6453d",
  unknown: "#9e9e9e",
  gain: "#ff8a3d",
  loss: "#4f9dff",
}

export const GRAPHIC = ["Unrated", "None", "Mild", "Moderate", "Severe", "Graphic"]

const base = import.meta.env.BASE_URL
const getJson = <T,>(path: string): Promise<T> =>
  fetch(base + path).then(r => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`)
    return r.json()
  })

export async function loadAll() {
  const [events, frontDates, stats, prewar, episodes] = await Promise.all([
    getJson<GeoJSON.FeatureCollection<GeoJSON.Point, EventProps>>("data/events.geojson"),
    getJson<string[]>("data/frontline/index.json"),
    getJson<FrontStats>("data/frontline/stats.json"),
    getJson<GeoJSON.FeatureCollection>("data/frontline/prewar.geojson"),
    getJson<Episode[]>("data/episodes.json").catch(() => [] as Episode[]),
  ])
  for (const f of events.features) {
    const p = f.properties
    p.n = dayOf(p.d)
    p.uns = p.un ? `|${p.un.join("|")}|` : ""
    if (!KNOWN.has(p.c)) p.c = "Other"
  }
  return { events, frontDates, stats, prewar, episodes }
}

const frontCache = new Map<string, Promise<GeoJSON.FeatureCollection>>()
export function loadFront(date: string) {
  if (!frontCache.has(date)) frontCache.set(date, getJson(`data/frontline/${date}.geojson`))
  return frontCache.get(date)!
}

/** Latest weekly snapshot on or before the given date (first one if earlier). */
export function frontDateFor(dates: string[], date: string) {
  let pick = dates[0]
  for (const d of dates) {
    if (d > date) break
    pick = d
  }
  return pick
}

export type Filters = {
  lo: number
  hi: number
  categories: Set<string>
  hideGraphic: boolean
  unit: string | null
}

export const matches = (p: EventProps, f: Filters) =>
  p.n >= f.lo && p.n <= f.hi && f.categories.has(p.c) && !(f.hideGraphic && p.g >= 4) &&
  (!f.unit || p.uns.includes(`|${f.unit}|`))

/** Same rules as `matches`, as a MapLibre filter expression. */
export function mapFilter(f: Filters): unknown[] {
  const e: unknown[] = ["all", [">=", ["get", "n"], f.lo], ["<=", ["get", "n"], f.hi],
    ["in", ["get", "c"], ["literal", [...f.categories]]]]
  if (f.hideGraphic) e.push(["<", ["get", "g"], 4])
  if (f.unit) e.push(["in", `|${f.unit}|`, ["get", "uns"]])
  return e
}

export const fmtKm2 = (n: number) => `${Math.round(n).toLocaleString()} km²`
