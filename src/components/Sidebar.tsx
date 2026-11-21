import { Film, Layers, Shield } from "lucide-react"
import { useMemo } from "react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Checkbox } from "@/components/ui/checkbox"
import { DirectionAwareTabs } from "@/components/ui/direction-aware-tabs"
import { RollingNumber } from "@/components/ui/rolling-number"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  CATEGORIES, FRONT_COLORS, dateOf, fmtKm2,
  type Episode, type EventFeature, type FrontStats,
} from "@/lib/data"

export type Layers = { front: boolean; changes: boolean; heat: boolean }

type Props = {
  events: EventFeature[]
  episodes: Episode[]
  stats: FrontStats
  day: number
  frontDate: string
  categories: Set<string>
  setCategories: (s: Set<string>) => void
  hideGraphic: boolean
  setHideGraphic: (b: boolean) => void
  unit: string | null
  setUnit: (u: string | null) => void
  layers: Layers
  setLayers: (l: Layers) => void
  onEpisode: (e: Episode) => void
}

export function Sidebar(p: Props) {
  const tabs = [
    { id: 0, label: <span className="flex items-center gap-1.5"><Film className="size-3.5" />Footage</span>, content: <FootageTab {...p} /> },
    { id: 1, label: <span className="flex items-center gap-1.5"><Shield className="size-3.5" />Units</span>, content: <UnitsTab {...p} /> },
    { id: 2, label: <span className="flex items-center gap-1.5"><Layers className="size-3.5" />Territory</span>, content: <TerritoryTab {...p} /> },
  ]
  return <DirectionAwareTabs tabs={tabs} className="mx-auto w-fit bg-secondary" />
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-2">
    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
    {children}
  </div>
)

const Row = ({ id, label, checked, onChange, swatch }: { id: string; label: React.ReactNode; checked: boolean; onChange: (b: boolean) => void; swatch?: string }) => (
  <label htmlFor={id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1 text-sm hover:bg-accent/50">
    <Checkbox id={id} checked={checked} onCheckedChange={v => onChange(v === true)} />
    {swatch && <span className="size-2.5 shrink-0 rounded-full" style={{ background: swatch }} />}
    <span className="flex-1">{label}</span>
  </label>
)

const Toggle = ({ id, label, hint, checked, onChange }: { id: string; label: string; hint?: string; checked: boolean; onChange: (b: boolean) => void }) => (
  <div className="flex items-center justify-between gap-3 py-1">
    <label htmlFor={id} className="text-sm">{label}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>
    <Switch id={id} checked={checked} onCheckedChange={onChange} />
  </div>
)

function FootageTab({ events, categories, setCategories, hideGraphic, setHideGraphic, layers, setLayers }: Props) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const f of events) c[f.properties.c] = (c[f.properties.c] ?? 0) + 1
    return c
  }, [events])
  const flip = (name: string, on: boolean) => {
    const next = new Set(categories)
    if (on) next.add(name); else next.delete(name)
    setCategories(next)
  }
  return (
    <div className="space-y-4 px-1 pt-3">
      <Section title="Categories">
        <div>
          {CATEGORIES.filter(([n]) => counts[n]).map(([name, color]) => (
            <Row key={name} id={`cat-${name}`} swatch={color} checked={categories.has(name)} onChange={on => flip(name, on)}
              label={<span className="flex justify-between gap-2"><span>{name}</span><span className="tabular-nums text-muted-foreground">{counts[name].toLocaleString()}</span></span>} />
          ))}
        </div>
      </Section>
      <Separator />
      <Toggle id="hide-graphic" label="Hide severe & graphic" hint="Ratings 4–5 from CIR" checked={hideGraphic} onChange={setHideGraphic} />
      <Toggle id="heat" label="Density glow" hint="Heatmap at low zoom" checked={layers.heat} onChange={heat => setLayers({ ...layers, heat })} />
    </div>
  )
}

function UnitsTab({ events, episodes, unit, setUnit, onEpisode, day }: Props) {
  const units = useMemo(() => {
    const c = new Map<string, number>()
    for (const f of events) for (const u of f.properties.un ?? []) c.set(u, (c.get(u) ?? 0) + 1)
    return [...c].sort((a, b) => b[1] - a[1])
  }, [events])
  const date = dateOf(day)
  return (
    <div className="space-y-4 px-1 pt-3">
      <Section title="Operations & long-form footage">
        {episodes.length === 0 && <p className="text-sm text-muted-foreground">No episodes yet. Add them to <code>public/data/episodes.json</code>.</p>}
        <div className="space-y-2">
          {episodes.map(e => {
            const live = e.start <= date && date <= e.end
            return (
              <button key={e.id} onClick={() => onEpisode(e)}
                className="w-full rounded-lg border bg-secondary/40 p-3 text-left transition hover:border-primary/50 hover:bg-secondary">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.title}</span>
                  {live && <Badge className="bg-primary/20 text-primary">On timeline</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Badge variant="outline" className={e.side === "UA" ? "border-sky-400/40 text-sky-300" : "border-red-400/40 text-red-300"}>{e.unit}</Badge>
                  <span>{e.start} → {e.end}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{e.place} · {e.videos.length} video{e.videos.length === 1 ? "" : "s"}</div>
              </button>
            )
          })}
        </div>
      </Section>
      <Separator />
      <Section title="Posts that name a unit">
        <p className="text-xs text-muted-foreground">Matched from post descriptions, so coverage is partial. Pick one to filter the map.</p>
        <div className="flex flex-wrap gap-1.5">
          <UnitChip active={!unit} onClick={() => setUnit(null)}>All posts</UnitChip>
          {units.map(([u, n]) => (
            <UnitChip key={u} active={unit === u} onClick={() => setUnit(unit === u ? null : u)}>
              {u} <span className="tabular-nums opacity-60">{n}</span>
            </UnitChip>
          ))}
        </div>
      </Section>
    </div>
  )
}

