import {
  type CapabilityState,
  type ModelCapabilities,
  type ModelInfo,
  type ProviderDefinition,
  getProvider,
} from "@/platform/providers"
import type { ModelSettings } from "@/lib/types"

export type ProviderCredentials = {
  apiKey: string
  endpoint?: string
  apiVersion?: string
}

export type ToolSpec = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type ToolCall = {
  id: string
  name: string
  arguments: string
}

export type ChatTurn =
  | { role: "user"; content: string; images?: { mimeType: string; dataUrl: string }[] }
  | {
      role: "assistant"
      content: string
      toolCalls?: ToolCall[]
    }
  | { role: "tool"; toolCallId: string; name: string; content: string }

export type ProviderRequest = {
  provider: ProviderDefinition
  credentials: ProviderCredentials
  model: string
  turns: ChatTurn[]
  system?: string
  settings?: ModelSettings
  tools?: ToolSpec[]
  signal?: AbortSignal
}

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; inputTokens?: number; outputTokens?: number }
  | { type: "done"; finishReason?: string }

export class ProviderError extends Error {
  status?: number
  retryable: boolean
  constructor(message: string, options?: { status?: number; retryable?: boolean }) {
    super(message)
    this.name = "ProviderError"
    this.status = options?.status
    this.retryable = options?.retryable ?? false
  }
}

export class ProxyRequiredError extends ProviderError {
  constructor(message: string) {
    super(message, { retryable: false })
    this.name = "ProxyRequiredError"
  }
}

function authHeaders(
  provider: ProviderDefinition,
  credentials: ProviderCredentials
): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  switch (provider.kind) {
    case "anthropic":
      headers["x-api-key"] = credentials.apiKey
      headers["anthropic-version"] = "2023-06-01"
      // Documented opt-in header for browser calls.
      headers["anthropic-dangerous-direct-browser-access"] = "true"
      break
    case "azure-openai":
      headers["api-key"] = credentials.apiKey
      break
    default:
      headers.Authorization = `Bearer ${credentials.apiKey}`
  }
  if (provider.id === "openrouter") {
    headers["HTTP-Referer"] = window.location.origin
    headers["X-Title"] = "AI Platform"
  }
  return headers
}

function baseUrl(provider: ProviderDefinition, credentials: ProviderCredentials): string {
  if (provider.kind === "azure-openai") {
    if (!credentials.endpoint?.trim()) {
      throw new ProviderError("Add your Azure resource endpoint in the provider settings.")
    }
    return credentials.endpoint.replace(/\/+$/, "")
  }
  if (!provider.baseUrl) throw new ProviderError(`${provider.name} has no public API base URL.`)
  return provider.baseUrl.replace(/\/+$/, "")
}

export function chatEndpoint(
  provider: ProviderDefinition,
  credentials: ProviderCredentials
): string {
  if (provider.requiresProxy) {
    throw new ProxyRequiredError(
      provider.browserNote ??
        `${provider.name} cannot be called from a browser without your own secure proxy.`
    )
  }
  const base = baseUrl(provider, credentials)
  if (provider.kind === "google") return `${base}/models`
  const path = provider.chatPath ?? "/chat/completions"
  if (provider.kind === "azure-openai") {
    const version = credentials.apiVersion?.trim() || "2024-10-21"
    return `${base}${path}?api-version=${encodeURIComponent(version)}`
  }
  return `${base}${path}`
}

async function readError(response: Response): Promise<string> {
  let detail = ""
  try {
    const text = await response.text()
    try {
      const json = JSON.parse(text) as {
        error?: { message?: string } | string
        message?: string
      }
      if (typeof json.error === "string") detail = json.error
      else detail = json.error?.message ?? json.message ?? text
    } catch {
      detail = text
    }
  } catch {
    // ignore body read failures
  }
  const trimmed = detail.trim().slice(0, 500)
  switch (response.status) {
    case 401:
    case 403:
      return `Authentication failed (${response.status}). Check the API key and its permissions.${trimmed ? ` ${trimmed}` : ""}`
    case 402:
      return `Insufficient credits for this provider.${trimmed ? ` ${trimmed}` : ""}`
    case 404:
      return `Endpoint or model not found (404).${trimmed ? ` ${trimmed}` : ""}`
    case 429:
      return `Rate limited by the provider (429). Try again shortly.${trimmed ? ` ${trimmed}` : ""}`
    default:
      return `Provider error ${response.status}.${trimmed ? ` ${trimmed}` : ""}`
  }
}

