import { Loader2, Menu, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import { Detail, type Selection } from "@/components/Detail"
import { MapView } from "@/components/MapView"
import { Sidebar, type Layers } from "@/components/Sidebar"
import { Timeline, type Window } from "@/components/Timeline"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  CATEGORIES, dateOf, dayOf, frontDateFor, loadAll, loadFront, matches, today,
  type Episode, type EventFeature, type Filters,
} from "@/lib/data"

type Data = Awaited<ReturnType<typeof loadAll>>

const mq = window.matchMedia("(max-width: 767px)")
const useMobile = () => useSyncExternalStore(cb => (mq.addEventListener("change", cb), () => mq.removeEventListener("change", cb)), () => mq.matches)

export default function App() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { loadAll().then(setData, e => setError(String(e))) }, [])

  if (error) return <Splash><TriangleAlert className="text-destructive" />Couldn't load map data: {error}</Splash>
  if (!data) return <Splash><Loader2 className="animate-spin" />Loading 27,000+ geolocated posts…</Splash>
  return <Explorer data={data} />
}

const Splash = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">{children}</div>
)

function Explorer({ data }: { data: Data }) {
  const mobile = useMobile()
  const max = today()
  const [day, setDay] = useState(max)
  const [windowMode, setWindowMode] = useState<Window>("30")
  const [categories, setCategories] = useState(() => new Set(CATEGORIES.map(c => c[0])))
  const [hideGraphic, setHideGraphic] = useState(false)
  const [unit, setUnit] = useState<string | null>(null)
  const [layers, setLayers] = useState<Layers>({ front: true, changes: true, heat: true })
  const [playing, setPlaying] = useState(false)
  const [sel, setSel] = useState<Selection | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [flyTo, setFlyTo] = useState<{ center: [number, number]; zoom: number; key: number } | null>(null)
  const [front, setFront] = useState<GeoJSON.FeatureCollection | null>(null)

  const frontDate = frontDateFor(data.frontDates, dateOf(day))
  useEffect(() => {
    let live = true
    loadFront(frontDate).then(gj => live && setFront(gj), () => {})
    return () => { live = false }
  }, [frontDate])

  const filters: Filters = useMemo(() => {
    const w = windowMode === "all" ? null : Number(windowMode)
    return { lo: w === null ? 0 : day - w, hi: w === null ? day : day + w, categories, hideGraphic, unit }
  }, [day, windowMode, categories, hideGraphic, unit])
  const count = useMemo(() => data.events.features.filter(f => matches(f.properties, filters)).length, [data, filters])

  const openEpisode = (e: Episode) => {
    setPlaying(false)
    setDay(dayOf(e.start))
    setWindowMode("30")
    setSel({ kind: "episode", e })
    setFlyTo({ center: e.center, zoom: 10, key: Date.now() })
    setMenuOpen(false)
  }
  // Unit posts are sparse, so show all of them up to the current date rather than a ±30 day window.
  const pickUnit = (u: string | null) => { setUnit(u); if (u) setWindowMode("all") }

  const sidebar = (
    <Sidebar events={data.events.features as EventFeature[]} episodes={data.episodes} stats={data.stats}
      day={day} frontDate={frontDate} categories={categories} setCategories={setCategories}
      hideGraphic={hideGraphic} setHideGraphic={setHideGraphic} unit={unit} setUnit={pickUnit}
      layers={layers} setLayers={setLayers} onEpisode={openEpisode} />
  )
  const header = (
    <div className="space-y-1">
      <h1 className="text-base font-semibold tracking-tight">Ukraine War · Geolocated Footage</h1>
      <p className="text-xs text-muted-foreground">
        {data.events.features.length.toLocaleString()} verified posts since 24 Feb 2022. Pick a point or an operation to load the original video.{" "}
        <span className="text-amber-300">Some footage is graphic.</span>
      </p>
    </div>
  )

  return (
    <div className="relative h-full overflow-hidden">
      <MapView events={data.events} prewar={data.prewar} front={front} episodes={data.episodes}
        filters={filters} day={day} layers={layers} flyTo={flyTo}
        onSelectEvent={f => setSel({ kind: "event", f })} onSelectEpisode={openEpisode} />

      {unit && (
        <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
          <Button size="sm" variant="secondary" className="rounded-full shadow-lg" onClick={() => setUnit(null)}>
            Showing posts naming <b className="text-primary">{unit}</b> · clear
          </Button>
        </div>
      )}

      {mobile ? (
        <>
          <Card className="absolute top-3 right-14 left-3 z-10 flex-row items-center gap-3 px-3 py-2 backdrop-blur-md">
            <Button size="icon" variant="ghost" onClick={() => setMenuOpen(true)} aria-label="Open filters and layers"><Menu /></Button>
            <span className="truncate text-sm font-semibold">Ukraine War · Footage</span>
          </Card>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetContent side="left" className="w-[88vw] gap-0 p-0">
              <SheetHeader><SheetTitle>Ukraine War · Geolocated Footage</SheetTitle>
                <SheetDescription>Some footage is graphic. Videos load only when you ask.</SheetDescription></SheetHeader>
              <ScrollArea className="min-h-0 flex-1 px-4 pb-4">{sidebar}</ScrollArea>
            </SheetContent>
          </Sheet>
          <Sheet open={!!sel} onOpenChange={o => !o && setSel(null)}>
            <SheetContent side="bottom" className="max-h-[75vh] gap-0 p-0">
              <SheetHeader className="sr-only"><SheetTitle>Details</SheetTitle><SheetDescription>Selected post or operation</SheetDescription></SheetHeader>
              <ScrollArea className="min-h-0 flex-1 p-4">{sel && <Detail sel={sel} onClose={() => setSel(null)} onUnit={pickUnit} />}</ScrollArea>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <>
          <Card className="absolute top-3 bottom-36 left-3 z-10 w-[360px] gap-3 py-4 backdrop-blur-md">
            <div className="px-4">{header}</div>
            <ScrollArea className="min-h-0 flex-1 px-3">{sidebar}</ScrollArea>
          </Card>
          {sel && (
            <Card className="absolute top-3 right-14 z-10 max-h-[calc(100%-10rem)] w-[380px] py-4 backdrop-blur-md">
              <ScrollArea className="min-h-0 flex-1 px-4">
                <Detail sel={sel} onClose={() => setSel(null)} onUnit={pickUnit} />
              </ScrollArea>
            </Card>
          )}
        </>
      )}

      <Card className="absolute right-3 bottom-8 left-3 z-10 px-4 py-3 backdrop-blur-md">
        <Timeline day={day} max={max} setDay={setDay} playing={playing} setPlaying={setPlaying}
          windowMode={windowMode} setWindowMode={setWindowMode} count={count}
          episodes={data.episodes} onEpisode={openEpisode} />
      </Card>
    </div>
  )
}