const UnitChip = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} aria-pressed={active}
    className={`rounded-full border px-2.5 py-1 text-xs transition ${active ? "border-primary bg-primary/15 text-primary" : "border-border hover:bg-accent"}`}>
    {children}
  </button>
)

const areaConfig = { occ: { label: "Occupied since 2022", color: FRONT_COLORS.occupied } } satisfies ChartConfig
const changeConfig = {
  gain: { label: "Russian gains", color: FRONT_COLORS.gain },
  loss: { label: "Ukrainian gains", color: FRONT_COLORS.loss },
} satisfies ChartConfig

function TerritoryTab({ stats, frontDate, layers, setLayers }: Props) {
  const weeks = stats.weeks
  const i = Math.max(0, weeks.findIndex(w => w.d === frontDate))
  const cur = weeks[i]
  const last4 = weeks.slice(Math.max(1, i - 3), i + 1)
  const net4 = last4.reduce((s, w) => s + w.gain - w.loss, 0)
  // Skip the first weeks: early-war snapshots were drawn coarsely, so their "changes" are mostly redrawing.
  const changeData = weeks.slice(4).map(w => ({ d: w.d, gain: w.gain, loss: -w.loss }))
  return (
    <div className="space-y-4 px-1 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Occupied (total)" value={cur.occ + stats.prewar_km2} />
        <Stat label="Since 24 Feb 2022" value={cur.occ} />
        <Stat label="Change, last 4 weeks" value={net4} signed />
        <Stat label="Contested" value={cur.con} />
      </div>
      <p className="text-xs text-muted-foreground">Week of {frontDate}. Areas from DeepStateMap; km² are approximate.</p>

      <Section title="Occupied area since the invasion">
        <ChartContainer config={areaConfig} className="aspect-auto h-32 w-full">
          <AreaChart data={weeks} margin={{ left: 0, right: 4, top: 4 }}>
            <CartesianGrid vertical={false} strokeOpacity={0.15} />
            <XAxis dataKey="d" tickFormatter={d => d.slice(0, 4)} minTickGap={40} tickLine={false} axisLine={false} fontSize={10} />
            <YAxis width={36} tickFormatter={v => `${Math.round(v / 1000)}k`} tickLine={false} axisLine={false} fontSize={10} domain={["dataMin - 5000", "dataMax + 5000"]} />
            <ChartTooltip content={<ChartTooltipContent formatter={v => fmtKm2(Number(v))} />} />
            <Area dataKey="occ" type="monotone" fill="var(--color-occ)" fillOpacity={0.25} stroke="var(--color-occ)" strokeWidth={1.5} isAnimationActive={false} />
            <ReferenceLine x={frontDate} stroke="var(--primary)" strokeDasharray="3 3" />
          </AreaChart>
        </ChartContainer>
      </Section>

      <Section title="Weekly change">
        <ChartContainer config={changeConfig} className="aspect-auto h-28 w-full">
          <BarChart data={changeData} margin={{ left: 0, right: 4, top: 4 }} stackOffset="sign">
            <XAxis dataKey="d" tickFormatter={d => d.slice(0, 4)} minTickGap={40} tickLine={false} axisLine={false} fontSize={10} />
            <YAxis width={36} tickLine={false} axisLine={false} fontSize={10} />
            <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => `${changeConfig[n as "gain" | "loss"].label}: ${fmtKm2(Math.abs(Number(v)))}`} />} />
            <Bar dataKey="gain" stackId="a" fill="var(--color-gain)" isAnimationActive={false} />
            <Bar dataKey="loss" stackId="a" fill="var(--color-loss)" isAnimationActive={false} />
            <ReferenceLine x={frontDate} stroke="var(--primary)" strokeDasharray="3 3" />
          </BarChart>
        </ChartContainer>
      </Section>

      <Separator />
      <Toggle id="front" label="Front line & occupied areas" checked={layers.front} onChange={front => setLayers({ ...layers, front })} />
      <Toggle id="changes" label="This week's changes" hint="Orange: Russian gains · Blue: Ukrainian gains" checked={layers.changes} onChange={changes => setLayers({ ...layers, changes })} />
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {([["prewar", "Held before 2022"], ["occupied", "Occupied"], ["unknown", "Contested"], ["gain", "RU gain"], ["loss", "UA gain"]] as const).map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: FRONT_COLORS[k] }} />{l}</span>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, signed }: { label: string; value: number; signed?: boolean }) {
  return (
    <div className="rounded-lg border bg-secondary/40 p-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-base font-semibold tabular-nums">
        <RollingNumber value={Math.round(value)} format={v => `${signed && v > 0 ? "+" : ""}${Math.round(v).toLocaleString()}`} />
        <span className="ml-1 text-xs font-normal text-muted-foreground">km²</span>
      </div>
    </div>
  )
}
