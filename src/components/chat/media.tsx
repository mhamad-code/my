import { ExternalLink, ImageOff } from "lucide-react"
import * as React from "react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { PatternHandler } from "@/components/ui/message"
import { decodeToken, TOKEN_PATTERN } from "@/lib/tokens"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------------ */
/* helpers                                                                  */
/* ------------------------------------------------------------------------ */

function text(value: unknown, max = 400): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

/** Only http(s) ever becomes an href — a model cannot hand us `javascript:`. */
function safeUrl(value: unknown): string | undefined {
  const raw = text(value, 2000)
  if (!raw) return undefined
  try {
    const url = new URL(raw, window.location.origin)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/* ------------------------------------------------------------------------ */
/* media card                                                               */
/* ------------------------------------------------------------------------ */

export function MediaCard({
  src,
  title,
  description,
  page,
  source,
}: {
  src: string
  title: string
  description?: string
  page?: string
  source?: string
}) {
  const [status, setStatus] = React.useState<"loading" | "ready" | "error">("loading")
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    setStatus("loading")
  }, [src])

  return (
    <span
      data-media-card
      className="my-2 flex w-full max-w-full min-w-0 flex-row items-stretch overflow-hidden rounded-xl border bg-card text-card-foreground"
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={status === "error"}
        aria-label={title}
        className="group relative block w-24 shrink-0 cursor-zoom-in self-stretch overflow-hidden bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-default sm:w-36"
      >
        {status !== "error" ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote Wikimedia URLs, not a build-time asset
          <img
            src={src}
            alt={title}
            loading="lazy"
            decoding="async"
            onLoad={() => setStatus("ready")}
            onError={() => setStatus("error")}
            className={cn(
              "h-full w-full object-cover transition-opacity duration-300",
              status === "ready" ? "opacity-100" : "opacity-0"
            )}
          />
        ) : null}
        {status === "loading" ? (
          <span aria-hidden className="absolute inset-0 animate-pulse bg-muted-foreground/10" />
        ) : null}
        {status === "error" ? (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted px-2 text-center text-muted-foreground">
            <ImageOff className="size-4" />
            <span className="line-clamp-2 text-[10.5px] leading-tight">{title}</span>
          </span>
        ) : null}
      </button>

      <span className="flex min-w-0 flex-1 flex-col gap-1 p-3">
        <span className="text-pretty text-[13px] font-medium leading-snug">{title}</span>
        {description ? (
          <span className="line-clamp-3 text-[11.5px] leading-relaxed text-muted-foreground">
            {description}
          </span>
        ) : null}
        <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[10.5px] text-muted-foreground">
          {source ? (
            <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{source}</span>
          ) : null}
          {page ? (
            <a
              href={page}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
            >
              Source page
              <ExternalLink className="size-2.5" />
            </a>
          ) : null}
        </span>
      </span>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(56rem,94vw)] gap-2 p-2 sm:p-3">
          <DialogTitle className="truncate px-1 text-[12.5px] font-medium">{title}</DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element -- full-size view of a remote image */}
          <img
            src={src}
            alt={title}
            className="mx-auto max-h-[72vh] w-auto max-w-full rounded-md bg-muted object-contain"
          />
          {page ? (
            <a
              href={page}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-1 pb-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
            >
              {hostOf(page)}
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </DialogContent>
      </Dialog>
    </span>
  )
}

/* ------------------------------------------------------------------------ */
/* source card                                                              */
/* ------------------------------------------------------------------------ */

function SourceCard({
  index,
  title,
  url,
  snippet,
  source,
}: {
  index?: number
  title: string
  url: string
  snippet?: string
  source?: string
}) {
  const host = hostOf(url)
  const badge = typeof index === "number" ? String(index) : (source || host).slice(0, 1).toUpperCase()
  return (
    <a
      data-media-card
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group my-1.5 flex w-full min-w-0 items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-start no-underline transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
        {badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium text-foreground no-underline">{title}</span>
        <span data-media-muted className="mt-0.5 block truncate text-[10.5px] text-muted-foreground no-underline">
          {source || host}
        </span>
        {snippet ? (
          <span data-media-muted className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-muted-foreground no-underline">
            {snippet}
          </span>
        ) : null}
      </span>
      <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
    </a>
  )
}

/* ------------------------------------------------------------------------ */
/* token rendering                                                          */
/* ------------------------------------------------------------------------ */

function renderToken(match: RegExpExecArray): React.ReactNode {
  const kind = match[1]
  const raw = match[2]
  const payload = decodeToken(raw)
  if (!payload) return match[0]

  if (kind === "img") {
    const src = safeUrl(payload.src)
    const title = text(payload.title, 160) ?? "Image"
    if (!src) return null
    return (
      <MediaCard
        key={raw}
        src={src}
        title={title}
        description={text(payload.description, 240)}
        page={safeUrl(payload.page)}
        source={text(payload.source, 40)}
      />
    )
  }

  const url = safeUrl(payload.url)
  if (!url) return null
  return (
    <SourceCard
      key={raw}
      index={typeof payload.index === "number" ? payload.index : undefined}
      title={text(payload.title, 160) ?? hostOf(url)}
      url={url}
      snippet={text(payload.snippet, 220)}
      source={text(payload.source, 40)}
    />
  )
}

/**
 * A module-level array: the list memoizes rows, and a new identity on every
 * render would re-render the whole transcript while an answer streams.
 */
export const CHAT_PATTERN_HANDLERS: PatternHandler[] = [
  { pattern: TOKEN_PATTERN, render: renderToken },
]

/* ------------------------------------------------------------------------ */
/* lightbox for images the model wrote as plain markdown                    */
/* ------------------------------------------------------------------------ */

/**
 * Wraps the transcript and opens any markdown image in a dialog. It listens in
 * the capture phase so the click never turns into a navigation, and it leaves
 * `[data-media-card]` images alone — those already open their own lightbox.
 *
 * `display: contents` keeps the wrapper out of the message list's flex layout.
 */
export function MarkdownImageLightbox({ children }: { children: React.ReactNode }) {
  const [image, setImage] = React.useState<{ src: string; alt: string } | null>(null)

  return (
    <div
      className="contents"
      onClickCapture={(event) => {
        const target = event.target as HTMLElement | null
        const element = target?.closest?.("img") as HTMLImageElement | null
        if (!element || element.closest("[data-media-card]")) return
        const src = element.currentSrc || element.src
        if (!src) return
        event.preventDefault()
        event.stopPropagation()
        setImage({ src, alt: element.alt })
      }}
    >
      {children}
      <Dialog open={image !== null} onOpenChange={(next) => (next ? undefined : setImage(null))}>
        <DialogContent className="max-w-[min(60rem,94vw)] gap-2 p-2 sm:p-3">
          <DialogTitle className="sr-only">{image?.alt || "Image"}</DialogTitle>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote image opened from the answer
            <img
              src={image.src}
              alt={image.alt}
              className="mx-auto max-h-[76vh] w-auto max-w-full rounded-md object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
