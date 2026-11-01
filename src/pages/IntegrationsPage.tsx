import { CheckCircle2, ExternalLink, Info, Loader2, Search, ShieldAlert } from "lucide-react"
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
import { deleteIntegration, listIntegrations, putIntegration } from "@/lib/db"
import type { IntegrationRecord } from "@/lib/types"
import { useSession } from "@/store/session"
import { useT } from "@/i18n"

type Category = "Git" | "Hosting & app builders" | "Design & productivity" | "Databases" | "Monitoring & automation"

type Service = {
  id: string
  name: string
  category: Category
  description: string
  slug?: string
  accent: string
  docs?: string
  /** true only when the service can be verified from the browser without a secret. */
  browserVerifiable?: boolean
}

const SERVICES: Service[] = [
  { id: "github", name: "GitHub", category: "Git", description: "Repos, issues and pull requests. Personal access tokens can be verified from the browser.", slug: "github", accent: "#8b949e", browserVerifiable: true, docs: "https://docs.github.com/rest" },
  { id: "gitlab", name: "GitLab", category: "Git", description: "Projects and merge requests through OAuth.", slug: "gitlab", accent: "#fc6d26" },
  { id: "bitbucket", name: "Bitbucket", category: "Git", description: "Repositories and pull requests through Atlassian OAuth.", slug: "bitbucket", accent: "#0052cc" },
  { id: "codeberg", name: "Codeberg", category: "Git", description: "Forgejo-based hosting with OAuth applications.", slug: "codeberg", accent: "#2185d0" },
  { id: "sourcehut", name: "SourceHut", category: "Git", description: "Mail-driven git hosting with OAuth tokens.", slug: "sourcehut", accent: "#3a3a3a" },

  { id: "lovable", name: "Lovable", category: "Hosting & app builders", description: "App generation platform with a private API.", accent: "#ff6b9d" },
  { id: "supabase", name: "Supabase", category: "Hosting & app builders", description: "Postgres, auth and storage platform.", slug: "supabase", accent: "#3ecf8e" },
  { id: "firebase", name: "Firebase", category: "Hosting & app builders", description: "Google's app platform. Used here for authentication only.", slug: "firebase", accent: "#ffca28" },
  { id: "vercel", name: "Vercel", category: "Hosting & app builders", description: "Deployments and project management.", slug: "vercel", accent: "#111111" },
  { id: "netlify", name: "Netlify", category: "Hosting & app builders", description: "Sites, builds and deploys.", slug: "netlify", accent: "#00c7b7" },
  { id: "cloudflare", name: "Cloudflare", category: "Hosting & app builders", description: "Workers, Pages, R2 and D1.", slug: "cloudflare", accent: "#f38020" },
  { id: "railway", name: "Railway", category: "Hosting & app builders", description: "Service and database deployments.", slug: "railway", accent: "#0b0d0e" },
  { id: "render", name: "Render", category: "Hosting & app builders", description: "Static sites and services.", slug: "render", accent: "#46e3b7" },
  { id: "flyio", name: "Fly.io", category: "Hosting & app builders", description: "Machines and apps on Fly.", accent: "#24175b" },
  { id: "replit", name: "Replit", category: "Hosting & app builders", description: "Browser IDE and hosting.", slug: "replit", accent: "#f26207" },
  { id: "stackblitz", name: "StackBlitz", category: "Hosting & app builders", description: "In-browser development environments.", slug: "stackblitz", accent: "#1389fd" },
  { id: "codesandbox", name: "CodeSandbox", category: "Hosting & app builders", description: "Cloud sandboxes and previews.", slug: "codesandbox", accent: "#151515" },
  { id: "bolt", name: "Bolt", category: "Hosting & app builders", description: "AI app builder with a private API.", accent: "#1f2937" },
  { id: "framer", name: "Framer", category: "Hosting & app builders", description: "Design-to-site publishing.", slug: "framer", accent: "#0055ff" },
  { id: "webflow", name: "Webflow", category: "Hosting & app builders", description: "Visual web publishing with an OAuth app model.", slug: "webflow", accent: "#4353ff" },

  { id: "figma", name: "Figma", category: "Design & productivity", description: "Files and design tokens through OAuth.", slug: "figma", accent: "#f24e1e" },
  { id: "canva", name: "Canva", category: "Design & productivity", description: "Design automation with OAuth.", accent: "#00c4cc" },
  { id: "notion", name: "Notion", category: "Design & productivity", description: "Pages and databases. Requires an integration token or OAuth.", slug: "notion", accent: "#111111" },
  { id: "linear", name: "Linear", category: "Design & productivity", description: "Issues and projects via OAuth or API key.", slug: "linear", accent: "#5e6ad2" },
  { id: "trello", name: "Trello", category: "Design & productivity", description: "Boards and cards through Atlassian OAuth.", slug: "trello", accent: "#0052cc" },
  { id: "jira", name: "Jira", category: "Design & productivity", description: "Issues and projects through Atlassian OAuth.", slug: "jira", accent: "#0052cc" },
  { id: "slack", name: "Slack", category: "Design & productivity", description: "Messages and channels, OAuth with a client secret.", accent: "#4a154b" },
  { id: "discord", name: "Discord", category: "Design & productivity", description: "Servers and channels through OAuth2.", slug: "discord", accent: "#5865f2" },
  { id: "teams", name: "Microsoft Teams", category: "Design & productivity", description: "Microsoft Graph with Entra ID consent.", accent: "#6264a7" },
  { id: "gdrive", name: "Google Drive", category: "Design & productivity", description: "Files through Google OAuth and Picker.", slug: "googledrive", accent: "#4285f4" },

  { id: "neon", name: "Neon", category: "Databases", description: "Serverless Postgres.", slug: "neon", accent: "#00e599" },
  { id: "planetscale", name: "PlanetScale", category: "Databases", description: "MySQL-compatible branching database.", slug: "planetscale", accent: "#111111" },
  { id: "mongodb", name: "MongoDB Atlas", category: "Databases", description: "Managed MongoDB clusters.", slug: "mongodb", accent: "#47a248" },
  { id: "upstash", name: "Upstash", category: "Databases", description: "Serverless Redis and Kafka.", slug: "upstash", accent: "#00e9a3" },
  { id: "appwrite", name: "Appwrite", category: "Databases", description: "Open-source backend platform.", slug: "appwrite", accent: "#fd366e" },
  { id: "convex", name: "Convex", category: "Databases", description: "Reactive backend and database.", slug: "convex", accent: "#f3b01c" },
  { id: "pocketbase", name: "PocketBase", category: "Databases", description: "Self-hosted backend in one binary.", accent: "#b8dbe4" },
  { id: "prisma", name: "Prisma Data Platform", category: "Databases", description: "Database tooling and accelerate.", slug: "prisma", accent: "#2d3748" },

  { id: "sentry", name: "Sentry", category: "Monitoring & automation", description: "Error monitoring with DSNs and OAuth.", slug: "sentry", accent: "#362d59" },
  { id: "posthog", name: "PostHog", category: "Monitoring & automation", description: "Product analytics and session replay.", slug: "posthog", accent: "#f54e00" },
  { id: "mixpanel", name: "Mixpanel", category: "Monitoring & automation", description: "Product analytics.", slug: "mixpanel", accent: "#7856ff" },
  { id: "ga", name: "Google Analytics", category: "Monitoring & automation", description: "Measurement and reporting APIs.", slug: "googleanalytics", accent: "#e37400" },
  { id: "zapier", name: "Zapier", category: "Monitoring & automation", description: "Automation webhooks and apps.", slug: "zapier", accent: "#ff4a00" },
  { id: "make", name: "Make", category: "Monitoring & automation", description: "Scenario automation with webhooks.", slug: "make", accent: "#6d00cc" },
  { id: "n8n", name: "n8n", category: "Monitoring & automation", description: "Self-hostable workflow automation.", slug: "n8n", accent: "#ea4b71" },
  { id: "resend", name: "Resend", category: "Monitoring & automation", description: "Transactional email API.", slug: "resend", accent: "#111111" },
  { id: "stripe", name: "Stripe", category: "Monitoring & automation", description: "Payments and billing.", slug: "stripe", accent: "#635bff" },
  { id: "clerk", name: "Clerk", category: "Monitoring & automation", description: "Authentication and user management.", slug: "clerk", accent: "#6c47ff" },
  { id: "auth0", name: "Auth0", category: "Monitoring & automation", description: "Identity platform.", slug: "auth0", accent: "#eb5424" },
  { id: "dockerhub", name: "Docker Hub", category: "Monitoring & automation", description: "Image repositories and tokens.", slug: "docker", accent: "#2496ed" },
]

