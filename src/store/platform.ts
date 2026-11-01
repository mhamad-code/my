import { create } from "zustand"
import {
  DEFAULT_SETTINGS,
  db,
  deleteProviderKey,
  getSettings,
  listProviderKeys,
  putModelCache,
  putProviderKey,
  saveSettings,
} from "@/lib/db"
import type { AppSettings, ProviderKeyRecord } from "@/lib/types"
import { getProvider, type ModelInfo } from "@/platform/providers"
import { testConnection } from "@/platform/adapters"
import { useSession } from "@/store/session"

type SaveKeyResult = { ok: boolean; message: string; modelsCount?: number }

type PlatformState = {
  userId: string | null
  settings: AppSettings | null
  keys: ProviderKeyRecord[]
  models: ModelInfo[]
  loading: boolean
  refreshingProvider: string | null
  load: (userId: string) => Promise<void>
  reset: () => void
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>
  saveProviderKey: (
    providerId: string,
    apiKey: string,
    extra?: { endpoint?: string; apiVersion?: string; model?: string }
  ) => Promise<SaveKeyResult>
  removeProviderKey: (providerId: string) => Promise<void>
  refreshModels: (providerId: string, options?: { quiet?: boolean }) => Promise<SaveKeyResult>
  favoriteModel: (key: string) => Promise<void>
  addManualModel: (providerId: string, modelId: string, displayName?: string) => Promise<void>
}

function requireUser(): string {
  const user = useSession.getState().user
  if (!user) throw new Error("No active profile.")
  return user.uid
}

export const usePlatform = create<PlatformState>((set, get) => ({
  userId: null,
  settings: null,
  keys: [],
  models: [],
  loading: false,
  refreshingProvider: null,

  reset: () => set({ userId: null, settings: null, keys: [], models: [] }),

  load: async (userId) => {
    set({ loading: true })
    const [settings, keys, caches] = await Promise.all([
      getSettings(userId),
      listProviderKeys(userId),
      db.modelCache.where({ userId }).toArray(),
    ])
    set({
      userId,
      settings,
      keys,
      models: caches.flatMap((cache) =>
        (cache.models ?? []).map((model) => ({
          ...model,
          providerId: model.providerId || cache.providerId,
          capabilities: model.capabilities ?? {},
        }))
      ),
      loading: false,
    })
  },

  patchSettings: async (patch) => {
    const userId = get().userId ?? requireUser()
    const current = get().settings ?? DEFAULT_SETTINGS(userId)
    const next = { ...current, ...patch, userId, updatedAt: Date.now() }
    set({ settings: next })
    await saveSettings(next)
  },

  saveProviderKey: async (providerId, apiKey, extra) => {
    const userId = get().userId ?? requireUser()
    const provider = getProvider(providerId)
    if (!provider) return { ok: false, message: "Unknown provider." }
    const result = await testConnection(
      providerId,
      {
        apiKey,
        endpoint: extra?.endpoint,
        apiVersion: extra?.apiVersion,
      },
      { model: extra?.model }
    )
    const now = Date.now()
    const existing = get().keys.find((key) => key.providerId === providerId)
    const record: ProviderKeyRecord = {
      id: `${userId}:${providerId}`,
      userId,
      providerId,
      apiKey,
      endpoint: extra?.endpoint,
      apiVersion: extra?.apiVersion,
      modelId: extra?.model ?? existing?.modelId,
      status: result.ok ? "verified" : "failed",
      modelsCount: result.modelsCount ?? existing?.modelsCount,
      lastVerifiedAt: result.ok ? result.checkedAt : existing?.lastVerifiedAt,
      lastError: result.ok ? undefined : result.message,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await putProviderKey(record)
    if (result.models?.length) {
      await putModelCache({
        id: `${userId}:${providerId}`,
        userId,
        providerId,
        models: result.models,
        fetchedAt: now,
      })
      const others = get().models.filter((model) => model.providerId !== providerId)
      set({ models: [...others, ...result.models] })
    }
    set({ keys: [...get().keys.filter((key) => key.providerId !== providerId), record] })
    return { ok: result.ok, message: result.message, modelsCount: result.modelsCount }
  },

  removeProviderKey: async (providerId) => {
    const userId = get().userId ?? requireUser()
    await deleteProviderKey(userId, providerId)
    await db.modelCache.delete(`${userId}:${providerId}`)
    set({
      keys: get().keys.filter((key) => key.providerId !== providerId),
      models: get().models.filter((model) => model.providerId !== providerId),
    })
  },

  refreshModels: async (providerId, options) => {
    const userId = get().userId ?? requireUser()
    const key = get().keys.find((item) => item.providerId === providerId)
    if (!key) return { ok: false, message: "Connect this provider first." }
    const provider = getProvider(providerId)
    if (!provider) return { ok: false, message: "Unknown provider." }
    set({ refreshingProvider: providerId })
    try {
      const result = await testConnection(
        providerId,
        { apiKey: key.apiKey, endpoint: key.endpoint, apiVersion: key.apiVersion },
        { model: key.modelId }
      )
      if (!result.ok) {
        const updated = { ...key, status: "failed" as const, lastError: result.message, updatedAt: Date.now() }
        await putProviderKey(updated)
        set({ keys: get().keys.map((item) => (item.providerId === providerId ? updated : item)) })
        return { ok: false, message: result.message }
      }
      if (result.models?.length) {
        await putModelCache({
          id: `${userId}:${providerId}`,
          userId,
          providerId,
          models: result.models,
          fetchedAt: Date.now(),
        })
        const others = get().models.filter((model) => model.providerId !== providerId)
        set({ models: [...others, ...result.models] })
      }
      const updated = {
        ...key,
        status: "verified" as const,
        lastError: undefined,
        modelsCount: result.modelsCount ?? key.modelsCount,
        lastVerifiedAt: result.checkedAt,
        updatedAt: Date.now(),
      }
      await putProviderKey(updated)
      set({ keys: get().keys.map((item) => (item.providerId === providerId ? updated : item)) })
      return {
        ok: true,
        message: options?.quiet
          ? "Models refreshed."
          : `Connected. ${result.modelsCount ?? 0} models available.`,
        modelsCount: result.modelsCount,
      }
    } finally {
      set({ refreshingProvider: null })
    }
  },

  addManualModel: async (providerId, modelId, displayName) => {
    const userId = get().userId ?? requireUser()
    const provider = getProvider(providerId)
    if (!provider) throw new Error("Unknown provider.")
    const nextModel: ModelInfo = {
      id: modelId,
      name: displayName?.trim() || modelId,
      providerId,
      capabilities: { text: "unknown" },
    }
    const existing = await db.modelCache.get(`${userId}:${providerId}`)
    const models = [
      ...(existing?.models ?? []).filter((model) => model.id !== modelId),
      nextModel,
    ]
    await putModelCache({
      id: `${userId}:${providerId}`,
      userId,
      providerId,
      models,
      fetchedAt: existing?.fetchedAt ?? Date.now(),
    })
    set({
      models: [
        ...get().models.filter((model) => !(model.providerId === providerId && model.id === modelId)),
        nextModel,
      ],
    })
  },

  favoriteModel: async (key) => {
    const settings = get().settings
    if (!settings) return
    const favoriteModels = settings.favoriteModels.includes(key)
      ? settings.favoriteModels.filter((item) => item !== key)
      : [...settings.favoriteModels, key]
    await saveSettings({ ...settings, favoriteModels, updatedAt: Date.now() })
    set({ settings: { ...settings, favoriteModels } })
  },
}))
