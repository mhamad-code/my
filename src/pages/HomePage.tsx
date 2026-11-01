import {
  ArrowRight,
  Boxes,
  FolderKanban,
  Library,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
} from "lucide-react"
import * as React from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Link, useNavigate } from "react-router-dom"

import { PageBody } from "@/components/platform/PageHeader"
import { ProviderLogo } from "@/components/platform/ProviderLogo"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { listConversations, listFiles, listProjects } from "@/lib/db"
import { CAPABILITY_LABELS, getProvider, PROVIDERS } from "@/platform/providers"
import { availableToolSpecs } from "@/platform/tools"
import { usePlatform } from "@/store/platform"
import { useSession } from "@/store/session"
import { useT } from "@/i18n"
import { formatBytes } from "@/lib/files"

export default function HomePage() {
  const { t, language } = useT()
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const settings = usePlatform((state) => state.settings)
  const keys = usePlatform((state) => state.keys)
  const models = usePlatform((state) => state.models)
  const [prompt, setPrompt] = React.useState("")
  const [modelKey, setModelKey] = React.useState("")

  const conversations = useLiveQuery(
    () => (user ? listConversations(user.uid) : Promise.resolve([])),
    [user?.uid],
    []
  )
  const projects = useLiveQuery(
    () => (user ? listProjects(user.uid) : Promise.resolve([])),
    [user?.uid],
    []
  )
  const files = useLiveQuery(
    () => (user ? listFiles(user.uid) : Promise.resolve([])),
    [user?.uid],
    []
  )

  React.useEffect(() => {
    if (modelKey || !models.length) return
    const preferred = settings?.defaultProviderId
      ? models.find(
          (model) =>
            model.providerId === settings.defaultProviderId && model.id === settings.defaultModelId
        )
      : undefined
    const first = preferred ?? models[0]
    setModelKey(`${first.providerId}:${first.id}`)
  }, [modelKey, models, settings])

  const connectedProviders = keys
    .filter((key) => key.status === "verified")
    .map((key) => getProvider(key.providerId))
    .filter(Boolean)

  const favorites = (settings?.favoriteModels ?? [])
    .map((key) => {
      const [providerId, ...rest] = key.split(":")
      return models.find((model) => model.providerId === providerId && model.id === rest.join(":"))
    })
    .filter(Boolean)

  const tools = settings
    ? availableToolSpecs(settings).map((spec) => {
        const registry = {
          web_search: t("searchPage.quick"),
          search_images: t("searchPage.images"),
        } as Record<string, string>
        return { name: spec.name, label: registry[spec.name] ?? spec.name, description: spec.description }
      })
    : []

  const start = () => {
    const query = new URLSearchParams()
    if (prompt.trim()) query.set("prompt", prompt.trim())
    if (modelKey) query.set("model", modelKey)
    navigate(`/chat${query.toString() ? `?${query.toString()}` : ""}`)
  }

  const recentChats = conversations.filter((chat) => !chat.temporary).slice(0, 5)
  const recentProjects = projects.slice(0, 3)
  const recentFiles = files.slice(0, 5)

  return (
    <PageBody className="bg-[radial-gradient(120%_80%_at_50%_-20%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]">
      <section className="mx-auto max-w-3xl pt-6 pb-10 text-center sm:pt-12">
        <div className="mx-auto mb-4 flex w-fit items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-[11.5px] text-muted-foreground backdrop-blur">
          <Sparkles className="size-3.5 text-primary" />
          {t("app.localFirst")}
        </div>
        <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("home.greeting")}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-pretty text-[13.5px] leading-relaxed text-muted-foreground">
          {t("home.subtitle")}
        </p>

        <Card className="mt-7 border-border/70 bg-card/70 text-start shadow-lg backdrop-blur">
          <CardContent className="p-3">
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) start()
              }}
              placeholder={t("chat.placeholder")}
              className="min-h-20 resize-none border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <Select value={modelKey} onValueChange={setModelKey}>
                <SelectTrigger className="h-8 w-full min-w-0 max-w-full text-[12px] sm:w-auto sm:min-w-[190px] sm:max-w-[260px]">
                  <SelectValue placeholder={t("chat.modelMissing")} />
                </SelectTrigger>
                <SelectContent>
                  {models.slice(0, 80).map((model) => (
                    <SelectItem
                      key={`${model.providerId}:${model.id}`}
                      value={`${model.providerId}:${model.id}`}
                      className="text-[12px]"
                    >
                      {model.name}
                      <span className="ms-2 text-muted-foreground">
                        {getProvider(model.providerId)?.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8 gap-1.5" onClick={start}>
                {t("home.start")}
                <ArrowRight className="size-3.5 rtl:rotate-180" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-3 flex flex-wrap justify-center gap-1.5">
          {(language === "ar"
            ? ["اكتب خطة إطلاق منتج", "لخّص ملفاً محلياً", "صمّم صفحة هبوط", "ابحث عن صور مكان"]
            : ["Draft a launch plan", "Summarise a local file", "Design a landing page", "Find images of a place"]
          ).map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-3 text-[11.5px]"
              onClick={() => {
                setPrompt(suggestion)
                const query = new URLSearchParams({ prompt: suggestion })
                if (modelKey) query.set("model", modelKey)
                navigate(`/chat?${query.toString()}`)
              }}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 pb-8 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px]">{t("home.connected")}</CardTitle>
            <Link to="/providers" className="text-[11.5px] text-muted-foreground hover:text-foreground">
              {t("common.manage")}
            </Link>
          </CardHeader>
          <CardContent>
            {connectedProviders.length ? (
              <ul className="space-y-1.5">
                {connectedProviders.slice(0, 6).map((provider) =>
                  provider ? (
                    <li key={provider.id} className="flex items-center gap-2">
                      <ProviderLogo
                        name={provider.name}
                        slug={provider.logSlug}
                        accent={provider.accent}
                        className="size-7"
                      />
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">{provider.name}</span>
                      <Badge variant="secondary" className="h-5 text-[10px]">
                        {keys.find((key) => key.providerId === provider.id)?.modelsCount ?? 0}{" "}
                        {t("providers.models")}
                      </Badge>
                    </li>
                  ) : null
                )}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">{t("home.noProviders")}</p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-3 h-7 gap-1 text-[11.5px]"
              onClick={() => navigate("/providers")}
            >
              <Plus className="size-3" />
              {t("providers.addKey")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px]">{t("home.favorites")}</CardTitle>
            <Link to="/models" className="text-[11.5px] text-muted-foreground hover:text-foreground">
              {t("nav.models")}
            </Link>
          </CardHeader>
          <CardContent>
            {favorites.length ? (
              <ul className="space-y-1.5">
                {favorites.slice(0, 6).map((model) =>
                  model ? (
                    <li key={`${model.providerId}:${model.id}`} className="flex items-center gap-2">
                      <Boxes className="size-3.5 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">{model.name}</span>
                      {model.contextLength ? (
                        <span className="text-[10.5px] text-muted-foreground">
                          {Math.round(model.contextLength / 1000)}k
                        </span>
                      ) : null}
                    </li>
                  ) : null
                )}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">{t("home.noFavorites")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px]">{t("home.tools")}</CardTitle>
            <Link to="/settings" className="text-[11.5px] text-muted-foreground hover:text-foreground">
              {t("nav.settings")}
            </Link>
          </CardHeader>
          <CardContent>
            {tools.length ? (
              <ul className="space-y-2">
                {tools.map((tool) => (
                  <li key={tool.name} className="text-[12px]">
                    <div className="flex items-center gap-1.5 font-medium">
                      <Sparkles className="size-3.5 text-primary" />
                      {tool.label}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {tool.description}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">
                {t("chat.attachNote")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px]">{t("home.recentChats")}</CardTitle>
            <Link to="/chat" className="text-[11.5px] text-muted-foreground hover:text-foreground">
              {t("nav.newChat")}
            </Link>
          </CardHeader>
          <CardContent>
            {recentChats.length ? (
              <ul className="space-y-1">
                {recentChats.map((chat) => (
                  <li key={chat.id}>
                    <Link
                      to={`/chat/${chat.id}`}
                      className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px] transition-colors hover:bg-accent"
                    >
                      <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">{t("nav.noChats")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px]">{t("home.recentProjects")}</CardTitle>
            <Link to="/projects" className="text-[11.5px] text-muted-foreground hover:text-foreground">
              {t("common.manage")}
            </Link>
          </CardHeader>
          <CardContent>
            {recentProjects.length ? (
              <ul className="space-y-1">
                {recentProjects.map((project) => (
                  <li key={project.id} className="flex items-center gap-2 px-1.5 py-1 text-[12.5px]">
                    <FolderKanban className="size-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">{t("common.empty")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-[13px]">{t("home.recentFiles")}</CardTitle>
            <Link to="/library" className="text-[11.5px] text-muted-foreground hover:text-foreground">
              {t("nav.library")}
            </Link>
          </CardHeader>
          <CardContent>
            {recentFiles.length ? (
              <ul className="space-y-1">
                {recentFiles.map((file) => (
                  <li key={file.id} className="flex items-center gap-2 px-1.5 py-1 text-[12.5px]">
                    <Library className="size-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="text-[10.5px] text-muted-foreground">{formatBytes(file.size)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] text-muted-foreground">{t("common.empty")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 pb-10 text-[11px] text-muted-foreground">
        <Search className="size-3.5" />
        <span>
          {PROVIDERS.length} providers · {CAPABILITY_LABELS.text} · {t("app.tagline")}
        </span>
      </div>
    </PageBody>
  )
}
