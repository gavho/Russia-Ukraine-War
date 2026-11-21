import { ExternalLink, Play, TriangleAlert } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { GRAPHIC } from "@/lib/data"

declare global {
  interface Window { twttr?: { widgets: { createTweet: (id: string, el: HTMLElement, o: object) => Promise<HTMLElement | undefined> } } }
}

const scripts: Record<string, Promise<void>> = {}
const loadScript = (src: string) =>
  (scripts[src] ??= new Promise((res, rej) => {
    const s = document.createElement("script")
    s.src = src; s.async = true; s.onload = () => res(); s.onerror = rej
    document.head.append(s)
  }))

type Kind = { type: "telegram"; post: string } | { type: "x"; id: string } | { type: "youtube"; id: string } | { type: "link" }

export function kindOf(url: string): Kind {
  let u: URL
  try { u = new URL(url) } catch { return { type: "link" } }
  const host = u.hostname.replace(/^(www|m|mobile)\./, "")
  let m: RegExpMatchArray | null | undefined
  if (host === "t.me" && (m = u.pathname.match(/^\/(?:s\/)?([A-Za-z0-9_]{4,})\/(\d+)/))) return { type: "telegram", post: `${m[1]}/${m[2]}` }
  if ((host === "twitter.com" || host === "x.com") && (m = u.pathname.match(/\/status(?:es)?\/(\d+)/))) return { type: "x", id: m[1] }
  if (host === "youtu.be" && (m = u.pathname.match(/^\/([\w-]{11})/))) return { type: "youtube", id: m[1] }
  if (host === "youtube.com") {
    const id = u.searchParams.get("v")?.match(/^[\w-]{11}$/)?.[0] ?? u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1]
    if (id) return { type: "youtube", id }
  }
  return { type: "link" }
}

/** Shows a warning and loads the original post only after the viewer asks for it. */
export function Embed({ url, graphic, label }: { url: string; graphic?: number; label?: string }) {
  const [open, setOpen] = useState(false)
  const safe = /^https?:\/\//i.test(url)
  if (!safe) return null
  const host = new URL(url).hostname.replace(/^www\./, "")
  const kind = kindOf(url)

  return (
    <div className="space-y-2">
      {label && <div className="text-sm font-medium">{label}</div>}
      {!open && (
        <>
          {graphic !== undefined && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>Graphic content: <b>{GRAPHIC[graphic] ?? "Unrated"}</b>. Loads from {host}.</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {kind.type !== "link" && (
              <Button size="sm" onClick={() => setOpen(true)}><Play /> Load video</Button>
            )}
            <Button size="sm" variant="ghost" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">Open original <ExternalLink /></a>
            </Button>
          </div>
        </>
      )}
      {open && <Player kind={kind} url={url} />}
    </div>
  )
}

function Player({ kind, url }: { kind: Kind; url: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return // YouTube renders its own iframe
    if (kind.type === "telegram") {
      // Telegram's widget reads its settings from its own <script> tag.
      const s = document.createElement("script")
      s.async = true; s.src = "https://telegram.org/js/telegram-widget.js?22"
      s.dataset.telegramPost = kind.post; s.dataset.width = "100%"; s.dataset.dark = "1"
      el.append(s)
    } else if (kind.type === "x") {
      loadScript("https://platform.twitter.com/widgets.js")
        .then(() => window.twttr!.widgets.createTweet(kind.id, el, { theme: "dark", dnt: true }))
        .then(r => { if (!r) setFailed(true) })
        .catch(() => setFailed(true))
    }
    return () => { el.replaceChildren() }
  }, [kind])

  return (
    <div className="space-y-2">
      {failed && <p className="text-xs text-muted-foreground">Couldn't load this post. It may be deleted or private.</p>}
      {kind.type === "youtube" ? (
        <iframe className="aspect-video w-full rounded-md" src={`https://www.youtube-nocookie.com/embed/${kind.id}`}
          title="YouTube video" allow="encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
      ) : (
        <div ref={box} className="min-h-10" />
      )}
      <a className="inline-flex items-center gap-1 text-xs text-sky-300 hover:underline" href={url} target="_blank" rel="noopener noreferrer">
        Open original <ExternalLink className="size-3" />
      </a>
    </div>
  )
}
