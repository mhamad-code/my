import { ExternalLink, ImageIcon, Loader2, Search } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { PageBody, PageHeader } from "@/components/platform/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  imageSearch,
  webSearch,
  type ImageResult,
  type SearchResult,
} from "@/platform/search"
import { streamChat } from "@/platform/adapters"
import { getProvider } from "@/platform/providers"
import { usePlatform } from "@/store/platform"
import { useT } from "@/i18n"

type Mode = "quick" | "deep" | "images" | "site"

export default function SearchPage() {
  const { t } = useT()
  const settings = usePlatform((state) => state.settings)
  const models = usePlatform((state) => state.models)
  const keys = usePlatform((state) => state.keys)

  const [mode, setMode] = React.useState<Mode>("quick")
  const [query, setQuery] = React.useState("")
  const [site, setSite] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [images, setImages] = React.useState<ImageResult[]>([])
  const [answer, setAnswer] = React.useState("")
  const [status, setStatus] = React.useState("")
  const [error, setError] = React.useState("")

  const providerLabel =
    settings?.searchProvider === "wikimedia"
      ? "Wikipedia / Wikimedia (no key needed)"
      : settings?.searchProvider === "none"
        ? "Not configured"
        : settings?.searchProvider

  const run = async () => {
    if (!query.trim() || !settings) return
    setBusy(true)
    setError("")
    setAnswer("")
    setResults([])
    setImages([])
    setStatus("")
    try {
      if (mode === "images") {
        setStatus("Searching Wikimedia Commons and Wikipedia…")
        const found = await imageSearch(query.trim(), 8)
        setImages(found)
        setStatus(found.length ? `${found.length} images` : t("searchPage.noResults"))
        return
      }

      const searchQuery = mode === "site" && site.trim() ? `${query.trim()} site:${site.trim()}` : query.trim()
      setStatus(mode === "deep" ? "Running multiple searches…" : "Searching…")
      const config = { provider: settings.searchProvider, apiKey: settings.searchApiKey }
      const first = await webSearch(searchQuery, config, 8)

      if (mode !== "deep") {
        setResults(first)
        setStatus(first.length ? `${first.length} sources` : t("searchPage.noResults"))
        return
      }

      const variants = [searchQuery, `${searchQuery} explained`, `${searchQuery} latest`]
      const batches = await Promise.all(
        variants.map((variant) => webSearch(variant, config, 6).catch(() => [] as SearchResult[]))
      )
      const merged = new Map<string, SearchResult>()
      for (const item of [...first, ...batches.flat()]) {
        if (!merged.has(item.url)) merged.set(item.url, item)
      }
      const all = Array.from(merged.values()).slice(0, 14)
      setResults(all)
      if (!all.length) {
        setStatus(t("searchPage.noResults"))
        return
      }

      const model = settings.defaultProviderId
        ? models.find(
            (item) =>
              item.providerId === settings.defaultProviderId && item.id === settings.defaultModelId
          )
        : models[0]
      const key = model ? keys.find((item) => item.providerId === model.providerId) : undefined
      const provider = model ? getProvider(model.providerId) : undefined
      if (!model || !key || !provider) {
        setStatus("Sources collected. Connect a chat model to synthesise them.")
        return
      }

      setStatus("Comparing sources with your model…")
      const sourceList = all
        .map((item, index) => `[${index + 1}] ${item.title} — ${item.url}\n${item.snippet ?? ""}`)
        .join("\n\n")
      let text = ""
      for await (const event of streamChat({
        provider,
        credentials: { apiKey: key.apiKey, endpoint: key.endpoint, apiVersion: key.apiVersion },
        model: model.id,
        system:
          "You are a research assistant. Compare the provided sources, answer the user's question, and cite every claim with [n] matching the source list. Say when the sources disagree or are insufficient. Never invent sources.",
        turns: [
          {
            role: "user",
            content: `Question: ${query.trim()}\n\nSources:\n${sourceList}`,
          },
        ],
      })) {
        if (event.type === "text") {
          text += event.text
          setAnswer(text)
        }
      }
      setStatus(`Deep research complete · ${all.length} sources · ${model.name}`)
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Search failed."
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("searchPage.title")} description={t("searchPage.subtitle")} />
      <PageBody>
        <Card className="mb-4">
          <CardContent className="space-y-3 p-4">
            <Tabs value={mode} onValueChange={(value) => setMode(value as Mode)}>
              <TabsList className="h-8">
                <TabsTrigger value="quick" className="text-[11.5px]">
                  {t("searchPage.quick")}
                </TabsTrigger>
                <TabsTrigger value="deep" className="text-[11.5px]">
                  {t("searchPage.deep")}
                </TabsTrigger>
                <TabsTrigger value="images" className="text-[11.5px]">
                  {t("searchPage.images")}
                </TabsTrigger>
                <TabsTrigger value="site" className="text-[11.5px]">
                  {t("searchPage.site")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void run()
                }}
                placeholder={t("searchPage.query")}
                className="h-9 text-[12.5px]"
              />
              {mode === "site" ? (
                <Input
                  value={site}
                  onChange={(event) => setSite(event.target.value)}
                  placeholder={t("searchPage.sitePlaceholder")}
                  className="h-9 text-[12.5px] sm:max-w-[200px]"
                />
              ) : null}
              <Button className="h-9 gap-1.5" onClick={() => void run()} disabled={busy || !query.trim()}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                {t("searchPage.run")}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t("settings.searchProvider")}: <span className="text-foreground">{providerLabel}</span>
              {mode === "deep" ? ` · ${t("searchPage.deepHint")}` : ""}
            </p>
          </CardContent>
        </Card>

        {error ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle className="text-[12.5px]">{t("errors.network")}</AlertTitle>
            <AlertDescription className="text-[12px]">{error}</AlertDescription>
          </Alert>
        ) : null}

        {status ? (
          <p className="mb-3 flex items-center gap-2 text-[11.5px] text-muted-foreground">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {status}
          </p>
        ) : null}

        {answer ? (
          <Card className="mb-4">
            <CardContent className="p-4">
              <h2 className="mb-2 text-[13px] font-medium">{t("searchPage.deep")}</h2>
              <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{answer}</div>
            </CardContent>
          </Card>
        ) : null}

        {images.length ? (
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image) => (
              <figure key={image.imageUrl} className="overflow-hidden rounded-lg border bg-card">
                <img
                  src={image.imageUrl}
                  alt={image.title}
                  loading="lazy"
                  className="aspect-[4/3] w-full object-cover"
                />
                <figcaption className="space-y-1 p-2.5">
                  <p className="line-clamp-1 text-[12px] font-medium">{image.title}</p>
                  <p className="text-[10.5px] text-muted-foreground">
                    {image.source}
                    {image.license ? ` · ${image.license}` : ""}
                    {image.author ? ` · ${image.author}` : ""}
                  </p>
                  <a
                    href={image.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10.5px] text-primary hover:underline"
                  >
                    {t("searchPage.sources")}
                    <ExternalLink className="size-2.5" />
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : null}

        {results.length ? (
          <div>
            <h2 className="mb-2 text-[13px] font-medium">{t("searchPage.sources")}</h2>
            <ol className="space-y-2.5">
              {results.map((result, index) => (
                <li key={result.url} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded bg-muted text-[10px] text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[12.5px] font-medium hover:underline"
                      >
                        {result.title}
                      </a>
                      <p className="truncate text-[10.5px] text-muted-foreground">{result.url}</p>
                      {result.snippet ? (
                        <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                          {result.snippet}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {result.source}
                        {result.published ? ` · ${result.published}` : ""}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {!busy && !results.length && !images.length && !answer && !error ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <ImageIcon className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="text-[12.5px] text-muted-foreground">{t("searchPage.subtitle")}</p>
          </div>
        ) : null}

        <div className="mt-6 text-[10.5px] leading-relaxed text-muted-foreground">
          <Label className="text-[10.5px] font-normal">
            Search providers and their keys are configured in Settings → Search. Wikipedia and
            Wikimedia Commons are queried anonymously and return their real source pages, licences and
            authors.
          </Label>
        </div>
      </PageBody>
    </div>
  )
}