async function request(
  url: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<Response> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ProviderError(
      "The request never reached the provider. This usually means the browser blocked it (CORS) or the network is offline. Check the provider's browser/CORS policy or use a proxy.",
      { retryable: true }
    )
  }
  if (!response.ok) {
    throw new ProviderError(await readError(response), {
      status: response.status,
      retryable: response.status === 429 || response.status >= 500,
    })
  }
  return response
}

/** Minimal SSE reader: yields the JSON payload of each `data:` frame. */
async function* sseFrames(response: Response): AsyncGenerator<unknown> {
  if (!response.body) throw new ProviderError("The provider returned an empty stream.")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const data = raw
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("")
        if (data && data !== "[DONE]") {
          try {
            yield JSON.parse(data)
          } catch {
            // Providers occasionally send keepalive comments; ignore them.
          }
        }
        boundary = buffer.indexOf("\n\n")
      }
    }
  } finally {
    reader.releaseLock()
  }
}

/* -------------------------------------------------------------------------- */
/* Capability derivation — provider metadata only, never model-name guessing   */
/* -------------------------------------------------------------------------- */

const state = (value: boolean | undefined): CapabilityState =>
  value === undefined ? "unknown" : value ? "supported" : "unsupported"

function openRouterCapabilities(entry: Record<string, unknown>): ModelCapabilities {
  const architecture = (entry.architecture ?? {}) as {
    input_modalities?: string[]
    output_modalities?: string[]
  }
  const input = architecture.input_modalities ?? []
  const output = architecture.output_modalities ?? []
  const params = (entry.supported_parameters ?? []) as string[]
  const capabilities: ModelCapabilities = {
    text: state(true),
    vision: state(input.includes("image")),
    "audio-input": state(input.includes("audio")),
    "audio-output": state(output.includes("audio")),
    "file-upload": state(input.includes("file")),
    pdf: state(input.includes("file")),
    video: state(input.includes("video")),
    "image-generation": state(output.includes("image")),
    "image-editing":
      input.includes("image") && output.includes("image")
        ? "supported"
        : input.includes("image") || output.includes("image")
          ? "unknown"
          : "unsupported",
    "tool-calling": state(params.includes("tools")),
    "structured-output": state(
      params.includes("structured_outputs") || params.includes("response_format")
    ),
    reasoning: state(params.includes("reasoning") || params.includes("include_reasoning")),
    "web-search": state(params.includes("web_search_options")),
  }
  return capabilities
}

function parsePrice(value: unknown): number | undefined {
  const numeric = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN
  if (!Number.isFinite(numeric)) return undefined
  // OpenRouter prices are USD per token.
  return numeric * 1_000_000
}

function toTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  return undefined
}

function parseOpenAICompatibleModels(
  provider: ProviderDefinition,
  payload: unknown
): ModelInfo[] {
  const data =
    payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: Record<string, unknown>[] }).data)
      : Array.isArray(payload)
        ? (payload as Record<string, unknown>[])
        : []
  return data
    .map((entry): ModelInfo | null => {
      const id = typeof entry.id === "string" ? entry.id : undefined
      if (!id) return null
      const context =
        typeof entry.context_length === "number"
          ? entry.context_length
          : typeof entry.context_window === "number"
            ? entry.context_window
            : typeof entry.max_context_length === "number"
              ? (entry.max_context_length as number)
              : undefined
      const topProvider = (entry.top_provider ?? {}) as { max_completion_tokens?: number }
      const pricingSource = (entry.pricing ?? {}) as Record<string, unknown>
      const pricing =
        Object.keys(pricingSource).length > 0
          ? {
              inputPerMTokens: parsePrice(pricingSource.prompt),
              outputPerMTokens: parsePrice(pricingSource.completion),
              raw: Object.fromEntries(
                Object.entries(pricingSource).map(([key, value]) => [key, String(value)])
              ),
            }
          : undefined
      return {
        id,
        name: typeof entry.name === "string" && entry.name ? entry.name : id,
        providerId: provider.id,
        description: typeof entry.description === "string" ? entry.description : undefined,
        contextLength: context,
        maxOutputTokens: topProvider.max_completion_tokens,
        updatedAt: toTimestamp(entry.created) ?? toTimestamp(entry.created_at),
        pricing,
        capabilities:
          provider.id === "openrouter"
            ? openRouterCapabilities(entry)
            : { text: "unknown" },
        free: pricingSource.prompt === "0" && pricingSource.completion === "0" ? true : undefined,
      }
    })
    .filter((model): model is ModelInfo => model !== null)
}

