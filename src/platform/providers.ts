/**
 * Provider catalog. Every field here is metadata the provider itself documents;
 * nothing in this file invents capabilities or model counts. Model lists and
 * capability states come from the provider at request time (see adapters.ts).
 */

export const MODEL_CAPABILITIES = [
  "text",
  "vision",
  "image-generation",
  "image-editing",
  "file-upload",
  "pdf",
  "audio-input",
  "audio-output",
  "video",
  "tool-calling",
  "web-search",
  "structured-output",
  "reasoning",
] as const

export type ModelCapability = (typeof MODEL_CAPABILITIES)[number]
export type CapabilityState = "supported" | "unsupported" | "unknown"
export type ModelCapabilities = Partial<Record<ModelCapability, CapabilityState>>

export type ModelPricing = {
  /** USD per million input tokens, when the provider publishes it. */
  inputPerMTokens?: number
  /** USD per million output tokens, when the provider publishes it. */
  outputPerMTokens?: number
  /** Raw provider pricing strings, kept verbatim. */
  raw?: Record<string, string>
}

export type ModelInfo = {
  id: string
  name: string
  providerId: string
  description?: string
  contextLength?: number
  maxOutputTokens?: number
  /** Provider timestamp, normalized to milliseconds. */
  updatedAt?: number
  pricing?: ModelPricing
  capabilities: ModelCapabilities
  /** Provider-marked free tier, only when the provider says so. */
  free?: boolean
}

export type ProviderKind =
  | "openai-compatible"
  | "anthropic"
  | "google"
  | "cohere"
  | "azure-openai"
  | "proxy-only"

export type ProviderExtraField = "endpoint" | "apiVersion"

