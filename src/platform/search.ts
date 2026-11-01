/**
 * Search + image search backends.
 *
 * Only endpoints that are reachable from a browser are used. Wikimedia's APIs
 * are anonymous CORS-enabled; Tavily, Brave and Serper are called with the
 * user's own key and may be blocked by CORS — failures are surfaced verbatim
 * instead of being hidden behind fake results.
 */

import { encodeToken } from "../lib/tokens.ts"

export type SearchResult = {
  title: string
  url: string
  snippet?: string
  published?: string
  source: string
}

export type ImageResult = {
  title: string
  imageUrl: string
  pageUrl: string
  source: "Wikimedia Commons" | "Wikipedia"
  license?: string
  author?: string
  width?: number
  height?: number
}

export type SearchProviderId = "wikimedia" | "tavily" | "brave" | "serper" | "none"

export type SearchConfig = {
  provider: SearchProviderId
  apiKey?: string
}

const WIKI_UA = "AI-Platform/1.0 (local-first desktop app)"

function stripHtml(value: string | undefined): string | undefined {
  if (!value) return undefined
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim()
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    const body = await response.text().catch(() => "")
    throw new Error(`${response.status} ${response.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`)
  }
  return (await response.json()) as T
}

/* -------------------------------------------------------------------------- */
/* Web search                                                                  */
/* -------------------------------------------------------------------------- */

async function wikimediaSearch(query: string, limit: number): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: query,
    gsrlimit: String(limit),
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    exsentences: "2",
    inprop: "url",
    utf8: "1",
  })
  const payload = await getJson<{
    query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string; index?: number }> }
  }>(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: { "Api-User-Agent": WIKI_UA },
  })
  const pages = Object.values(payload.query?.pages ?? {})
  return pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((page) => ({
      title: page.title,
      url: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      snippet: page.extract,
      source: "Wikipedia",
    }))
}

async function tavilySearch(
  query: string,
  limit: number,
  apiKey: string
): Promise<SearchResult[]> {
  const payload = await getJson<{
    results?: { title?: string; url?: string; content?: string; published_date?: string }[]
  }>("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: limit,
      search_depth: "basic",
      include_answer: false,
    }),
  })
  return (payload.results ?? [])
    .filter((result) => result.url)
    .map((result) => ({
      title: result.title ?? result.url ?? "",
      url: result.url as string,
      snippet: result.content?.slice(0, 400),
      published: result.published_date,
      source: "Tavily",
    }))
}

async function braveSearch(query: string, limit: number, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q: query, count: String(limit) })
  const payload = await getJson<{
    web?: { results?: { title?: string; url?: string; description?: string; age?: string }[] }
  }>(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
  })
  return (payload.web?.results ?? [])
    .filter((result) => result.url)
    .map((result) => ({
      title: result.title ?? result.url ?? "",
      url: result.url as string,
      snippet: stripHtml(result.description),
      published: result.age,
      source: "Brave",
    }))
}

async function serperSearch(query: string, limit: number, apiKey: string): Promise<SearchResult[]> {
  const payload = await getJson<{
    organic?: { title?: string; link?: string; snippet?: string; date?: string }[]
  }>("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
    body: JSON.stringify({ q: query, num: limit }),
  })
  return (payload.organic ?? [])
    .filter((result) => result.link)
    .map((result) => ({
      title: result.title ?? result.link ?? "",
      url: result.link as string,
      snippet: result.snippet,
      published: result.date,
      source: "Google (Serper)",
    }))
}

export async function webSearch(
  query: string,
  config: SearchConfig,
  limit = 6
): Promise<SearchResult[]> {
  switch (config.provider) {
    case "wikimedia":
      return wikimediaSearch(query, limit)
    case "tavily":
      if (!config.apiKey) throw new Error("Add a Tavily API key in Settings → Search.")
      return tavilySearch(query, limit, config.apiKey)
    case "brave":
      if (!config.apiKey) throw new Error("Add a Brave Search API key in Settings → Search.")
      return braveSearch(query, limit, config.apiKey)
    case "serper":
      if (!config.apiKey) throw new Error("Add a Serper API key in Settings → Search.")
      return serperSearch(query, limit, config.apiKey)
    default:
      throw new Error("No search provider is configured. Settings → Search.")
  }
}

