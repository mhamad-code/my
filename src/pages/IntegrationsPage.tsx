import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from "lucide-react"
import * as React from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { toast } from "sonner"

import { PageBody, PageHeader } from "@/components/platform/PageHeader"
import { ProviderLogo } from "@/components/platform/ProviderLogo"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { deleteIntegration, listIntegrations, putIntegration } from "@/lib/db"
import type { IntegrationRecord } from "@/lib/types"
import { GitHubApiError, listRepositories, verifyToken, type GitHubRepo } from "@/platform/github"
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_SERVICES,
  type IntegrationService,
} from "@/platform/integrations"
import { useSession } from "@/store/session"
import { useT } from "@/i18n"

type CardStatus =
  | { kind: "connected"; record: IntegrationRecord }
  | { kind: "not-connected" }
  | { kind: "setup" }
  | { kind: "expired"; record: IntegrationRecord }
  | { kind: "permission"; record: IntegrationRecord }
  | { kind: "error"; record: IntegrationRecord; message?: string }
  | { kind: "backend" }

function cardStatus(service: IntegrationService, record: IntegrationRecord | undefined): CardStatus {
  if (!record) return service.connect === "backend" ? { kind: "backend" } : { kind: "not-connected" }
  switch (record.status) {
    case "connected":
      return { kind: "connected", record }
    case "expired":
      return { kind: "expired", record }
    case "permission":
      return { kind: "permission", record }
    case "error":
      return { kind: "error", record, message: record.lastError }
    default:
      return { kind: "not-connected" }
  }
}

function statusLabel(status: CardStatus, t: (key: string) => string): string {
  switch (status.kind) {
    case "connected":
      return t("integration.connected")
    case "expired":
      return t("integration.status.expired")
    case "permission":
      return t("integration.status.permission")
    case "error":
      return t("integration.status.error")
    case "backend":
      return t("integration.requiresBackend")
    case "setup":
      return t("integration.status.setup")
    default:
      return t("integration.notConnected")
  }
}

