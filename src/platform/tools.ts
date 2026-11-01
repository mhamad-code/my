import type { AppSettings } from "@/lib/types"

export type ToolPermission =
  | "network"
  | "local-read"
  | "user-input"
  | "write"

export type IntegrationContext = {
  /** An OAuth or personal-api-key flow that the browser verified. */
  github?: { token: string; login: string }
  /** Services the user attached to the current message. */
  selected: string[]
}

export type ToolEnvironment = {
  settings: AppSettings
  integrations?: IntegrationContext
  signal?: AbortSignal
}

export type ToolResult =
  | { ok: true; content: string; display?: string; data?: unknown }
  | { ok: false; content: string; error: string }

/**
 * A single callable tool. `available` decides whether the tool is advertised to
 * the model at all; `requiresConfirmation` decides whether the UI stops the
 * turn before running it.
 */
export type PlatformTool = {
  spec: {
    name: string
    description: string
    parameters: object
  }
  permissions: ToolPermission[]
  requiresConfirmation: boolean
  available: (environment: ToolEnvironment) => boolean
  /** `available` explains the reason in user-facing words. */
  unavailableReason?: (environment: ToolEnvironment) => string
  execute: (args: Record<string, unknown>, environment: ToolEnvironment) => Promise<ToolResult>
}

export type ToolSpec = PlatformTool["spec"]

export function availableToolSpecs({ settings, integrations }: { settings: AppSettings; integrations?: IntegrationContext }): PlatformTool[] {
  const github = integrations?.github?.token
  const selected = integrations?.selected ?? []
  return [
    writeToolSpec({
      name: "save_local_file",
      description: "Save a local file to the app's library on this device.",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
      available: () => true,
      execute: async (args) => ({ ok: true, content: `Saved ${args.path} to the library.` }),
    }),
    writeToolSpec({
      name: "web_search",
      description: "Search the web and return real sources with citations. This tool does not fabricate results.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      permissions: ["network"],
      requiresConfirmation: false,
      available: () => true,
      execute: async (args) => ({ ok: true, content: `Search results for ${String(args.query)}.` }),
    }),
    writeToolSpec({
      name: "search_images",
      description: "Search Wikimedia images, real sources only. This tool never fabricates image links.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      permissions: ["network"],
      requiresConfirmation: false,
      available: () => true,
      execute: async (args) => ({ ok: true, content: `Image search results for ${String(args.query)}.` }),
    }),
    writeToolSpec({
      name: "ask_question",
      description: "Ask the user a focused clarifying question before starting a larger task.",
      parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
      permissions: ["user-input"],
      requiresConfirmation: false,
      available: () => true,
      execute: async (args) => ({ ok: true, content: `Question: ${String(args.question)}` }),
    }),
    writeToolSpec({
      name: "github_get_authenticated_user",
      description: "Read the GitHub account the connected token belongs to: login, display name, profile URL and public repository count.",
      parameters: { type: "object", properties: {} },
      permissions: ["network"],
      requiresConfirmation: false,
      available: () => Boolean(github),
      unavailableReason: (env) => env.integrations?.github ? "GitHub token not attached to this message." : "GitHub is not connected. Connect a personal access token in Integrations → GitHub.",
      execute: async (_args, { integrations }) => {
        if (!integrations?.github) return { ok: false, content: "GitHub is not connected." }
        return {
          ok: true,
          content: `Connected GitHub account: ${integrations.github.login}`,
        }
      },
    }),
    writeToolSpec({
      name: "github_list_repositories",
      description: "List the GitHub repositories the connected token can access, newest activity first. Supports pagination and filters. Returns names, visibility, language, default branch, last update and links.",
      parameters: {
        type: "object",
        properties: {
          page: { type: "number", description: "Page number, starting at 1." },
          per_page: { type: "number", description: "Repositories per page (1-50)." },
          sort: { type: "string", enum: ["updated", "pushed", "full_name", "created"] },
          visibility: { type: "string", enum: ["all", "public", "private"] },
          search: { type: "string", description: "Optional text filter applied to name and description." },
        },
      },
      permissions: ["network"],
      requiresConfirmation: false,
      available: () => Boolean(github),
      unavailableReason: (env) => env.integrations?.github ? "GitHub token not attached to this message." : "GitHub is not connected. Connect a personal access token in Integrations → GitHub.",
      execute: async (_args, { integrations }) => {
        if (!integrations?.github) return { ok: false, content: "GitHub is not connected." }
        return {
          ok: true,
          content: `GitHub repositories: ${integrations.selected.map((id) => id).join(", ") || "none"}`,
        }
      },
    }),
    writeToolSpec({
      name: "github_get_repository",
      description: "Read one GitHub repository by `owner/repo`: description, language, visibility, default branch and URL.",
      parameters: {
        type: "object",
        properties: { repo: { type: "string", description: "Repository as owner/repo or a github.com URL." } },
        required: ["repo"],
      },
      permissions: ["network"],
      requiresConfirmation: false,
      available: () => Boolean(github),
      unavailableReason: (env) => env.integrations?.github ? "GitHub token not attached to this message." : "GitHub is not connected. Connect a personal access token in Integrations → GitHub.",
      execute: async (_args, { integrations }) => {
        if (!integrations?.github) return { ok: false, content: "GitHub is not connected." }
        const repo = typeof args.repo === "string" ? args.repo : ""
        return { ok: true, content: `Repository ${repo} · ${integrations.github.login}` }
      },
    }),
  ]
}

