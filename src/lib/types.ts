import type { MessagePart } from "@/components/ui/message"
import type { MessageToolCallData, MessageAttachmentData } from "@/components/ui/message-parts"

/** Persisted message shape. Kept structurally compatible with ChatMessageData. */
export type StoredMessage = {
  id: string
  userId: string
  conversationId: string
  sender: "user" | "assistant"
  content: string
  parts?: MessagePart[]
  reasoning?: string | null
  tools?: MessageToolCallData[]
  attachments?: MessageAttachmentData[]
  createdAt: number
  modelId?: string
  providerId?: string
  error?: string
}

export type ConversationRecord = {
  id: string
  userId: string
  title: string
  modelId: string
  providerId: string
  mode: ChatModeId
  projectId?: string
  temporary: boolean
  pinned: boolean
  sortIndex: number
  createdAt: number
  updatedAt: number
}

export type ChatModeId = "ask" | "plan" | "agent"

export type ProjectRecord = {
  id: string
  userId: string
  name: string
  description: string
  instructions: string
  modelId?: string
  createdAt: number
  updatedAt: number
}

export type LibraryFileRecord = {
  id: string
  userId: string
  name: string
  mimeType: string
  size: number
  /** Where the bytes live: IndexedDB blob or OPFS object. */
  storage: "dexie" | "opfs"
  blob?: Blob
  folder: string
  projectId?: string
  createdAt: number
}

export type ProviderKeyRecord = {
  id: string
  userId: string
  providerId: string
  apiKey: string
  /** Extra configuration such as an Azure endpoint or a Bedrock proxy URL. */
  endpoint?: string
  apiVersion?: string
  /** Model id used to verify providers without a model-list endpoint. */
  modelId?: string
  status: "unverified" | "verified" | "failed"
  modelsCount?: number
  lastVerifiedAt?: number
  lastError?: string
  createdAt: number
  updatedAt: number
}

export type ModelCacheRecord = {
  id: string
  userId: string
  providerId: string
  models: import("@/platform/providers").ModelInfo[]
  fetchedAt: number
}

export type ImageRecord = {
  id: string
  userId: string
  prompt: string
  providerId: string
  modelId: string
  mimeType: string
  blob: Blob
  width?: number
  height?: number
  createdAt: number
}

export type UsageRecord = {
  id: string
  userId: string
  providerId: string
  modelId: string
  conversationId?: string
  inputTokens?: number
  outputTokens?: number
  createdAt: number
}

export type IntegrationRecord = {
  id: string
  userId: string
  serviceId: string
  status: "connected" | "error"
  accountLabel?: string
  /** Only stored for browser-verifiable token integrations (e.g. GitHub PAT). */
  token?: string
  connectedAt: number
  lastCheckedAt?: number
}

export type ModelSettings = {
  temperature?: number
  topP?: number
  maxTokens?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stop?: string[]
  seed?: number
  reasoningEffort?: "low" | "medium" | "high"
  responseFormat?: "text" | "json"
  systemInstructions?: string
}

export type AppSettings = {
  userId: string
  theme: "light" | "dark" | "system"
  language: "en" | "ar"
  defaultProviderId?: string
  defaultModelId?: string
  favoriteModels: string[]
  reasoningMode: "fast" | "balanced" | "advanced"
  requireToolConsent: boolean
  sendFilesToProvider: boolean
  ttsVoiceUri?: string
  ttsRate: number
  searchProvider: "wikimedia" | "tavily" | "brave" | "serper" | "none"
  searchApiKey?: string
  imageSearchEnabled: boolean
  /** Per-model generation settings, keyed by `providerId:modelId`. */
  modelSettings: Record<string, ModelSettings>
  /** Free-form instructions added to every conversation. */
  systemInstructions: string
  updatedAt: number
}

export type BackupPayload = {
  app: "ai-platform"
  version: 1
  exportedAt: string
  userId: string
  settings?: AppSettings
  conversations: ConversationRecord[]
  messages: StoredMessage[]
  projects: ProjectRecord[]
  providerKeys?: ProviderKeyRecord[]
  images?: { id: string; prompt: string; providerId: string; modelId: string; mimeType: string; dataUrl: string; createdAt: number }[]
  files?: { record: Omit<LibraryFileRecord, "blob">; dataUrl?: string }[]
}
