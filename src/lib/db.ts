import Dexie, { type Table } from "dexie"
import type {
  AppSettings,
  ConversationRecord,
  ImageRecord,
  IntegrationRecord,
  LibraryFileRecord,
  ModelCacheRecord,
  ProjectRecord,
  ProviderKeyRecord,
  StoredMessage,
  UsageRecord,
} from "@/lib/types"

/**
 * Single local database. Every row is scoped by userId and only reachable
 * through the repository functions below, which always filter by userId.
 * Nothing here is uploaded anywhere: no Firebase, no server.
 */
class PlatformDatabase extends Dexie {
  conversations!: Table<ConversationRecord, string>
  messages!: Table<StoredMessage, string>
  projects!: Table<ProjectRecord, string>
  files!: Table<LibraryFileRecord, string>
  providerKeys!: Table<ProviderKeyRecord, string>
  modelCache!: Table<ModelCacheRecord, string>
  images!: Table<ImageRecord, string>
  usage!: Table<UsageRecord, string>
  integrations!: Table<IntegrationRecord, string>
  settings!: Table<AppSettings, string>

  constructor() {
    super("ai-platform")
    this.version(1).stores({
      conversations: "id, userId, updatedAt, pinned, projectId, temporary, [userId+updatedAt]",
      messages: "id, userId, conversationId, createdAt, [conversationId+createdAt]",
      projects: "id, userId, updatedAt",
      files: "id, userId, createdAt, projectId, folder",
      providerKeys: "id, userId, providerId, [userId+providerId]",
      modelCache: "id, userId, providerId",
      images: "id, userId, createdAt",
      usage: "id, userId, createdAt",
      integrations: "id, userId, serviceId, [userId+serviceId]",
      settings: "userId",
    })
  }
}

export const db = new PlatformDatabase()

export const DEFAULT_SETTINGS = (userId: string): AppSettings => ({
  userId,
  theme: "system",
  language: "en",
  favoriteModels: [],
  reasoningMode: "balanced",
  requireToolConsent: true,
  sendFilesToProvider: true,
  ttsRate: 1,
  searchProvider: "wikimedia",
  imageSearchEnabled: false,
  modelSettings: {},
  systemInstructions: "",
  updatedAt: Date.now(),
})

export async function getSettings(userId: string): Promise<AppSettings> {
  const existing = await db.settings.get(userId)
  if (existing) return existing
  const created = DEFAULT_SETTINGS(userId)
  await db.settings.put(created)
  return created
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await db.settings.put({ ...settings, updatedAt: Date.now() })
}

export async function listConversations(userId: string): Promise<ConversationRecord[]> {
  const rows = await db.conversations.where({ userId }).toArray()
  return rows.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return b.updatedAt - a.updatedAt
  })
}

export async function getConversation(
  userId: string,
  id: string
): Promise<ConversationRecord | undefined> {
  const row = await db.conversations.get(id)
  return row && row.userId === userId ? row : undefined
}

export async function putConversation(row: ConversationRecord): Promise<void> {
  await db.conversations.put(row)
}

export async function deleteConversation(userId: string, id: string): Promise<void> {
  const row = await db.conversations.get(id)
  if (!row || row.userId !== userId) return
  await db.transaction("rw", db.conversations, db.messages, async () => {
    await db.messages.where({ conversationId: id, userId }).delete()
    await db.conversations.delete(id)
  })
}