const CATEGORIES: Category[] = [
  "Git",
  "Hosting & app builders",
  "Design & productivity",
  "Databases",
  "Monitoring & automation",
]

export default function IntegrationsPage() {
  const { t } = useT()
  const user = useSession((state) => state.user)
  const integrations = useLiveQuery(
    () => (user ? listIntegrations(user.uid) : Promise.resolve([])),
    [user?.uid],
    []
  )
  const [search, setSearch] = React.useState("")
  const [selected, setSelected] = React.useState<Service | null>(null)
  const [token, setToken] = React.useState("")
  const [checking, setChecking] = React.useState(false)

  const connected = (serviceId: string): IntegrationRecord | undefined =>
    integrations.find((record) => record.serviceId === serviceId)

  const filtered = SERVICES.filter((service) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return (
      service.name.toLowerCase().includes(term) ||
      service.category.toLowerCase().includes(term) ||
      service.description.toLowerCase().includes(term)
    )
  })

  const connectGithub = async () => {
    if (!user || !token.trim()) return
    setChecking(true)
    try {
      const response = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: "application/vnd.github+json",
        },
      })
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "GitHub rejected the token. Check that it is valid and has the read:user scope."
            : `GitHub returned ${response.status}.`
        )
      }
      const profile = (await response.json()) as { login?: string }
      await putIntegration({
        id: `${user.uid}:github`,
        userId: user.uid,
        serviceId: "github",
        status: "connected",
        accountLabel: profile.login,
        token: token.trim(),
        connectedAt: Date.now(),
        lastCheckedAt: Date.now(),
      })
      toast.success(`Connected as ${profile.login ?? "GitHub user"}`)
      setSelected(null)
      setToken("")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not verify the token.")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("integration.title")}
        description={t("integration.subtitle")}
        actions={
          <div className="flex items-center gap-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("common.search")}
              className="h-8 w-40 text-[12px]"
            />
          </div>
        }
      />
      <PageBody>
        <Alert className="mb-4">
          <Info className="size-4" />
          <AlertTitle className="text-[12.5px]">Local-first, no hidden backend</AlertTitle>
          <AlertDescription className="text-[11.5px] leading-relaxed">
            This app has no server of its own. OAuth flows that need a client secret, a redirect
            endpoint or webhook verification cannot run safely in a browser page, so those services are
            listed as requiring a backend instead of pretending to be connected.
          </AlertDescription>
        </Alert>

        {CATEGORIES.map((category) => {
          const services = filtered.filter((service) => service.category === category)
          if (!services.length) return null
          return (
            <section key={category} className="mb-6">
              <h2 className="mb-2 text-[12.5px] font-medium text-muted-foreground">{category}</h2>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {services.map((service) => {
                  const record = connected(service.id)
                  return (
                    <div key={service.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
                      <div className="flex items-start gap-2.5">
                        <ProviderLogo
                          name={service.name}
                          slug={service.slug}
                          accent={service.accent}
                          className="size-8"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12.5px] font-medium">{service.name}</p>
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">
                            {service.description}
                          </p>
                        </div>
                        {record ? (
                          <Badge variant="secondary" className="h-5 shrink-0 gap-1 text-[10px]">
                            <CheckCircle2 className="size-2.5" />
                            {t("integration.connected")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="h-5 shrink-0 text-[10px]">
                            {service.browserVerifiable ? t("integration.notConnected") : t("integration.requiresBackend")}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-2">
                        <span className="truncate text-[10.5px] text-muted-foreground">
                          {record?.accountLabel ?? (service.browserVerifiable ? "" : "OAuth backend required")}
                        </span>
                        <div className="flex gap-1.5">
                          {record ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11.5px]"
                              onClick={() => {
                                if (!user) return
                                void deleteIntegration(user.uid, service.id).then(() =>
                                  toast.success("Disconnected")
                                )
                              }}
                            >
                              {t("common.disconnect")}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant={service.browserVerifiable ? "default" : "outline"}
                              className="h-7 text-[11.5px]"
                              onClick={() => {
                                setSelected(service)
                                setToken("")
                              }}
                            >
                              {t("common.connect")}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </PageBody>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => (!open ? setSelected(null) : undefined)}>
        <DialogContent className="max-w-md">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-[15px]">
                  <ProviderLogo name={selected.name} slug={selected.slug} accent={selected.accent} className="size-7" />
                  {selected.name}
                </DialogTitle>
                <DialogDescription className="text-[12px] leading-relaxed">
                  {selected.description}
                </DialogDescription>
              </DialogHeader>

              {selected.browserVerifiable ? (
                <div className="space-y-2">
                  <Label className="text-[12px]">{t("integration.githubToken")}</Label>
                  <Input
                    type="password"
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    placeholder="github_pat_…"
                    className="font-mono text-[12px]"
                    autoComplete="off"
                  />
                  <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                    {t("integration.githubHint")}
                  </p>
                </div>
              ) : (
                <div className="space-y-2 rounded-md border bg-muted/40 p-3 text-[11.5px] leading-relaxed text-muted-foreground">
                  <p className="flex items-center gap-1.5 font-medium text-foreground">
                    <ShieldAlert className="size-3.5" />
                    {t("integration.requiresBackend")}
                  </p>
                  <p>{t("integration.why")}</p>
                  <p>
                    {selected.name} needs an OAuth authorization-code exchange (or a signed webhook)
                    that requires a client secret and a trusted redirect URL. Both must live on a
                    server you control, not in this local-first app.
                  </p>
                  <p>
                    A backend proxy would expose a small endpoint that stores the secret and returns a
                    short-lived token to the app. Until one exists, this integration stays
                    disconnected.
                  </p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                  {t("common.close")}
                </Button>
                {selected.browserVerifiable ? (
                  <Button size="sm" disabled={!token.trim() || checking} onClick={() => void connectGithub()}>
                    {checking ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    {t("common.connect")}
                  </Button>
                ) : selected.docs ? (
                  <Button size="sm" variant="secondary" asChild>
                    <a href={selected.docs} target="_blank" rel="noreferrer">
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