/* -------------------------------------------------------------------------- */
/* Model discovery                                                             */
/* -------------------------------------------------------------------------- */

export async function discoverModels(
  provider: ProviderDefinition,
  credentials: ProviderCredentials,
  signal?: AbortSignal
): Promise<ModelInfo[]> {
  if (provider.requiresProxy) {
    throw new ProxyRequiredError(
      provider.browserNote ?? `${provider.name} requires a secure proxy.`
    )
  }
  if (!provider.supportsModelDiscovery) {
    throw new ProviderError(`${provider.name} does not publish a browser-reachable model list.`)
  }
  const base = baseUrl(provider, credentials)
  const headers = authHeaders(provider, credentials)
  delete headers["Content-Type"]

  if (provider.kind === "google") {
    const url = `${base}/models?pageSize=1000&key=${encodeURIComponent(credentials.apiKey)}`
    const response = await request(url, { headers: { "Content-Type": "application/json" } }, signal)
    const payload = (await response.json()) as {
      models?: {
        name?: string
        displayName?: string
        description?: string
        inputTokenLimit?: number
        outputTokenLimit?: number
        supportedGenerationMethods?: string[]
      }[]
    }
    return (payload.models ?? [])
      .filter((model) => model.name)
      .map((model): ModelInfo => {
        const methods = model.supportedGenerationMethods ?? []
        const id = (model.name ?? "").replace(/^models\//, "")
        return {
          id,
          name: model.displayName ?? id,
          providerId: provider.id,
          description: model.description,
          contextLength: model.inputTokenLimit,
          maxOutputTokens: model.outputTokenLimit,
          capabilities: {
            text: state(methods.includes("generateContent")),
            "image-generation": state(methods.includes("predict")),
            "tool-calling": state(methods.includes("generateContent")),
            "structured-output": state(methods.includes("generateContent")),
            reasoning: "unknown",
          },
        }
      })
  }

  if (provider.kind === "anthropic") {
    const response = await request(
      `${base}/models?limit=100`,
      { headers },
      signal
    )
    const payload = (await response.json()) as {
      data?: { id?: string; display_name?: string; created_at?: string }[]
    }
    return (payload.data ?? [])
      .filter((entry) => entry.id)
      .map((entry): ModelInfo => ({
        id: entry.id as string,
        name: entry.display_name ?? (entry.id as string),
        providerId: provider.id,
        updatedAt: toTimestamp(entry.created_at),
        capabilities: { text: "supported", "tool-calling": "unknown" },
      }))
  }

  if (provider.kind === "cohere" && provider.modelsPath) {
    const response = await request(`${base}${provider.modelsPath}?page_size=1000`, { headers }, signal)
    const payload = (await response.json()) as {
      models?: { name?: string; endpoints?: string[]; context_length?: number }[]
    }
    return (payload.models ?? [])
      .filter((model) => model.name)
      .map((model): ModelInfo => ({
        id: model.name as string,
        name: model.name as string,
        providerId: provider.id,
        contextLength: model.context_length,
        capabilities: {
          text: state((model.endpoints ?? []).includes("chat")),
          "tool-calling": "unknown",
        },
      }))
  }

  const response = await request(`${base}${provider.modelsPath ?? "/models"}`, { headers }, signal)
  const payload = (await response.json()) as unknown
  const models = parseOpenAICompatibleModels(provider, payload)
  if (models.length === 0) {
    throw new ProviderError(
      "The provider responded, but its model list was empty or in an unexpected format."
    )
  }
  return models
}

/* -------------------------------------------------------------------------- */
/* Connection test                                                             */
/* -------------------------------------------------------------------------- */

export type ConnectionTestResult = {
  ok: boolean
  message: string
  modelsCount?: number
  models?: ModelInfo[]
  checkedAt: number
}

export async function testConnection(
  providerId: string,
  credentials: ProviderCredentials,
  options?: { model?: string; signal?: AbortSignal }
): Promise<ConnectionTestResult> {
  const provider = getProvider(providerId)
  const checkedAt = Date.now()
  if (!provider) return { ok: false, message: "Unknown provider.", checkedAt }
  if (!credentials.apiKey.trim()) {
    return { ok: false, message: "Enter an API key first.", checkedAt }
  }
  if (provider.requiresProxy) {
    return { ok: false, message: provider.browserNote ?? "This provider needs a secure proxy.", checkedAt }
  }

  try {
    if (provider.supportsModelDiscovery) {
      const models = await discoverModels(provider, credentials, options?.signal)
      return {
        ok: true,
        message: `Connected. The provider returned ${models.length} models.`,
        modelsCount: models.length,
        models,
        checkedAt,
      }
    }
    const model = options?.model?.trim()
    if (!model) {
      return {
        ok: false,
        message:
          "This provider has no browser model list. Enter the model id you want to use, then test again.",
        checkedAt,
      }
    }
    let received = ""
    for await (const event of streamChat({
      provider,
      credentials,
      model,
      turns: [{ role: "user", content: "Reply with OK." }],
      settings: { maxTokens: 8 },
      signal: options?.signal,
    })) {
      if (event.type === "text") received += event.text
    }
    return {
      ok: true,
      message: received
        ? `Connected. The model replied: “${received.trim().slice(0, 60)}”.`
        : "Connected. The model accepted the request.",
      checkedAt,
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Connection failed.",
      checkedAt,
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Chat streaming                                                              */
/* -------------------------------------------------------------------------- */

function openAIMessages(turns: ChatTurn[], system?: string) {
  const messages: Record<string, unknown>[] = []
  if (system?.trim()) messages.push({ role: "system", content: system.trim() })
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({
        role: "user",
        content:
          turn.images?.length
            ? [
                { type: "text", text: turn.content || "Describe this image." },
                ...turn.images.map((image) => ({
                  type: "image_url",
                  image_url: { url: image.dataUrl },
                })),
              ]
            : turn.content,
      })
    } else if (turn.role === "assistant") {
      messages.push({
        role: "assistant",
        content: turn.content || null,
        ...(turn.toolCalls?.length
          ? {
              tool_calls: turn.toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : {}),
      })
    } else {
      messages.push({ role: "tool", tool_call_id: turn.toolCallId, content: turn.content })
    }
  }
  return messages
}

async function* streamOpenAI(requestInfo: ProviderRequest): AsyncGenerator<StreamEvent> {
  const { provider, credentials, model, settings, signal } = requestInfo
  const body: Record<string, unknown> = {
    model,
    messages: openAIMessages(requestInfo.turns, requestInfo.system),
    stream: true,
  }
  if (settings?.temperature !== undefined) body.temperature = settings.temperature
  if (settings?.topP !== undefined) body.top_p = settings.topP
  if (settings?.maxTokens !== undefined) body.max_tokens = settings.maxTokens
  if (settings?.frequencyPenalty !== undefined) body.frequency_penalty = settings.frequencyPenalty
  if (settings?.presencePenalty !== undefined) body.presence_penalty = settings.presencePenalty
  if (settings?.stop?.length) body.stop = settings.stop
  if (settings?.seed !== undefined) body.seed = settings.seed
  if (settings?.responseFormat === "json") body.response_format = { type: "json_object" }
  if (settings?.reasoningEffort) {
    if (provider.id === "openrouter") body.reasoning = { effort: settings.reasoningEffort }
    else body.reasoning_effort = settings.reasoningEffort
  }
  if (requestInfo.tools?.length) {
    body.tools = requestInfo.tools.map((tool) => ({
      type: "function",
      function: { name: tool.name, description: tool.description, parameters: tool.parameters },
    }))
    body.tool_choice = "auto"
  }

  const url = chatEndpoint(provider, credentials)
  const response = await request(
    url,
    {
      method: "POST",
      headers: authHeaders(provider, credentials),
      body: JSON.stringify(body),
    },
    signal
  )

  const pending = new Map<number, ToolCall>()
  for await (const frame of sseFrames(response)) {
    const data = frame as {
      choices?: {
        delta?: {
          content?: string | null
          reasoning?: string | null
          reasoning_content?: string | null
          tool_calls?: {
            index?: number
            id?: string
            function?: { name?: string; arguments?: string }
          }[]
        }
        finish_reason?: string | null
      }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
      error?: { message?: string }
    }
    if (data.error?.message) throw new ProviderError(data.error.message)
    const choice = data.choices?.[0]
    if (choice?.delta) {
      const delta = choice.delta
      if (typeof delta.content === "string" && delta.content) {
        yield { type: "text", text: delta.content }
      }
      const reasoning = delta.reasoning ?? delta.reasoning_content
      if (typeof reasoning === "string" && reasoning) {
        yield { type: "reasoning", text: reasoning }
      }
      for (const call of delta.tool_calls ?? []) {
        const index = call.index ?? 0
        const existing = pending.get(index) ?? { id: "", name: "", arguments: "" }
        pending.set(index, {
          id: call.id ?? existing.id,
          name: call.function?.name ?? existing.name,
          arguments: existing.arguments + (call.function?.arguments ?? ""),
        })
      }
    }
    if (choice?.finish_reason) {
      for (const [index, call] of pending) {
        yield {
          type: "tool_call",
          call: {
            id: call.id || `call_${index}_${crypto.randomUUID().slice(0, 8)}`,
            name: call.name,
            arguments: call.arguments,
          },
        }
      }
      pending.clear()
      if (data.usage) {
        yield {
          type: "usage",
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
        }
      }
      yield { type: "done", finishReason: choice.finish_reason }
    } else if (data.usage) {
      yield {
        type: "usage",
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
      }
    }
  }
}

function anthropicMessages(turns: ChatTurn[]) {
  const messages: Record<string, unknown>[] = []
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({
        role: "user",
        content: turn.images?.length
          ? [
              { type: "text", text: turn.content || "Describe this image." },
              ...turn.images.map((image) => ({
                type: "image",
                source: {
                  type: "base64",
                  media_type: image.mimeType,
                  data: image.dataUrl.split(",")[1] ?? "",
                },
              })),
            ]
          : turn.content,
      })
    } else if (turn.role === "assistant") {
      const blocks: Record<string, unknown>[] = []
      if (turn.content) blocks.push({ type: "text", text: turn.content })
      for (const call of turn.toolCalls ?? []) {
        let input: unknown = {}
        try {
          input = JSON.parse(call.arguments || "{}")
        } catch {
          input = {}
        }
        blocks.push({ type: "tool_use", id: call.id, name: call.name, input })
      }
      messages.push({ role: "assistant", content: blocks.length ? blocks : turn.content })
    } else {
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: turn.toolCallId,
            content: turn.content,
          },
        ],
      })
    }
  }
  return messages
}