export async function listMessages(
  userId: string,
  conversationId: string
): Promise<StoredMessage[]> {
  const rows = await db.messages.where({ conversationId }).toArray()
  return rows
    .filter((row) => row.userId === userId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function putMessage(row: StoredMessage): Promise<void> {
  await db.messages.put(row)
}

export async function deleteMessages(userId: string, conversationId: string): Promise<void> {
  const rows = await db.messages.where({ conversationId }).toArray()
  await db.messages.bulkDelete(rows.filter((r) => r.userId === userId).map((r) => r.id))
}

export async function listProjects(userId: string): Promise<ProjectRecord[]> {
  return (await db.projects.where({ userId }).toArray()).sort(
    (a, b) => b.updatedAt - a.updatedAt
  )
}

export async function getProject(
  userId: string,
  id: string
): Promise<ProjectRecord | undefined> {
  const row = await db.projects.get(id)
  return row && row.userId === userId ? row : undefined
}

export async function putProject(row: ProjectRecord): Promise<void> {
  await db.projects.put(row)
}

export async function deleteProject(userId: string, id: string): Promise<void> {
  const row = await db.projects.get(id)
  if (!row || row.userId !== userId) return
  await db.projects.delete(id)
  const conversations = await db.conversations.where({ userId, projectId: id }).toArray()
  await db.conversations.bulkPut(conversations.map((c) => ({ ...c, projectId: undefined })))
  const files = await db.files.where({ userId }).toArray()
  await db.files.bulkPut(
    files.filter((f) => f.projectId === id).map((f) => ({ ...f, projectId: undefined }))
  )
}

export async function listProviderKeys(userId: string): Promise<ProviderKeyRecord[]> {
  return db.providerKeys.where({ userId }).toArray()
}

export async function getProviderKey(
  userId: string,
  providerId: string
): Promise<ProviderKeyRecord | undefined> {
  return db.providerKeys.where({ userId, providerId }).first()
}

export async function putProviderKey(row: ProviderKeyRecord): Promise<void> {
  await db.providerKeys.put(row)
}

export async function deleteProviderKey(userId: string, providerId: string): Promise<void> {
  const row = await getProviderKey(userId, providerId)
  if (row) await db.providerKeys.delete(row.id)
  await db.modelCache.delete(`${userId}:${providerId}`)
}

export async function getModelCache(
  userId: string,
  providerId: string
): Promise<ModelCacheRecord | undefined> {
  return db.modelCache.get(`${userId}:${providerId}`)
}

export async function putModelCache(row: ModelCacheRecord): Promise<void> {
  await db.modelCache.put(row)
}

export async function listImages(userId: string): Promise<ImageRecord[]> {
  return (await db.images.where({ userId }).toArray()).sort((a, b) => b.createdAt - a.createdAt)
}

export async function putImage(row: ImageRecord): Promise<void> {
  await db.images.put(row)
}

export async function deleteImage(userId: string, id: string): Promise<void> {
  const row = await db.images.get(id)
  if (row && row.userId === userId) await db.images.delete(id)
}

export async function listFiles(userId: string): Promise<LibraryFileRecord[]> {
  return (await db.files.where({ userId }).toArray()).sort((a, b) => b.createdAt - a.createdAt)
}

export async function putFile(row: LibraryFileRecord): Promise<void> {
  await db.files.put(row)
}

export async function deleteFile(userId: string, id: string): Promise<void> {
  const row = await db.files.get(id)
  if (!row || row.userId !== userId) return
  await db.files.delete(id)
}

export async function putUsage(row: UsageRecord): Promise<void> {
  await db.usage.put(row)
}

export async function listIntegrations(userId: string): Promise<IntegrationRecord[]> {
  return db.integrations.where({ userId }).toArray()
}

export async function putIntegration(row: IntegrationRecord): Promise<void> {
  await db.integrations.put(row)
}

export async function deleteIntegration(userId: string, serviceId: string): Promise<void> {
  const row = await db.integrations.where({ userId, serviceId }).first()
  if (row) await db.integrations.delete(row.id)
}

/** Local storage footprint, shown in Settings. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null
  const estimate = await navigator.storage.estimate()
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 }
}

/** Deletes every row for a single account without touching other accounts. */
export async function wipeUserData(userId: string): Promise<void> {
  await db.transaction(
    "rw",
    [
      db.conversations,
      db.messages,
      db.projects,
      db.files,
      db.providerKeys,
      db.modelCache,
      db.images,
      db.usage,
      db.integrations,
      db.settings,
    ],
    async () => {
      await db.messages.where({ userId }).delete()
      await db.conversations.where({ userId }).delete()
      await db.projects.where({ userId }).delete()
      await db.files.where({ userId }).delete()
      await db.providerKeys.where({ userId }).delete()
      await db.modelCache.where({ userId }).delete()
      await db.images.where({ userId }).delete()
      await db.usage.where({ userId }).delete()
      await db.integrations.where({ userId }).delete()
      await db.settings.delete(userId)
    }
  )
}