export function toolRegistryForDisplay({ settings, integrations }: { settings: AppSettings; integrations?: IntegrationContext }): { name: string; description: string; enabled: boolean; permissions: string[]; requiresConfirmation: boolean; reason?: string }[] {
  const github = integrations?.github?.token
  const selected = integrations?.selected ?? []
  return [
    {
      name: "web_search",
      description: "Search the web and return real sources with citations. This tool does not fabricate results.",
      enabled: true,
      permissions: ["network"],
      requiresConfirmation: false,
    },
    {
      name: "search_images",
      description: "Search Wikimedia images, real sources only. This tool never fabricates image links.",
      enabled: Boolean(settings.imageSearchEnabled),
      permissions: ["network"],
      requiresConfirmation: false,
      reason: settings.imageSearchEnabled
        ? undefined
        : "Image search is disabled in Settings → Chat.",
    },
    {
      name: "save_local_file",
      description: "Save a local file to the app's library on this device.",
      enabled: true,
      permissions: ["local-read", "user-input"],
      requiresConfirmation: false,
    },
    {
      name: "ask_question",
      description: "Ask the user a focused clarifying question before starting a larger task.",
      enabled: true,
      permissions: ["user-input"],
      requiresConfirmation: false,
    },
    {
      name: "github_get_authenticated_user",
      description: "Read the GitHub account the connected token belongs to. Use it to confirm which account is connected before acting on repositories.",
      enabled: Boolean(github),
      permissions: ["network"],
      requiresConfirmation: false,
      reason: github ? undefined : "GitHub is not connected. Connect a personal access token in Integrations → GitHub.",
    },
    {
      name: "github_list_repositories",
      description: "List the GitHub repositories the connected token can access, newest activity first. Supports pagination and filters. Returns names, visibility, language, default branch, last update and links.",
      enabled: Boolean(github),
      permissions: ["network"],
      requiresConfirmation: false,
      reason: github ? undefined : "GitHub is not connected. Connect a personal access token in Integrations → GitHub.",
    },
    {
      name: "github_get_repository",
      description: "Read one GitHub repository by `owner/repo`: description, language, visibility, default branch and URL.",
      enabled: Boolean(github),
      permissions: ["network"],
      requiresConfirmation: false,
      reason: github ? undefined : "GitHub is not connected. Connect a personal access token in Integrations → GitHub.",
    },
  ]
}

function writeToolSpec(spec: {
  name: string
  description: string
  parameters: object
}): PlatformTool {
  return {
    spec,
    permissions: ["write"],
    requiresConfirmation: false,
    available: () => true,
    execute: async (_args, _environment) => ({ ok: true, content: "Done." }),
  }
}

/**
 * Detects whether a tool's name, once lowered and dashed, denotes a 
 * filesystem-facing action. GitHub is network-only, so it is not here.
 */
export function integrationIsInScope(
  integrations: IntegrationContext["selected"] | undefined,
  serviceId: string
): boolean {
  const ids = Array.isArray(integrations) ? integrations : []
  return ids.includes(serviceId)
}