async function* streamAnthropic(info: ProviderRequest): AsyncGenerator<StreamEvent> {
  const { provider, credentials, model, settings, signal } = info
  const body: Record<string, unknown> = {
    model,
    max_tokens: settings?.maxTokens ?? 4096,
    messages: anthropicMessages(info.turns),
    stream: true,
  }
  if (info.system?.trim()) body.system = info.system.trim()
  if (settings?.temperature !== undefined) body.temperature = settings.temperature
  if (settings?.topP !== undefined) body.top_p = settings.topP
  if (settings?.stop?.length) body.stop_sequences = settings.stop
  if (settings?.reasoningEffort) {
    const budget = settings.reasoningEffort === "high" ? 8192 : settings.reasoningEffort === "medium" ? 4096 : 1024
    body.thinking = { type: "enabled", budget_tokens: Math.min(budget, (settings.maxTokens ?? 4096) - 1) }
  }
  if (info.tools?.length) {
    body.tools = info.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }))
  }

  const response = await request(
    chatEndpoint(provider, credentials),
    {
      method: "POST",
      headers: authHeaders(provider, credentials),
      body: JSON.stringify(body),
    },
    signal
  )

  const blocks = new Map<number, { id: string; name: string; json: string }>()
  for await (const frame of sseFrames(response)) {
    const event = frame as {
      type?: string
      index?: number
      content_block?: { type?: string; id?: string; name?: string }
      delta?: {
        type?: string
        text?: string
        thinking?: string
        partial_json?: string
        stop_reason?: string
      }
      usage?: { input_tokens?: number; output_tokens?: number }
      message?: { usage?: { input_tokens?: number; output_tokens?: number } }
      error?: { message?: string }
    }
    if (event.type === "error" && event.error?.message) throw new ProviderError(event.error.message)
    if (event.type === "message_start" && event.message?.usage) {
      yield { type: "usage", inputTokens: event.message.usage.input_tokens }
    }
    if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
      blocks.set(event.index ?? 0, {
        id: event.content_block.id ?? crypto.randomUUID(),
        name: event.content_block.name ?? "",
        json: "",
      })
    }
    if (event.type === "content_block_delta") {
      const delta = event.delta
      if (delta?.type === "text_delta" && delta.text) yield { type: "text", text: delta.text }
      if (delta?.type === "thinking_delta" && delta.thinking) {
        yield { type: "reasoning", text: delta.thinking }
      }
      if (delta?.type === "input_json_delta" && delta.partial_json && event.index !== undefined) {
        const block = blocks.get(event.index)
        if (block) block.json += delta.partial_json
      }
    }
    if (event.type === "content_block_stop" && event.index !== undefined) {
      const block = blocks.get(event.index)
      if (block) {
        yield {
          type: "tool_call",
          call: { id: block.id, name: block.name, arguments: block.json || "{}" },
        }
        blocks.delete(event.index)
      }
    }
    if (event.type === "message_delta") {
      if (event.usage?.output_tokens) {
        yield { type: "usage", outputTokens: event.usage.output_tokens }
      }
      if (event.delta?.stop_reason) yield { type: "done", finishReason: event.delta.stop_reason }
    }
  }
}