/* -------------------------------------------------------------------------- */
/* Image search (Wikimedia Commons + Wikipedia page images)                     */
/* -------------------------------------------------------------------------- */

type CommonsResponse = {
  query?: {
    pages?: Record<
      string,
      {
        title: string
        imageinfo?: {
          thumburl?: string
          url?: string
          width?: number
          height?: number
          descriptionurl?: string
          extmetadata?: Record<string, { value?: string }>
        }[]
      }
    >
  }
}

async function commonsImages(query: string, limit: number): Promise<ImageResult[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    prop: "imageinfo",
    iiprop: "url|extmetadata|size",
    iiurlwidth: "900",
  })
  const payload = await getJson<CommonsResponse>(
    `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
    { headers: { "Api-User-Agent": WIKI_UA } }
  )
  const pages = Object.values(payload.query?.pages ?? {})
  return pages
    .map((page): ImageResult | null => {
      const info = page.imageinfo?.[0]
      const imageUrl = info?.thumburl ?? info?.url
      if (!imageUrl) return null
      const meta = info?.extmetadata ?? {}
      return {
        title: page.title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
        imageUrl,
        pageUrl: info?.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
        source: "Wikimedia Commons",
        license: stripHtml(meta.LicenseShortName?.value),
        author: stripHtml(meta.Artist?.value),
        width: info?.width,
        height: info?.height,
      }
    })
    .filter((image): image is ImageResult => image !== null)
}

async function wikipediaImages(query: string, limit: number): Promise<ImageResult[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: query,
    gsrlimit: String(limit),
    prop: "pageimages|info",
    piprop: "thumbnail|name",
    pithumbsize: "900",
    inprop: "url",
  })
  const payload = await getJson<{
    query?: {
      pages?: Record<
        string,
        {
          title: string
          fullurl?: string
          thumbnail?: { source?: string; width?: number; height?: number }
        }
      >
    }
  }>(`https://en.wikipedia.org/w/api.php?${params.toString()}`, {
    headers: { "Api-User-Agent": WIKI_UA },
  })
  return Object.values(payload.query?.pages ?? {})
    .filter((page) => page.thumbnail?.source)
    .map((page) => ({
      title: page.title,
      imageUrl: page.thumbnail?.source as string,
      pageUrl: page.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
      source: "Wikipedia" as const,
      width: page.thumbnail?.width,
      height: page.thumbnail?.height,
    }))
}

/** Deduplicated image results from the two Wikimedia surfaces. */
export async function imageSearch(query: string, limit = 6): Promise<ImageResult[]> {
  const results: ImageResult[] = []
  const errors: string[] = []
  const requests = [wikipediaImages(query, Math.ceil(limit / 2)), commonsImages(query, limit)]
  const settled = await Promise.allSettled(requests)
  for (const [index, outcome] of settled.entries()) {
    if (outcome.status === "fulfilled") results.push(...outcome.value)
    else errors.push(`${index === 0 ? "Wikipedia" : "Wikimedia Commons"}: ${String(outcome.reason)}`)
  }
  const seen = new Set<string>()
  const unique = results.filter((image) => {
    if (seen.has(image.imageUrl)) return false
    seen.add(image.imageUrl)
    return true
  })
  if (unique.length === 0 && errors.length) {
    throw new Error(`Image search failed. ${errors.join(" · ")}`)
  }
  return unique.slice(0, limit)
}

/**
 * One token per image/source. The chat renders these through
 * `CHAT_PATTERN_HANDLERS` as compact cards; raw markdown images inside an answer
 * are still constrained by the transcript styles as a fallback.
 */
export function imageResultMarkdown(images: ImageResult[]): string {
  return images
    .map((image) => {
      const credit = [
        image.author ? `Photo: ${image.author}` : undefined,
        image.license ? `License: ${image.license}` : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
      return encodeToken("img", {
        src: image.imageUrl,
        title: image.title,
        description: credit || undefined,
        page: image.pageUrl,
        source: image.source,
      })
    })
    .join("\n\n")
}

export function searchResultMarkdown(results: SearchResult[]): string {
  return results
    .map((result, index) =>
      encodeToken("src", {
        index: index + 1,
        title: result.title,
        url: result.url,
        snippet: result.snippet?.slice(0, 220),
        source: result.published ? `${result.source} · ${result.published}` : result.source,
      })
    )
    .join("\n\n")
}
