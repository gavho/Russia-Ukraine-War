import { MapPin, X } from "lucide-react"
import { Embed } from "@/components/Embed"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CATEGORIES, type Episode, type EventFeature } from "@/lib/data"

export type Selection = { kind: "event"; f: EventFeature } | { kind: "episode"; e: Episode }

export function Detail({ sel, onClose, onUnit }: { sel: Selection; onClose: () => void; onUnit: (u: string) => void }) {
  return (
    <div className="relative space-y-3">
      <Button size="icon" variant="ghost" className="absolute -top-1 -right-1 size-8" onClick={onClose} aria-label="Close details"><X /></Button>
      {sel.kind === "event" ? <EventDetail f={sel.f} onUnit={onUnit} /> : <EpisodeDetail e={sel.e} />}
    </div>
  )
}

function EventDetail({ f, onUnit }: { f: EventFeature; onUnit: (u: string) => void }) {
  const p = f.properties
  const color = CATEGORIES.find(c => c[0] === p.c)?.[1]
  return (
    <>
      <div className="pr-8">
        <div className="text-sm font-semibold text-primary">{p.d}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="outline"><span className="size-2 rounded-full" style={{ background: color }} />{p.c}</Badge>
          {p.un?.map(u => (
            <Badge key={u} variant="secondary" className="cursor-pointer" onClick={() => onUnit(u)}>{u}</Badge>
          ))}
        </div>
      </div>
      {p.t && <p className="text-sm leading-relaxed">{p.t}</p>}
      {p.p && <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="size-3" />{p.p} · via {p.s}</p>}
      {/* key: reset the click-to-load state when another point is picked */}
      <Embed key={p.u} url={p.u} graphic={p.g} />
    </>
  )
}

function EpisodeDetail({ e }: { e: Episode }) {
  return (
    <>
      <div className="pr-8">
        <div className="text-xs text-muted-foreground">{e.start} → {e.end}</div>
        <div className="text-base font-semibold">{e.title}</div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <Badge variant="outline" className={e.side === "UA" ? "border-sky-400/40 text-sky-300" : "border-red-400/40 text-red-300"}>{e.unit}</Badge>
          <Badge variant="secondary"><MapPin className="size-3" />{e.place}</Badge>
        </div>
      </div>
      {e.notes && <p className="text-sm leading-relaxed text-muted-foreground">{e.notes}</p>}
      <div className="space-y-4">
        {e.videos.map(v => <Embed key={v.url} url={v.url} label={v.label} graphic={0} />)}
      </div>
      {e.sources?.length ? (
        <div className="text-xs text-muted-foreground">
          Sources:{" "}
          {e.sources.map((s, i) => (
            <span key={s}>{i > 0 && ", "}<a className="text-sky-300 hover:underline" href={s} target="_blank" rel="noopener noreferrer">{new URL(s).hostname.replace(/^www\./, "")}</a></span>
          ))}
        </div>
      ) : null}
    </>
  )
}