async function* streamGoogle(info: ProviderRequest): AsyncGenerator<StreamEvent> {
  const { provider, credentials, model, settings, signal } = info
  const contents: Record<string, unknown>[] = info.turns
    .filter((turn) => turn.role !== "tool")
    .map((turn) => {
      if (turn.role === "user") {
        return {
          role: "user",
          parts: [
            ...(turn.content ? [{ text: turn.content }] : []),
            ...(turn.images ?? []).map((image) => ({
              inlineData: {
                mimeType: image.mimeType,
                data: image.dataUrl.split(",")[1] ?? "",
              },
            })),
          ],
        }
      }
      const parts: Record<string, unknown>[] = []
      if (turn.content) parts.push({ text: turn.content })
      for (const call of turn.toolCalls ?? []) {
        let args: unknown = {}
        try {
          args = JSON.parse(call.arguments || "{}")
        } catch {
          args = {}
        }
        parts.push({ functionCall: { name: call.name, args } })
      }
      return { role: "model", parts }
    })

  // Tool results are sent back as user-role functionResponse parts.
  const toolTurns = info.turns.filter((turn) => turn.role === "tool")
  if (toolTurns.length) {
    contents.push({
      role: "user",
      parts: toolTurns.map((turn) => ({
        functionResponse: {
          name: turn.role === "tool" ? turn.name : "",
          response: { result: turn.role === "tool" ? turn.content : "" },
        },
      })) as unknown[],
    })
  }

  const generationConfig: Record<string, unknown> = {}
  if (settings?.temperature !== undefined) generationConfig.temperature = settings.temperature
  if (settings?.topP !== undefined) generationConfig.topP = settings.topP
  if (settings?.maxTokens !== undefined) generationConfig.maxOutputTokens = settings.maxTokens
  if (settings?.stop?.length) generationConfig.stopSequences = settings.stop
  if (settings?.responseFormat === "json") generationConfig.responseMimeType = "application/json"

  const body: Record<string, unknown> = {
    contents,
    generationConfig,
  }
  if (info.system?.trim()) body.systemInstruction = { parts: [{ text: info.system.trim() }] }
  if (info.tools?.length) {
    body.tools = [
      {
        functionDeclarations: info.tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      },
    ]
  }

  const base = baseUrl(provider, credentials)
  const url = `${base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(credentials.apiKey)}`
  const response = await request(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, signal)

  let toolIndex = 0
  for await (const frame of sseFrames(response)) {
    const data = frame as {
      candidates?: {
        content?: { parts?: { text?: string; thought?: boolean; functionCall?: { name?: string; args?: unknown } }[] }
        finishReason?: string
      }[]
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
      error?: { message?: string }
    }
    if (data.error?.message) throw new ProviderError(data.error.message)
    const candidate = data.candidates?.[0]
    for (const part of candidate?.content?.parts ?? []) {
      if (typeof part.text === "string" && part.text) {
        yield { type: part.thought ? "reasoning" : "text", text: part.text }
      }
      if (part.functionCall?.name) {
        yield {
          type: "tool_call",
          call: {
            id: `call_${toolIndex++}_${Date.now()}`,
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
        }
      }
    }
    if (data.usageMetadata) {
      yield {
        type: "usage",
        inputTokens: data.usageMetadata.promptTokenCount,
        outputTokens: data.usageMetadata.candidatesTokenCount,
      }
    }
    if (candidate?.finishReason) yield { type: "done", finishReason: candidate.finishReason }
  }
}

async function* streamCohere(info: ProviderRequest): AsyncGenerator<StreamEvent> {
  const { provider, credentials, model, settings, signal } = info
  const messages: Record<string, unknown>[] = []
  if (info.system?.trim()) messages.push({ role: "system", content: info.system.trim() })
  for (const turn of info.turns) {
    if (turn.role === "tool") continue
    messages.push({ role: turn.role, content: turn.content })
  }
  const body: Record<string, unknown> = { model, messages, stream: true }
  if (settings?.temperature !== undefined) body.temperature = settings.temperature
  if (settings?.maxTokens !== undefined) body.max_tokens = settings.maxTokens
  if (settings?.topP !== undefined) body.p = settings.topP
  if (settings?.stop?.length) body.stop_sequences = settings.stop

  const response = await request(
    chatEndpoint(provider, credentials),
    { method: "POST", headers: authHeaders(provider, credentials), body: JSON.stringify(body) },
    signal
  )
  for await (const frame of sseFrames(response)) {
    const event = frame as {
      type?: string
      delta?: {
        message?: { content?: { text?: string } }
        usage?: { tokens?: { input_tokens?: number; output_tokens?: number } }
      }
      finish_reason?: string
      error?: { message?: string }
    }
    if (event.type === "error" && event.error?.message) throw new ProviderError(event.error.message)
    const text = event.delta?.message?.content?.text
    if (typeof text === "string" && text) yield { type: "text", text }
    if (event.delta?.usage?.tokens) {
      yield {
        type: "usage",
        inputTokens: event.delta.usage.tokens.input_tokens,
        outputTokens: event.delta.usage.tokens.output_tokens,
      }
    }
    if (event.type === "message-end") {
      yield { type: "done", finishReason: event.finish_reason }
    }
  }
}

export async function* streamChat(info: ProviderRequest): AsyncGenerator<StreamEvent> {
  const { provider } = info
  if (provider.requiresProxy) {
    throw new ProxyRequiredError(
      provider.browserNote ?? `${provider.name} requires a secure proxy.`
    )
  }
  switch (provider.kind) {
    case "anthropic":
      yield* streamAnthropic(info)
      return
    case "google":
      yield* streamGoogle(info)
      return
    case "cohere":
      yield* streamCohere(info)
      return
    case "openai-compatible":
    case "azure-openai":
      yield* streamOpenAI(info)
      return
    default:
      throw new ProviderError(`${provider.name} is not callable from the browser.`)
  }
}

/* -------------------------------------------------------------------------- */
/* Image generation                                                           */
/* -------------------------------------------------------------------------- */

export type ImageGenerationRequest = {
  provider: ProviderDefinition
  credentials: ProviderCredentials
  model: string
  prompt: string
  size?: string
  quality?: string
  count?: number
  inputImage?: { mimeType: string; dataUrl: string }
  signal?: AbortSignal
}

export async function generateImages(req: ImageGenerationRequest): Promise<
  { mimeType: string; dataUrl: string }[]
> {
  const { provider, credentials, model, prompt, signal } = req
  if (provider.id === "openrouter") {
    const content: unknown[] = [{ type: "text", text: prompt }]
    if (req.inputImage) content.push({ type: "image_url", image_url: { url: req.inputImage.dataUrl } })
    const response = await request(
      `${baseUrl(provider, credentials)}/chat/completions`,
      {
        method: "POST",
        headers: authHeaders(provider, credentials),
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content }],
          modalities: ["image", "text"],
        }),
      },
      signal
    )
    const payload = (await response.json()) as {
      choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[]
    }
    const urls = (payload.choices?.[0]?.message?.images ?? [])
      .map((image) => image.image_url?.url)
      .filter((url): url is string => typeof url === "string")
    if (!urls.length) {
      throw new ProviderError("The model returned no image. It may not support image output.")
    }
    return urls.map((dataUrl) => ({ mimeType: mimeTypeOfDataUrl(dataUrl), dataUrl }))
  }

  if (provider.kind !== "openai-compatible" || !provider.supportsImageApi) {
    throw new ProviderError(`${provider.name} does not expose a browser image generation endpoint.`)
  }

  const base = baseUrl(provider, credentials)
  const headers = authHeaders(provider, credentials)

  if (req.inputImage) {
    const form = new FormData()
    form.append("model", model)
    form.append("prompt", prompt)
    if (req.size) form.append("size", req.size)
    const blob = await (await fetch(req.inputImage.dataUrl)).blob()
    form.append("image", blob, "source.png")
    const response = await request(
      `${base}/images/edits`,
      { method: "POST", headers: { Authorization: headers.Authorization }, body: form },
      signal
    )
    const payload = (await response.json()) as { data?: { b64_json?: string; url?: string }[] }
    return (payload.data ?? []).map((item) => imageFromApiItem(item)).filter(Boolean) as {
      mimeType: string
      dataUrl: string
    }[]
  }

  const body: Record<string, unknown> = {
    model,
    prompt,
    n: req.count ?? 1,
  }
  if (req.size) body.size = req.size
  if (req.quality) body.quality = req.quality
  const response = await request(
    `${base}/images/generations`,
    { method: "POST", headers, body: JSON.stringify(body) },
    signal
  )
  const payload = (await response.json()) as { data?: { b64_json?: string; url?: string }[] }
  const images = (payload.data ?? [])
    .map((item) => imageFromApiItem(item))
    .filter((item): item is { mimeType: string; dataUrl: string } => item !== null)
  if (!images.length) throw new ProviderError("The provider returned no images.")
  return images
}

function imageFromApiItem(item: { b64_json?: string; url?: string }) {
  if (item.b64_json) {
    return { mimeType: "image/png", dataUrl: `data:image/png;base64,${item.b64_json}` }
  }
  if (item.url) return { mimeType: mimeTypeOfDataUrl(item.url), dataUrl: item.url }
  return null
}

function mimeTypeOfDataUrl(url: string): string {
  const match = /^data:([^;]+);/.exec(url)
  return match?.[1] ?? "image/png"
}
