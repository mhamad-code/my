/**
 * The integration catalogue. It is data, not UI, so the Integrations page and
 * the composer's integration menu describe a service the same way.
 *
 * `connect` says how a service can really be connected from this app:
 *  - `token`     a personal access token or API key the browser can verify.
 *  - `backend`   needs an OAuth client secret, a redirect endpoint or a webhook,
 *                which a local-only page cannot hold safely.
 * Only `token` services can reach `connected`, and only they have agent tools.
 */
export type IntegrationCategory =
  | "Git"
  | "Hosting & app builders"
  | "Design & productivity"
  | "Databases"
  | "Monitoring & automation"

export type IntegrationService = {
  id: string
  name: string
  category: IntegrationCategory
  description: string
  /** Logo slug for ProviderLogo. */
  slug?: string
  accent: string
  docs?: string
  connect: "token" | "backend"
  /** Agent tools this service exposes once connected. Empty means none yet. */
  tools?: string[]
}

export const INTEGRATION_CATEGORIES: IntegrationCategory[] = [
  "Git",
  "Hosting & app builders",
  "Design & productivity",
  "Databases",
  "Monitoring & automation",
]

export const INTEGRATION_SERVICES: IntegrationService[] = [
  {
    id: "github",
    name: "GitHub",
    category: "Git",
    description: "Repositories, branches, commits, files and issues through a personal access token.",
    slug: "github",
    accent: "#8b949e",
    docs: "https://docs.github.com/rest",
    connect: "token",
    tools: ["github_get_authenticated_user", "github_list_repositories", "github_search_repositories", "github_create_issue"],
  },
  { id: "gitlab", name: "GitLab", category: "Git", description: "Projects and merge requests through OAuth.", slug: "gitlab", accent: "#fc6d26", connect: "backend" },
  { id: "bitbucket", name: "Bitbucket", category: "Git", description: "Repositories and pull requests through Atlassian OAuth.", slug: "bitbucket", accent: "#0052cc", connect: "backend" },
  { id: "codeberg", name: "Codeberg", category: "Git", description: "Forgejo-based hosting with OAuth applications.", slug: "codeberg", accent: "#2185d0", connect: "backend" },
  { id: "sourcehut", name: "SourceHut", category: "Git", description: "Mail-driven git hosting with OAuth tokens.", slug: "sourcehut", accent: "#3a3a3a", connect: "backend" },

  { id: "lovable", name: "Lovable", category: "Hosting & app builders", description: "App generation platform with a private API.", accent: "#ff6b9d", connect: "backend" },
  { id: "supabase", name: "Supabase", category: "Hosting & app builders", description: "Postgres, auth and storage platform.", slug: "supabase", accent: "#3ecf8e", connect: "backend" },
  { id: "firebase", name: "Firebase", category: "Hosting & app builders", description: "Google's app platform. Used here for authentication only.", slug: "firebase", accent: "#ffca28", connect: "backend" },
  { id: "vercel", name: "Vercel", category: "Hosting & app builders", description: "Deployments and project management.", slug: "vercel", accent: "#111111", connect: "backend" },
  { id: "netlify", name: "Netlify", category: "Hosting & app builders", description: "Sites, builds and deploys.", slug: "netlify", accent: "#00c7b7", connect: "backend" },
  { id: "cloudflare", name: "Cloudflare", category: "Hosting & app builders", description: "Workers, Pages, R2 and D1.", slug: "cloudflare", accent: "#f38020", connect: "backend" },
  { id: "railway", name: "Railway", category: "Hosting & app builders", description: "Service and database deployments.", slug: "railway", accent: "#0b0d0e", connect: "backend" },
  { id: "render", name: "Render", category: "Hosting & app builders", description: "Static sites and services.", slug: "render", accent: "#46e3b7", connect: "backend" },
  { id: "flyio", name: "Fly.io", category: "Hosting & app builders", description: "Machines and apps on Fly.", accent: "#24175b", connect: "backend" },
  { id: "replit", name: "Replit", category: "Hosting & app builders", description: "Browser IDE and hosting.", slug: "replit", accent: "#f26207", connect: "backend" },
  { id: "stackblitz", name: "StackBlitz", category: "Hosting & app builders", description: "In-browser development environments.", slug: "stackblitz", accent: "#1389fd", connect: "backend" },
  { id: "codesandbox", name: "CodeSandbox", category: "Hosting & app builders", description: "Cloud sandboxes and previews.", slug: "codesandbox", accent: "#151515", connect: "backend" },
  { id: "bolt", name: "Bolt", category: "Hosting & app builders", description: "AI app builder with a private API.", accent: "#1f2937", connect: "backend" },
  { id: "framer", name: "Framer", category: "Hosting & app builders", description: "Design-to-site publishing.", slug: "framer", accent: "#0055ff", connect: "backend" },
  { id: "webflow", name: "Webflow", category: "Hosting & app builders", description: "Visual web publishing with an OAuth app model.", slug: "webflow", accent: "#4353ff", connect: "backend" },

  { id: "figma", name: "Figma", category: "Design & productivity", description: "Files and design tokens through OAuth.", slug: "figma", accent: "#f24e1e", connect: "backend" },
  { id: "canva", name: "Canva", category: "Design & productivity", description: "Design automation with OAuth.", accent: "#00c4cc", connect: "backend" },
  { id: "notion", name: "Notion", category: "Design & productivity", description: "Pages and databases. Requires an integration token or OAuth.", slug: "notion", accent: "#111111", connect: "backend" },
  { id: "linear", name: "Linear", category: "Design & productivity", description: "Issues and projects via OAuth or API key.", slug: "linear", accent: "#5e6ad2", connect: "backend" },
  { id: "trello", name: "Trello", category: "Design & productivity", description: "Boards and cards through Atlassian OAuth.", slug: "trello", accent: "#0052cc", connect: "backend" },
  { id: "jira", name: "Jira", category: "Design & productivity", description: "Issues and projects through Atlassian OAuth.", slug: "jira", accent: "#0052cc", connect: "backend" },
  { id: "slack", name: "Slack", category: "Design & productivity", description: "Messages and channels, OAuth with a client secret.", accent: "#4a154b", connect: "backend" },
  { id: "discord", name: "Discord", category: "Design & productivity", description: "Servers and channels through OAuth2.", slug: "discord", accent: "#5865f2", connect: "backend" },
  { id: "teams", name: "Microsoft Teams", category: "Design & productivity", description: "Microsoft Graph with Entra ID consent.", accent: "#6264a7", connect: "backend" },
  { id: "gdrive", name: "Google Drive", category: "Design & productivity", description: "Files through Google OAuth and Picker.", slug: "googledrive", accent: "#4285f4", connect: "backend" },

  { id: "neon", name: "Neon", category: "Databases", description: "Serverless Postgres.", slug: "neon", accent: "#00e599", connect: "backend" },
  { id: "planetscale", name: "PlanetScale", category: "Databases", description: "MySQL-compatible branching database.", slug: "planetscale", accent: "#111111", connect: "backend" },
  { id: "mongodb", name: "MongoDB Atlas", category: "Databases", description: "Managed MongoDB clusters.", slug: "mongodb", accent: "#47a248", connect: "backend" },
  { id: "upstash", name: "Upstash", category: "Databases", description: "Serverless Redis and Kafka.", slug: "upstash", accent: "#00e9a3", connect: "backend" },
  { id: "appwrite", name: "Appwrite", category: "Databases", description: "Open-source backend platform.", slug: "appwrite", accent: "#fd366e", connect: "backend" },
  { id: "convex", name: "Convex", category: "Databases", description: "Reactive backend and database.", slug: "convex", accent: "#f3b01c", connect: "backend" },
  { id: "pocketbase", name: "PocketBase", category: "Databases", description: "Self-hosted backend in one binary.", accent: "#b8dbe4", connect: "backend" },
  { id: "prisma", name: "Prisma Data Platform", category: "Databases", description: "Database tooling and accelerate.", slug: "prisma", accent: "#2d3748", connect: "backend" },

  { id: "sentry", name: "Sentry", category: "Monitoring & automation", description: "Error monitoring with DSNs and OAuth.", slug: "sentry", accent: "#362d59", connect: "backend" },
  { id: "posthog", name: "PostHog", category: "Monitoring & automation", description: "Product analytics and session replay.", slug: "posthog", accent: "#f54e00", connect: "backend" },
  { id: "mixpanel", name: "Mixpanel", category: "Monitoring & automation", description: "Product analytics.", slug: "mixpanel", accent: "#7856ff", connect: "backend" },
  { id: "ga", name: "Google Analytics", category: "Monitoring & automation", description: "Measurement and reporting APIs.", slug: "googleanalytics", accent: "#e37400", connect: "backend" },
  { id: "zapier", name: "Zapier", category: "Monitoring & automation", description: "Automation webhooks and apps.", slug: "zapier", accent: "#ff4a00", connect: "backend" },
  { id: "make", name: "Make", category: "Monitoring & automation", description: "Scenario automation with webhooks.", slug: "make", accent: "#6d00cc", connect: "backend" },
  { id: "n8n", name: "n8n", category: "Monitoring & automation", description: "Self-hostable workflow automation.", slug: "n8n", accent: "#ea4b71", connect: "backend" },
  { id: "resend", name: "Resend", category: "Monitoring & automation", description: "Transactional email API.", slug: "resend", accent: "#111111", connect: "backend" },
  { id: "stripe", name: "Stripe", category: "Monitoring & automation", description: "Payments and billing.", slug: "stripe", accent: "#635bff", connect: "backend" },
  { id: "clerk", name: "Clerk", category: "Monitoring & automation", description: "Authentication and user management.", slug: "clerk", accent: "#6c47ff", connect: "backend" },
  { id: "auth0", name: "Auth0", category: "Monitoring & automation", description: "Identity platform.", slug: "auth0", accent: "#eb5424", connect: "backend" },
  { id: "dockerhub", name: "Docker Hub", category: "Monitoring & automation", description: "Image repositories and tokens.", slug: "docker", accent: "#2496ed", connect: "backend" },
]

export function serviceById(id: string): IntegrationService | undefined {
  return INTEGRATION_SERVICES.find((service) => service.id === id)
}
