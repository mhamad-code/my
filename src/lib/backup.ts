import {
  db,
  deleteProviderKey,
  putConversation,
  putFile,
  putImage,
  putMessage,
  putProject,
  putProviderKey,
  saveSettings,
} from "@/lib/db"
import { blobToDataUrl } from "@/lib/files"
import type { AppSettings, BackupPayload, StoredMessage } from "@/lib/types"

export type ExportOptions = {
  includeKeys: boolean
  includeFiles: boolean
}

export async function createBackup(
  userId: string,
  settings: AppSettings | null,
  options: ExportOptions
): Promise<BackupPayload> {
  const [conversations, messages, projects, providerKeys, images, files] = await Promise.all([
    db.conversations.where({ userId }).toArray(),
    db.messages.where({ userId }).toArray(),
    db.projects.where({ userId }).toArray(),
    db.providerKeys.where({ userId }).toArray(),
    db.images.where({ userId }).toArray(),
    db.files.where({ userId }).toArray(),
  ])

  const payload: BackupPayload = {
    app: "ai-platform",
    version: 1,
    exportedAt: new Date().toISOString(),
    userId,
    settings: settings ?? undefined,
    conversations,
    messages,
    projects,
    providerKeys: options.includeKeys ? providerKeys : undefined,
    images: await Promise.all(
      images.map(async (image) => ({
        id: image.id,
        prompt: image.prompt,
        providerId: image.providerId,
        modelId: image.modelId,
        mimeType: image.mimeType,
        dataUrl: await blobToDataUrl(image.blob),
        createdAt: image.createdAt,
      }))
    ),
    files: options.includeFiles
      ? await Promise.all(
          files.map(async (file) => {
            const { blob, ...record } = file
            return {
              record,
              dataUrl: blob ? await blobToDataUrl(blob) : undefined,
            }
          })
        )
      : undefined,
  }
  return payload
}

export function validateBackup(value: unknown): BackupPayload {
  const payload = value as BackupPayload
  if (!payload || payload.app !== "ai-platform") {
    throw new Error("This file is not an AI Platform backup.")
  }
  if (payload.version !== 1) {
    throw new Error(`Unsupported backup version: ${String(payload.version)}`)
  }
  if (!Array.isArray(payload.conversations) || !Array.isArray(payload.messages)) {
    throw new Error("The backup is missing conversations or messages.")
  }
  return payload
}

/**
 * Imports into the *current* profile id so a backup can never merge two accounts.
 * Ids are remapped when an id already belongs to another profile.
 */
export async function importBackup(
  payload: BackupPayload,
  userId: string,
  options: { includeKeys: boolean }
): Promise<{ conversations: number; messages: number; projects: number }> {
  const conversationIds = new Map<string, string>()
  const messageIds = new Map<string, string>()
  const projectIds = new Map<string, string>()

  for (const project of payload.projects ?? []) {
    const id = project.userId === userId ? project.id : crypto.randomUUID()
    projectIds.set(project.id, id)
    await putProject({ ...project, id, userId })
  }

  for (const conversation of payload.conversations) {
    const id = conversation.userId === userId ? conversation.id : crypto.randomUUID()
    conversationIds.set(conversation.id, id)
    await putConversation({
      ...conversation,
      id,
      userId,
      projectId: conversation.projectId ? projectIds.get(conversation.projectId) : undefined,
    })
  }

  let importedMessages = 0
  for (const message of payload.messages as StoredMessage[]) {
    const conversationId = conversationIds.get(message.conversationId)
    if (!conversationId) continue
    const id = message.userId === userId ? message.id : crypto.randomUUID()
    messageIds.set(message.id, id)
    await putMessage({ ...message, id, userId, conversationId })
    importedMessages += 1
  }

  if (options.includeKeys) {
    for (const key of payload.providerKeys ?? []) {
      const existing = await db.providerKeys.get(`${userId}:${key.providerId}`)
      await putProviderKey({
        ...key,
        id: `${userId}:${key.providerId}`,
        userId,
        createdAt: existing?.createdAt ?? key.createdAt,
        updatedAt: Date.now(),
      })
    }
  }

  for (const image of payload.images ?? []) {
    const blob = await (await fetch(image.dataUrl)).blob()
    await putImage({
      id: image.id,
      userId,
      prompt: image.prompt,
      providerId: image.providerId,
      modelId: image.modelId,
      mimeType: image.mimeType,
      blob,
      createdAt: image.createdAt,
    })
  }

  for (const entry of payload.files ?? []) {
    const record = entry.record
    if (!record?.id) continue
    const blob = entry.dataUrl ? await (await fetch(entry.dataUrl)).blob() : undefined
    await putFile({
      ...record,
      userId,
      storage: blob ? "dexie" : record.storage,
      blob,
      projectId: record.projectId ? projectIds.get(record.projectId) : undefined,
    })
  }

  if (payload.settings) {
    await saveSettings({ ...payload.settings, userId })
  }

  return {
    conversations: payload.conversations.length,
    messages: importedMessages,
    projects: (payload.projects ?? []).length,
  }
}

export async function removeProviderKeyForBackup(userId: string, providerId: string) {
  await deleteProviderKey(userId, providerId)
}