export type ProviderDefinition = {
  id: string
  name: string
  tagline: string
  description: string
  kind: ProviderKind
  /** Simple Icons slug for the official mark, when one exists. */
  logSlug?: string
  /** Fallback mark colour used when the icon CDN has no logo. */
  accent: string
  docsUrl: string
  keyUrl?: string
  baseUrl?: string
  modelsPath?: string
  chatPath?: string
  apiKeyHint?: string
  extraFields?: ProviderExtraField[]
  /**
   * true when model discovery is documented and browser-reachable.
   * Providers marked false accept manually entered model ids instead.
   */
  supportsModelDiscovery: boolean
  /** true when the provider can stream completions from a browser context. */
  supportsChat: boolean
  /** true when the provider can list models inside the app. */
  supportsModels: boolean
  /** true when the provider exposes an OpenAI-style images endpoint. */
  supportsImageApi?: boolean
  /** true when the provider refuses requests without a server-side proxy. */
  requiresProxy?: boolean
  /** Shown in the UI whenever the provider cannot be used from the browser. */
  browserNote?: string
  /** Adapter capability: the provider's API accepts tool definitions. */
  supportsTools: boolean
  /** Adapter capability: the provider streams reasoning summaries. */
  streamsReasoning: boolean
  /** Wiring notes shown on the provider page. */
  notes?: string[]
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    tagline: "One API for hundreds of models",
    description:
      "Unified gateway exposing models from many labs, with published pricing, context windows and modality metadata.",
    kind: "openai-compatible",
    logSlug: "openrouter",
    accent: "#6467f2",
    docsUrl: "https://openrouter.ai/docs",
    keyUrl: "https://openrouter.ai/keys",
    baseUrl: "https://openrouter.ai/api/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    apiKeyHint: "sk-or-v1-…",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsImageApi: true,
    supportsTools: true,
    streamsReasoning: true,
    notes: [
      "Model metadata (modalities, pricing, context) is read from OpenRouter's own /models payload.",
      "Image output uses chat completions with image modalities; only models that declare image output are offered.",
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    tagline: "GPT and o-series models",
    description: "Direct access to OpenAI's chat, reasoning and image models.",
    kind: "openai-compatible",
    logSlug: "openai",
    accent: "#10a37f",
    docsUrl: "https://platform.openai.com/docs/api-reference",
    keyUrl: "https://platform.openai.com/api-keys",
    baseUrl: "https://api.openai.com/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    apiKeyHint: "sk-…",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsImageApi: true,
    supportsTools: true,
    streamsReasoning: true,
    notes: [
      "OpenAI's /models endpoint returns ids only, so capability states stay Unknown unless the model appears in the platform's documented capability map.",
      "File attachments are sent as text or images; the Files API is not used from the browser.",
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    tagline: "Claude models",
    description: "Claude chat models through the Messages API with extended thinking summaries.",
    kind: "anthropic",
    logSlug: "anthropic",
    accent: "#d97757",
    docsUrl: "https://docs.anthropic.com/en/api/messages",
    keyUrl: "https://console.anthropic.com/settings/keys",
    baseUrl: "https://api.anthropic.com/v1",
    modelsPath: "/models",
    chatPath: "/messages",
    apiKeyHint: "sk-ant-…",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: true,
    streamsReasoning: true,
    notes: [
      "Browser calls require the anthropic-dangerous-direct-browser-access header, which this adapter sends.",
      "Only provider-reported fields (id, display name, creation date) are shown; vision is left Unknown until the provider reports it.",
    ],
  },
  {
    id: "google",
    name: "Google Gemini",
    tagline: "Gemini and Imagen",
    description: "Gemini generative models plus Imagen image generation endpoints.",
    kind: "google",
    logSlug: "googlegemini",
    accent: "#4285f4",
    docsUrl: "https://ai.google.dev/api",
    keyUrl: "https://aistudio.google.com/app/apikey",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    modelsPath: "/models",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: true,
    streamsReasoning: true,
    notes: [
      "Capability states come from supportedGenerationMethods and inputTokenLimit in the provider payload.",
      "Inline images and PDFs are supported by Gemini's inline_data; the platform sends them only when the model reports generateContent.",
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    tagline: "Open-weight and reasoning models",
    description: "DeepSeek chat and reasoner models over an OpenAI-compatible API.",
    kind: "openai-compatible",
    logSlug: "deepseek",
    accent: "#4d6bfe",
    docsUrl: "https://api-docs.deepseek.com/",
    keyUrl: "https://platform.deepseek.com/api_keys",
    baseUrl: "https://api.deepseek.com/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    apiKeyHint: "sk-…",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: true,
    streamsReasoning: true,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    tagline: "Mistral and Codestral",
    description: "Mistral chat models with published context windows.",
    kind: "openai-compatible",
    logSlug: "mistralai",
    accent: "#ff7000",
    docsUrl: "https://docs.mistral.ai/api/",
    keyUrl: "https://console.mistral.ai/api-keys",
    baseUrl: "https://api.mistral.ai/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: true,
    streamsReasoning: false,
  },
  {
    id: "xai",
    name: "xAI",
    tagline: "Grok models",
    description: "xAI Grok chat models, including reasoning variants.",
    kind: "openai-compatible",
    logSlug: "x",
    accent: "#111111",
    docsUrl: "https://docs.x.ai/docs/api-reference",
    keyUrl: "https://console.x.ai/",
    baseUrl: "https://api.x.ai/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    apiKeyHint: "xai-…",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: true,
    streamsReasoning: true,
  },
  {
    id: "groq",
    name: "Groq",
    tagline: "Low-latency inference",
    description: "Open-weight models served on Groq's LPU hardware.",
    kind: "openai-compatible",
    logSlug: "groq",
    accent: "#f55036",
    docsUrl: "https://console.groq.com/docs/api-reference",
    keyUrl: "https://console.groq.com/keys",
    baseUrl: "https://api.groq.com/openai/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    apiKeyHint: "gsk_…",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: true,
    streamsReasoning: false,
  },
  {
    id: "together",
    name: "Together AI",
    tagline: "Open models and image models",
    description: "Hosted open-weight chat models plus FLUX image models.",
    kind: "openai-compatible",
    logSlug: "togetherai",
    accent: "#0f6fff",
    docsUrl: "https://docs.together.ai/",
    keyUrl: "https://api.together.ai/settings/api-keys",
    baseUrl: "https://api.together.xyz/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsImageApi: true,
    supportsTools: true,
    streamsReasoning: false,
  },
  {
    id: "fireworks",
    name: "Fireworks AI",
    tagline: "Fast open-model serving",
    description: "Open-weight models with function calling support.",
    kind: "openai-compatible",
    logSlug: "fireworksai",
    accent: "#5a24f5",
    docsUrl: "https://docs.fireworks.ai/api-reference/introduction",
    keyUrl: "https://fireworks.ai/account/api-keys",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    apiKeyHint: "fw_…",
    supportsModelDiscovery: false,
    supportsChat: true,
    supportsModels: false,
    supportsTools: true,
    streamsReasoning: false,
    notes: [
      "Fireworks model ids are entered manually: its inference API serves account-scoped router ids that are not enumerable from the browser.",
    ],
  },
  {
    id: "cohere",
    name: "Cohere",
    tagline: "Command models",
    description: "Command chat models with JSON streaming.",
    kind: "cohere",
    logSlug: "cohere",
    accent: "#39594d",
    docsUrl: "https://docs.cohere.com/reference/chat",
    keyUrl: "https://dashboard.cohere.com/api-keys",
    baseUrl: "https://api.cohere.com",
    modelsPath: "/v1/models",
    chatPath: "/v2/chat",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: false,
    streamsReasoning: false,
    notes: [
      "The Cohere adapter streams text only; the platform's tool calling stays disabled for this provider.",
    ],
  },
  {
    id: "perplexity",
    name: "Perplexity",
    tagline: "Search-grounded answers",
    description: "Sonar models with built-in web grounding and citations.",
    kind: "openai-compatible",
    logSlug: "perplexity",
    accent: "#20808d",
    docsUrl: "https://docs.perplexity.ai/api-reference/chat-completions",
    keyUrl: "https://www.perplexity.ai/settings/api",
    baseUrl: "https://api.perplexity.ai",
    chatPath: "/chat/completions",
    apiKeyHint: "pplx-…",
    supportsModelDiscovery: false,
    supportsChat: true,
    supportsModels: false,
    supportsTools: false,
    streamsReasoning: false,
    notes: [
      "Perplexity publishes no public model-list endpoint, so model ids are entered manually.",
      "Its responses already include citations; the platform renders them as returned.",
    ],
  },
  {
    id: "huggingface",
    name: "Hugging Face",
    tagline: "Inference router",
    description: "Serverless inference over hosted open models.",
    kind: "openai-compatible",
    logSlug: "huggingface",
    accent: "#ffd21e",
    docsUrl: "https://huggingface.co/docs/inference-providers/index",
    keyUrl: "https://huggingface.co/settings/tokens",
    baseUrl: "https://router.huggingface.co/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    apiKeyHint: "hf_…",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: false,
    streamsReasoning: false,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    tagline: "Wafer-scale inference",
    description: "Very high throughput serving of open models.",
    kind: "openai-compatible",
    logSlug: "cerebras",
    accent: "#f26625",
    docsUrl: "https://inference-docs.cerebras.ai/api-reference/chat-completions",
    keyUrl: "https://cloud.cerebras.ai/",
    baseUrl: "https://api.cerebras.ai/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: true,
    streamsReasoning: false,
  },
  {
    id: "sambanova",
    name: "SambaNova",
    tagline: "Fast open-model inference",
    description: "SambaNova Cloud serving open-weight models.",
    kind: "openai-compatible",
    logSlug: "sambanovasystems",
    accent: "#ee7624",
    docsUrl: "https://docs.sambanova.ai/cloud/api-reference/",
    keyUrl: "https://cloud.sambanova.ai/apis",
    baseUrl: "https://api.sambanova.ai/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: true,
    streamsReasoning: false,
  },
  {
    id: "nvidia",
    name: "NVIDIA NIM",
    tagline: "NVIDIA-hosted inference",
    description: "NVIDIA NIM microservices for open models.",
    kind: "openai-compatible",
    logSlug: "nvidia",
    accent: "#76b900",
    docsUrl: "https://docs.nvidia.com/nim/",
    keyUrl: "https://build.nvidia.com/",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    modelsPath: "/models",
    chatPath: "/chat/completions",
    apiKeyHint: "nvapi-…",
    supportsModelDiscovery: true,
    supportsChat: true,
    supportsModels: true,
    supportsTools: true,
    streamsReasoning: false,
  },
  {
    id: "bedrock",
    name: "AWS Bedrock",
    tagline: "AWS-hosted foundation models",
    description: "Amazon Bedrock model access through AWS IAM credentials.",
    kind: "proxy-only",
    logSlug: "amazonwebservices",
    accent: "#ff9900",
    docsUrl: "https://docs.aws.amazon.com/bedrock/latest/APIReference/",
    keyUrl: "https://console.aws.amazon.com/bedrock/",
    supportsModelDiscovery: false,
    supportsChat: false,
    supportsModels: false,
    supportsTools: false,
    streamsReasoning: false,
    requiresProxy: true,
    browserNote:
      "Bedrock authenticates with SigV4-signed requests using an IAM secret key. Signing inside a browser page would expose the secret to any script on the page, so the platform does not implement it locally. Use Bedrock through your own secure proxy or a gateway provider such as OpenRouter.",
  },
  {
    id: "azure",
    name: "Azure AI",
    tagline: "Azure OpenAI deployments",
    description: "Azure OpenAI deployments with your own resource endpoint.",
    kind: "azure-openai",
    logSlug: "microsoftazure",
    accent: "#0078d4",
    docsUrl: "https://learn.microsoft.com/azure/ai-services/openai/reference",
    keyUrl: "https://portal.azure.com/",
    apiKeyHint: "azure key",
    baseUrl: "https://YOUR-RESOURCE.openai.azure.com/openai/deployments/YOUR-DEPLOYMENT",
    chatPath: "/chat/completions",
    extraFields: ["endpoint", "apiVersion"],
    supportsModelDiscovery: false,
    supportsChat: true,
    supportsModels: false,
    supportsTools: true,
    streamsReasoning: false,
    notes: [
      "Azure has no model-list endpoint — deployments are entered manually as the model id.",
      "Browser calls only work when the Azure resource allows the app origin through CORS.",
    ],
  },
  {
    id: "github",
    name: "GitHub Models",
    tagline: "Models through a GitHub account",
    description: "GitHub-hosted models authenticated with a personal access token.",
    kind: "openai-compatible",
    logSlug: "github",
    accent: "#8b949e",
    docsUrl: "https://docs.github.com/en/rest/models/inference",
    keyUrl: "https://github.com/settings/tokens",
    baseUrl: "https://models.github.ai/inference",
    chatPath: "/chat/completions",
    apiKeyHint: "github_pat_…",
    supportsModelDiscovery: false,
    supportsChat: true,
    supportsModels: false,
    supportsTools: true,
    streamsReasoning: false,
    notes: [
      "The catalog endpoint is not CORS-enabled for browsers, so model ids are entered manually.",
    ],
  },
  {
    id: "replicate",
    name: "Replicate",
    tagline: "Hosted model predictions",
    description: "Run hosted models and image models as predictions.",
    kind: "proxy-only",
    logSlug: "replicate",
    accent: "#000000",
    docsUrl: "https://replicate.com/docs/reference/http",
    keyUrl: "https://replicate.com/account/api-tokens",
    supportsModelDiscovery: false,
    supportsChat: false,
    supportsModels: false,
    supportsTools: false,
    streamsReasoning: false,
    requiresProxy: true,
    browserNote:
      "Replicate's prediction API is designed for server-side calls with a secret token and long-running requests, and its browser CORS policy is not documented. The platform does not implement it client-side rather than pretend it works.",
  },
]

export const PROVIDERS_BY_ID: Record<string, ProviderDefinition> = Object.fromEntries(
  PROVIDERS.map((provider) => [provider.id, provider])
)

export function getProvider(id: string | undefined): ProviderDefinition | undefined {
  return id ? PROVIDERS_BY_ID[id] : undefined
}

export const CAPABILITY_LABELS: Record<ModelCapability, string> = {
  text: "Text",
  vision: "Vision",
  "image-generation": "Image generation",
  "image-editing": "Image editing",
  "file-upload": "File upload",
  pdf: "PDF",
  "audio-input": "Audio input",
  "audio-output": "Audio output",
  video: "Video",
  "tool-calling": "Tool calling",
  "web-search": "Web search",
  "structured-output": "Structured output",
  reasoning: "Reasoning",
}

/**
 * Capability states for a model, built only from provider-reported metadata.
 * `unknown` is never upgraded to `supported`.
 */
export function capabilityState(
  model: ModelInfo,
  capability: ModelCapability
): CapabilityState {
  return model.capabilities[capability] ?? "unknown"
}

export function modelSupports(model: ModelInfo | undefined, capability: ModelCapability): boolean {
  if (!model) return false
  return model.capabilities[capability] === "supported"
}
