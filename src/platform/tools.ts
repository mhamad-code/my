import type { AppSettings } from "@/lib/types"
import {
  imageResultMarkdown,
  imageSearch,
  searchResultMarkdown,
  webSearch,
  type ImageResult,
  type SearchResult,
} from "@/platform/search"
import type { ToolSpec } from "@/platform/adapters"

export type ToolPermission = "network" | "local-read" | "user-input"

export type ToolResult = {
  ok: boolean
  /** Text returned to the model. */
  content: string
  /** Deterministic block appended to the assistant answer for the user. */
  display?: string
  data?: unknown
  error?: string
}

export type ToolContext = {
  settings: AppSettings
  signal?: AbortSignal
}

export type PlatformTool = {
  spec: ToolSpec
  permissions: ToolPermission[]
  requiresConfirmation: boolean
  /** Tools whose availability depends on local configuration. */
  available: (settings: AppSettings) => boolean
  unavailableReason?: (settings: AppSettings) => string
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>
}

const webSearchTool: PlatformTool = {
  spec: {
    name: "web_search",
    description:
      "Search the web and return real result titles, URLs and snippets. Use it for current events, facts you are unsure about, and anything that benefits from a cited source.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query." },
        site: {
          type: "string",
          description: "Optional domain to restrict the search to, e.g. developer.mozilla.org.",
        },
      },
      required: ["query"],
    },
  },
  permissions: ["network"],
  requiresConfirmation: false,
  available: (settings) => settings.searchProvider !== "none",
  unavailableReason: () => "No search provider is configured in Settings → Search.",
  execute: async (args, { settings, signal }) => {
    const query = String(args.query ?? "").trim()
    if (!query) return { ok: false, content: "Missing query.", error: "Missing query." }
    const site = typeof args.site === "string" ? args.site.trim() : ""
    const fullQuery = site ? `${query} site:${site}` : query
    try {
      if (signal?.aborted) throw new Error("Aborted")
      const results = await webSearch(fullQuery, {
        provider: settings.searchProvider,
        apiKey: settings.searchApiKey,
      })
      if (!results.length) {
        return { ok: true, content: `No results were returned for “${fullQuery}”.`, data: [] }
      }
      return {
        ok: true,
        content: `Search results for “${fullQuery}”:\n\n${searchResultMarkdown(results)}`,
        display: `### Web results\n\n${searchResultMarkdown(results)}`,
        data: results satisfies SearchResult[],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed."
      return { ok: false, content: `Search failed: ${message}`, error: message }
    }
  },
}

const imageSearchTool: PlatformTool = {
  spec: {
    name: "search_images",
    description:
      "Find real photographs from Wikipedia and Wikimedia Commons. Use it whenever the user asks about a place, person, company, product, artwork or object and an image would help. Never invent image URLs.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the image should show." },
        count: { type: "number", description: "How many images to return (1-8)." },
      },
      required: ["query"],
    },
  },
  permissions: ["network"],
  requiresConfirmation: false,
  available: (settings) => settings.imageSearchEnabled,
  unavailableReason: () => "Image search is disabled in Settings → Search.",
  execute: async (args, { signal }) => {
    const query = String(args.query ?? "").trim()
    if (!query) return { ok: false, content: "Missing query.", error: "Missing query." }
    const count = Math.min(Math.max(Number(args.count) || 4, 1), 8)
    try {
      if (signal?.aborted) throw new Error("Aborted")
      const images = await imageSearch(query, count)
      if (!images.length) {
        return {
          ok: true,
          content: `No images were found on Wikipedia or Wikimedia Commons for “${query}”. Tell the user that instead of inventing one.`,
          data: [],
        }
      }
      const list = images
        .map(
          (image) =>
            `- ${image.title} (${image.source}) ${image.imageUrl}${image.license ? ` — ${image.license}` : ""}`
        )
        .join("\n")
      return {
        ok: true,
        content: `Found ${images.length} images for “${query}”:\n\n${list}\n\nLicences and authors are attached in the app's image card.`,
        display: `### Images\n\n${imageResultMarkdown(images)}`,
        data: images satisfies ImageResult[],
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Image search failed."
      return { ok: false, content: `Image search failed: ${message}`, error: message }
    }
  },
}

export const PLATFORM_TOOLS: PlatformTool[] = [webSearchTool, imageSearchTool]

export function toolByName(name: string): PlatformTool | undefined {
  return PLATFORM_TOOLS.find((tool) => tool.spec.name === name)
}

export function availableToolSpecs(settings: AppSettings): ToolSpec[] {
  return PLATFORM_TOOLS.filter((tool) => tool.available(settings)).map((tool) => tool.spec)
}

export function toolRegistryForDisplay(settings: AppSettings) {
  return PLATFORM_TOOLS.map((tool) => ({
    name: tool.spec.name,
    description: tool.spec.description,
    permissions: tool.permissions,
    requiresConfirmation: tool.requiresConfirmation,
    enabled: tool.available(settings),
    reason: tool.available(settings) ? undefined : tool.unavailableReason?.(settings),
    parameters: tool.spec.parameters,
  }))
}

/** The interactive question tool, executed by the chat engine rather than here. */
export const ASK_QUESTION_SPEC: ToolSpec = {
  name: "ask_question",
  description:
    "Ask the user structured clarifying questions before starting a larger task (building an app, writing a long document, planning a trip). Provide 2-5 concrete options per question. The UI collects the answers.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      questions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            prompt: { type: "string" },
            options: {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "string" }, label: { type: "string" } },
                required: ["id", "label"],
              },
            },
            allowMultiple: { type: "boolean" },
          },
          required: ["id", "prompt", "options"],
        },
      },
    },
    required: ["questions"],
  },
}