function monoDate(value: string | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

export default function IntegrationsPage() {
  const { t } = useT()
  const user = useSession((state) => state.user)
  const integrations = useLiveQuery(
    () => (user ? listIntegrations(user.uid) : Promise.resolve([])),
    [user?.uid],
    [] as IntegrationRecord[]
  )
  const [search, setSearch] = React.useState("")
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const selected = selectedId ? INTEGRATION_SERVICES.find((service) => service.id === selectedId) : undefined
  const selectedRecord = selected ? integrations.find((record) => record.serviceId === selected.id) : undefined

  const filtered = INTEGRATION_SERVICES.filter((service) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return (
      service.name.toLowerCase().includes(term) ||
      service.category.toLowerCase().includes(term) ||
      service.description.toLowerCase().includes(term)
    )
  })

  const connectedCount = integrations.filter((record) => record.status === "connected").length

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("integration.title")}
        description={t("integration.subtitle")}
        actions={
          <div className="flex items-center gap-1.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("common.search")}
              className="h-8 w-32 text-[12px] sm:w-44"
            />
          </div>
        }
      />
      <PageBody>
        <Alert className="mb-4">
          <Info className="size-4" />
          <AlertTitle className="text-[12.5px]">
            {connectedCount} {t("integration.connected")}
          </AlertTitle>
          <AlertDescription className="text-[11.5px] leading-relaxed">
            {t("integration.subtitle")}
          </AlertDescription>
        </Alert>

        {INTEGRATION_CATEGORIES.map((category) => {
          const services = filtered.filter((service) => service.category === category)
          if (!services.length) return null
          return (
            <section key={category} className="mb-6">
              <h2 className="mb-2 text-[12.5px] font-medium text-muted-foreground">{category}</h2>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {services.map((service) => {
                  const record = integrations.find((item) => item.serviceId === service.id)
                  const status = cardStatus(service, record)
                  const usable = status.kind === "connected"
                  return (
                    <div key={service.id} className="flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-3">
                      <div className="flex min-w-0 items-start gap-2.5">
                        <ProviderLogo
                          name={service.name}
                          slug={service.slug}
                          accent={service.accent}
                          className="size-8"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium">{service.name}</p>
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">{service.description}</p>
                        </div>
                        <Badge
                          variant={usable ? "secondary" : status.kind === "error" ? "destructive" : "outline"}
                          className="h-5 max-w-[7.5rem] shrink-0 gap-1 truncate text-[10px]"
                        >
                          {usable ? <CheckCircle2 className="size-2.5 shrink-0" /> : null}
                          {statusLabel(status, t)}
                        </Badge>
                      </div>
                      <div className="mt-auto flex min-w-0 items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[10.5px] text-muted-foreground">
                          {status.kind === "connected"
                            ? status.record.account?.login ?? status.record.accountLabel ?? ""
                            : status.kind === "error"
                              ? status.message ?? ""
                              : ""}
                        </span>
                        <Button
                          size="sm"
                          variant={usable ? "outline" : service.connect === "token" ? "default" : "outline"}
                          className="h-7 shrink-0 text-[11.5px]"
                          onClick={() => setSelectedId(service.id)}
                          aria-label={`${t("common.manage")} ${service.name}`}
                        >
                          {usable ? t("common.manage") : service.connect === "token" ? t("common.connect") : t("common.manage")}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </PageBody>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => (open ? undefined : setSelectedId(null))}>
        <DialogContent className="flex max-h-[min(88dvh,52rem)] w-[calc(100vw-1.5rem)] max-w-lg flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          {selected ? (
            <>
              <DialogHeader className="shrink-0 gap-1 border-b px-4 py-3 pe-12 text-start sm:px-5">
                <DialogTitle className="flex min-w-0 items-center gap-2 text-[15px]">
                  <ProviderLogo
                    name={selected.name}
                    slug={selected.slug}
                    accent={selected.accent}
                    className="size-7 shrink-0"
                  />
                  <span className="truncate">{selected.name}</span>
                </DialogTitle>
                <DialogDescription className="text-[11.5px] leading-relaxed">
                  {selected.description}
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
                {selected.id === "github" ? (
                  <GitHubPanel
                    userId={user?.uid}
                    record={selectedRecord}
                    onRecordChanged={() => undefined}
                  />
                ) : (
                  <BackendOnlyNote service={selected} />
                )}
              </div>

              <DialogFooter className="shrink-0 gap-2 border-t px-4 py-3 sm:px-5">
                <Button variant="outline" size="sm" onClick={() => setSelectedId(null)}>
                  {t("common.close")}
                </Button>
                {selected.docs ? (
                  <Button size="sm" variant="secondary" asChild>
                    <a href={selected.docs} target="_blank" rel="noreferrer noopener">
                      {t("common.manage")}
                      <ExternalLink className="ms-1 size-3" />
                    </a>
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BackendOnlyNote({ service }: { service: IntegrationService }) {
  const { t } = useT()
  return (
    <div className="space-y-2.5 rounded-md border bg-muted/40 p-3 text-[11.5px] leading-relaxed text-muted-foreground">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <ShieldAlert className="size-3.5 shrink-0" />
        {t("integration.requiresBackend")}
      </p>
      <p>{t("integration.why")}</p>
      <p>
        {service.name} needs an OAuth authorization-code exchange (or a signed webhook) that requires a
        client secret and a trusted redirect URL. Both must live on a server you control, not in this
        local-first app.
      </p>
      <p>
        A small backend proxy would hold the secret and return a short-lived token to the app. Until one
        exists, {service.name} cannot be connected here, and no agent tool claims otherwise.
      </p>
    </div>
  )
}

type TestState = { kind: "idle" } | { kind: "running" } | { kind: "ok"; message: string } | { kind: "error"; message: string; hint?: string }

/**
 * GitHub is the one service that can be fully connected from a browser: a PAT
 * needs no secret exchange. This panel proves the token against `GET /user`,
 * saves the real account, and lists the repositories the token can actually see.
 */
function GitHubPanel({
  userId,
  record,
}: {
  userId: string | undefined
  record: IntegrationRecord | undefined
  onRecordChanged?: () => void
}) {
  const { t } = useT()
  const [token, setToken] = React.useState("")
  const [test, setTest] = React.useState<TestState>({ kind: "idle" })
  const [busy, setBusy] = React.useState(false)
  const [repos, setRepos] = React.useState<GitHubRepo[]>([])
  const [reposLoading, setReposLoading] = React.useState(false)
  const [reposError, setReposError] = React.useState<string | null>(null)
  const [page, setPage] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)

  const connected = record?.status === "connected" && Boolean(record?.token)

  const loadRepos = React.useCallback(
    async (nextPage: number, options: { token?: string; append?: boolean } = {}) => {
      const target = options.token ?? record?.token
      if (!target) return
      setReposLoading(true)
      setReposError(null)
      try {
        const result = await listRepositories(target, { page: nextPage, perPage: 20, sort: "updated" })
        setRepos((current) => (options.append ? [...current, ...result.repos] : result.repos))
        setPage(result.page)
        setHasMore(result.hasMore)
      } catch (error) {
        setReposError(error instanceof GitHubApiError ? error.explanation : "Could not load repositories.")
      } finally {
        setReposLoading(false)
      }
    },
    [record?.token]
  )

  React.useEffect(() => {
    if (!connected) {
      setRepos([])
      return
    }
    void loadRepos(1)
    // Only when the connection itself changes; `loadRepos` is stable per token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, record?.token])

  const save = async (nextToken: string) => {
    if (!userId) return
    setBusy(true)
    setTest({ kind: "running" })
    try {
      const verification = await verifyToken(nextToken)
      const now = Date.now()
      const isExpired =
        verification.expiresAt !== null && new Date(verification.expiresAt).getTime() < now
      const next: IntegrationRecord = {
        id: `${userId}:github`,
        userId,
        serviceId: "github",
        status: isExpired ? "expired" : "connected",
        accountLabel: verification.profile.login,
        account: {
          login: verification.profile.login,
          name: verification.profile.name,
          avatarUrl: verification.profile.avatarUrl,
          htmlUrl: verification.profile.htmlUrl,
          type: verification.profile.type,
          publicRepos: verification.profile.publicRepos,
        },
        tokenType: verification.tokenType,
        scopes: verification.scopes,
        expiresAt: verification.expiresAt,
        token: nextToken,
        connectedAt: record?.connectedAt ?? now,
        lastCheckedAt: now,
        lastError: isExpired ? "This token expired." : undefined,
      }
      await putIntegration(next)
      setToken("")
      setTest({
        kind: isExpired ? "error" : "ok",
        message: isExpired
          ? `${verification.profile.login}: the token expired on ${monoDate(verification.expiresAt ?? undefined)}.`
          : `Connected as ${verification.profile.login} · ${verification.profile.publicRepos} public repositories.`,
      })
      toast.success(`Connected as ${verification.profile.login}`)
      if (!isExpired) void loadRepos(1, { token: nextToken })
    } catch (error) {
      const message = error instanceof GitHubApiError ? error.explanation : "Could not verify the token."
      const hint = error instanceof GitHubApiError ? error.hint : undefined
      setTest({ kind: "error", message, hint })
      if (record && userId) {
        await putIntegration({
          ...record,
          status:
            error instanceof GitHubApiError && error.kind === "unauthorized"
              ? "expired"
              : error instanceof GitHubApiError && error.kind === "forbidden"
                ? "permission"
                : "error",
          lastError: message,
          lastCheckedAt: Date.now(),
        })
      }
    } finally {
      setBusy(false)
    }
  }

  const retest = async () => {
    if (!record?.token) return
    setTest({ kind: "running" })
    try {
      const verification = await verifyToken(record.token)
      const now = Date.now()
      await putIntegration({
        ...record,
        status: "connected",
        lastCheckedAt: now,
        lastError: undefined,
        accountLabel: verification.profile.login,
        account: {
          login: verification.profile.login,
          name: verification.profile.name,
          avatarUrl: verification.profile.avatarUrl,
          htmlUrl: verification.profile.htmlUrl,
          type: verification.profile.type,
          publicRepos: verification.profile.publicRepos,
        },
        tokenType: verification.tokenType,
        scopes: verification.scopes,
        expiresAt: verification.expiresAt,
      })
      setTest({
        kind: "ok",
        message: `Token is valid · ${verification.rateLimitRemaining ?? "?"} requests left this hour.`,
      })
      void loadRepos(1)
    } catch (error) {
      const message = error instanceof GitHubApiError ? error.explanation : "Check failed."
      if (record) {
        await putIntegration({
          ...record,
          status:
            error instanceof GitHubApiError && error.kind === "unauthorized"
              ? "expired"
              : error instanceof GitHubApiError && error.kind === "forbidden"
                ? "permission"
                : "error",
          lastError: message,
          lastCheckedAt: Date.now(),
        })
      }
      setTest({ kind: "error", message })
    }
  }

  const disconnect = async () => {
    if (!userId) return
    await deleteIntegration(userId, "github")
    setRepos([])
    setTest({ kind: "idle" })
    toast.success("GitHub disconnected and the token was deleted from this device.")
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant={connected ? "secondary" : "outline"} className="h-5 gap-1 text-[10px]">
          {connected ? <CheckCircle2 className="size-2.5" /> : null}
          {connected ? t("integration.connected") : record?.status === "expired" ? t("integration.status.expired") : t("integration.notConnected")}
        </Badge>
        {record?.tokenType && record.tokenType !== "unknown" ? (
          <Badge variant="outline" className="h-5 text-[10px]">
            {record.tokenType === "fine-grained" ? t("integration.fineGrained") : t("integration.classic")}
          </Badge>
        ) : null}
        {record?.lastCheckedAt ? (
          <span className="text-[10.5px] text-muted-foreground">
            {t("integration.status.checking")} {monoDate(new Date(record.lastCheckedAt).toISOString())}
          </span>
        ) : null}
      </div>

      {record?.account ? (
        <div className="flex min-w-0 items-start gap-2.5 rounded-lg border bg-card p-2.5">
          {record.account.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote GitHub avatar
            <img
              src={record.account.avatarUrl}
              alt={record.account.login}
              className="size-9 shrink-0 rounded-full bg-muted object-cover"
              loading="lazy"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <a
              href={record.account.htmlUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex max-w-full items-center gap-1 truncate text-[12.5px] font-medium text-primary underline-offset-2 hover:underline"
            >
              {record.account.login}
              <ExternalLink className="size-3 shrink-0" />
            </a>
            <p className="truncate text-[11px] text-muted-foreground">
              {[record.account.name, record.account.type, `${record.account.publicRepos ?? 0} public repos`]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-muted-foreground">
              {record.scopes?.length ? (
                <span>
                  {t("integration.scopes")}: <span className="font-mono">{record.scopes.join(", ")}</span>
                </span>
              ) : null}
              {record.expiresAt ? (
                <span>
                  {t("integration.expires")}: {monoDate(record.expiresAt)}
                </span>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}

      {record?.lastError ? (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="size-3.5" />
          <AlertDescription className="text-[11px] leading-relaxed">{record.lastError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="github-token" className="text-[12px]">
          {t("integration.githubToken")}
        </Label>
        <Input
          id="github-token"
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder="github_pat_… / ghp_…"
          className="h-9 w-full min-w-0 font-mono text-[12px]"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">{t("integration.githubHint")}</p>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">{t("integration.permissionsHint")}</p>
        <p className="text-[10.5px] leading-relaxed text-muted-foreground">{t("integration.privateVisible")}</p>
      </div>

      {test.kind === "ok" ? (
        <Alert className="py-2">
          <CheckCircle2 className="size-3.5" />
          <AlertDescription className="text-[11px]">{test.message}</AlertDescription>
        </Alert>
      ) : null}
      {test.kind === "error" ? (
        <Alert variant="destructive" className="py-2">
          <AlertTriangle className="size-3.5" />
          <AlertTitle className="text-[11.5px]">{t("integration.status.error")}</AlertTitle>
          <AlertDescription className="text-[11px] leading-relaxed">
            {test.message}
            {test.hint ? <span className="mt-1 block opacity-90">{test.hint}</span> : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          className="h-8 min-w-0 flex-1 sm:flex-none"
          disabled={!token.trim() || busy}
          onClick={() => void save(token.trim())}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {connected ? t("integration.reconnect") : t("common.connect")}
        </Button>
        {connected ? (
          <>
            <Button size="sm" variant="outline" className="h-8 min-w-0 flex-1 sm:flex-none" onClick={() => void retest()}>
              <RefreshCw className="size-3.5" />
              {t("integration.test")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 min-w-0 gap-1 text-destructive hover:text-destructive"
              onClick={() => void disconnect()}
            >
              <Trash2 className="size-3.5" />
              {t("integration.remove")}
            </Button>
          </>
        ) : null}
      </div>

      {connected ? (
        <>
          <Separator />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[12px] font-medium">{t("integration.repos")}</h3>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                disabled={reposLoading}
                onClick={() => void loadRepos(1)}
              >
                <RefreshCw className={reposLoading ? "size-3 animate-spin" : "size-3"} />
              </Button>
            </div>

            {reposError ? (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="size-3.5" />
                <AlertDescription className="text-[11px] leading-relaxed">{reposError}</AlertDescription>
              </Alert>
            ) : null}

            {reposLoading && repos.length === 0 ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-muted-foreground">{t("integration.reposLoading")}</p>
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : null}

            {!reposLoading && !reposError && repos.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-[11px] leading-relaxed text-muted-foreground">
                {t("integration.reposEmpty")}
              </p>
            ) : null}

            <ul className="space-y-1.5">
              {repos.map((repo) => (
                <li key={repo.id} className="min-w-0 rounded-md border bg-card p-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <a
                      href={repo.htmlUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="min-w-0 flex-1 truncate text-[12px] font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {repo.fullName}
                    </a>
                    <Badge variant={repo.private ? "outline" : "secondary"} className="h-4 shrink-0 text-[9.5px]">
                      {repo.private ? "private" : "public"}
                    </Badge>
                  </div>
                  {repo.description ? (
                    <p className="line-clamp-2 text-[10.5px] leading-relaxed text-muted-foreground">
                      {repo.description}
                    </p>
                  ) : null}
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    {repo.language ? <span>{repo.language}</span> : null}
                    <span>★ {repo.stars}</span>
                    <span>{repo.defaultBranch}</span>
                    <span>{monoDate(repo.updatedAt)}</span>
                  </p>
                </li>
              ))}
            </ul>

            {hasMore ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 w-full text-[11.5px]"
                disabled={reposLoading}
                onClick={() => void loadRepos(page + 1, { append: true })}
              >
                {t("integration.loadMore")}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
