import { Pause, Play } from "lucide-react"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { HaloSegmented } from "@/components/ui/halo-segmented"
import { RollingNumber } from "@/components/ui/rolling-number"
import { Slider } from "@/components/ui/slider"
import { dateOf, dayOf, type Episode } from "@/lib/data"

export type Window = "7" | "30" | "all"

type Props = {
  day: number
  max: number
  setDay: (d: number) => void
  playing: boolean
  setPlaying: (b: boolean) => void
  windowMode: Window
  setWindowMode: (w: Window) => void
  count: number
  episodes: Episode[]
  onEpisode: (e: Episode) => void
}

const fmtDate = (n: number) =>
  new Date(dateOf(n) + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

export function Timeline(p: Props) {
  useEffect(() => {
    if (!p.playing) return
    const t = setInterval(() => {
      const next = Math.min(p.day + 7, p.max)
      p.setDay(next)
      if (next >= p.max) p.setPlaying(false)
    }, 220)
    return () => clearInterval(t)
  }, [p.playing, p.day, p.max])

  const togglePlay = () => {
    if (!p.playing && p.day >= p.max) p.setDay(0)
    p.setPlaying(!p.playing)
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <Button size="icon" className="rounded-full" onClick={togglePlay} aria-label={p.playing ? "Pause timeline" : "Play timeline"}>
          {p.playing ? <Pause /> : <Play />}
        </Button>
        <div className="min-w-32">
          <div className="text-lg font-semibold tabular-nums text-primary" aria-live="polite">{fmtDate(p.day)}</div>
          <div className="text-xs text-muted-foreground">Day {p.day + 1} of the full-scale invasion</div>
        </div>
      </div>

      <div className="relative flex-1 py-2">
        {/* Episode markers above the slider; click to jump there. */}
        <div className="pointer-events-none absolute inset-x-0 -top-1 h-2">
          {p.episodes.map(e => (
            <button key={e.id} title={`${e.unit}: ${e.title}`} aria-label={`Jump to ${e.title}`}
              onClick={() => p.onEpisode(e)}
              className="pointer-events-auto absolute h-2 rounded-full bg-sky-400/80 hover:bg-sky-300"
              style={{
                left: `${(dayOf(e.start) / p.max) * 100}%`,
                width: `max(6px, ${((dayOf(e.end) - dayOf(e.start)) / p.max) * 100}%)`,
              }} />
          ))}
        </div>
        <Slider value={[p.day]} min={0} max={p.max} step={1} aria-label="Date"
          onValueChange={([v]) => { p.setPlaying(false); p.setDay(v) }} />
        <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
          {[2022, 2023, 2024, 2025, 2026].map(y => <span key={y}>{y}</span>)}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <HaloSegmented value={p.windowMode} onValueChange={v => p.setWindowMode(v as Window)}
          items={[{ value: "7", label: "±7d" }, { value: "30", label: "±30d" }, { value: "all", label: "All to date" }]} />
        <div className="text-right text-xs text-muted-foreground">
          <div className="text-sm font-semibold text-foreground tabular-nums"><RollingNumber value={p.count} format={v => Math.round(v).toLocaleString()} /></div>
          posts
        </div>
      </div>
    </div>
  )
}
