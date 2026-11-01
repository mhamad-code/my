import {
  BookmarkPlus,
  Clock,
  Copy,
  RefreshCw,
  Volume2,
  VolumeX,
} from "lucide-react"
import * as React from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useNavigate, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import {
  ChatInput,
  type ChatInputHandle,
  type ChatInputPayload,
} from "@/components/ui/chat-input"
import { ChatNavbar } from "@/components/ui/chat-navbar"
import { ChatEmptyState } from "@/components/ui/chat-empty-state"
import { ContextMeter } from "@/components/ui/context-meter"
import {
  MessageList,
  type ChatMessageData,
} from "@/components/ui/message-list"
import type { GenerationStage } from "@/components/ui/generation-status"
import {
  DEFAULT_MODEL_EFFORTS,
  ModelPicker,
  type ModelOption,
  type ModelPickerGroup,
} from "@/components/ui/model-picker"
import { ModePicker, type ChatMode } from "@/components/ui/mode-picker"
import {
  PromptSuggestions,
  type PromptSuggestion,
} from "@/components/ui/prompt-suggestions"
import {
  formatAskQuestionOutput,
  type AskQuestionResult,
} from "@/components/ui/ask-question"
import type { MessagePart } from "@/components/ui/message"
import type { MessageAttachmentData, MessageToolCallData } from "@/components/ui/message-parts"
import { CHAT_PATTERN_HANDLERS, MarkdownImageLightbox } from "@/components/chat/media"
import { IntegrationChips, IntegrationPicker } from "@/components/chat/integration-picker"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Spinner } from "@/components/ui/spinner"
import { getProvider, CAPABILITY_LABELS, type ModelInfo } from "@/platform/providers"
import {
  availableToolSpecs,
  ASK_QUESTION_SPEC,
  toolByName,
  type IntegrationContext,
} from "@/platform/tools"
import {
  buildSystemPrompt,
  runAssistantTurn,
} from "@/platform/chat-engine"
import { askQuestionToolArgs, answersToTurnText } from "@/platform/ask-question"
import type { ChatTurn } from "@/platform/adapters"
import {
  deleteConversation,
  deleteMessages,
  getConversation,
  getProject,
  listIntegrations,
  listMessages,
  putConversation,
  putMessage,
} from "@/lib/db"
import type { ConversationRecord, IntegrationRecord, ModelSettings, StoredMessage } from "@/lib/types"
import { fileToAttachment, isTextFile, saveLibraryFile, getFileBlob, readFileText } from "@/lib/files"
import { usePlatform } from "@/store/platform"
import { useSession } from "@/store/session"
import { useT } from "@/i18n"
import { speak, cancel as cancelSpeech } from "@/lib/tts"
import { cn } from "@/lib/utils"

type PendingAsk = {
  messageId: string
  toolId: string
  input: string
}

type PendingApproval = {
  messageId: string
  toolId: string
  name: string
  input: string
}

const EMPTY_MESSAGES: ChatMessageData[] = []

function toChatMessage(message: StoredMessage): ChatMessageData {
  return {
    id: message.id,
    content: message.content,
    sender: message.sender,
    parts: message.parts,
    reasoning: message.reasoning ?? undefined,
    tools: message.tools,
    attachments: message.attachments,
  }
}

function partsFromMessage(message: ChatMessageData): MessagePart[] {
  if (message.parts?.length) return message.parts
  return message.content ? [{ type: "text", id: `${message.id}-text`, text: message.content }] : []
}

function upsertTextPart(message: ChatMessageData, text: string): MessagePart[] {
  const parts = partsFromMessage(message)
  const last = parts.at(-1)
  if (last?.type === "text") {
    return [...parts.slice(0, -1), { ...last, text }]
  }
  return [...parts, { type: "text", id: `${message.id}-text`, text }]
}

function upsertToolPart(message: ChatMessageData, tool: MessageToolCallData): MessagePart[] {
  const parts = partsFromMessage(message)
  const index = parts.findIndex((part) => part.type === "tool" && part.tool.id === tool.id)
  if (index >= 0) {
    const existing = parts[index]
    if (existing.type !== "tool") return parts
    const next = [...parts]
    next[index] = { ...existing, tool: { ...existing.tool, ...tool } }
    return next
  }
  return [...parts, { type: "tool", id: tool.id, tool }]
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export default function ChatPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t, language } = useT()
  const user = useSession((state) => state.user)
  const settings = usePlatform((state) => state.settings)
  const models = usePlatform((state) => state.models)
  const keys = usePlatform((state) => state.keys)
  const patchSettings = usePlatform((state) => state.patchSettings)

  const [conversation, setConversation] = React.useState<ConversationRecord | null>(null)
  const [messages, setMessages] = React.useState<ChatMessageData[]>(EMPTY_MESSAGES)
  const [loadingConversation, setLoadingConversation] = React.useState(Boolean(id))
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [stage, setStage] = React.useState<GenerationStage>("idle")
  const [startedAt, setStartedAt] = React.useState<number | undefined>(undefined)
  const [mode, setMode] = React.useState<ChatMode>("agent")
  const [temporary, setTemporary] = React.useState(searchParams.get("temporary") === "1")
  const [pendingAsk, setPendingAsk] = React.useState<PendingAsk | null>(null)
  const [draftLength, setDraftLength] = React.useState(0)
  const [lastError, setLastError] = React.useState<string | null>(null)
  const [speaking, setSpeaking] = React.useState(false)
  const [modelKey, setModelKey] = React.useState("")
  const [project, setProject] = React.useState<{ instructions?: string } | null>(null)
  const [pendingLibrary, setPendingLibrary] = React.useState<MessageAttachmentData | null>(null)
  const [pendingApproval, setPendingApproval] = React.useState<PendingApproval | null>(null)
  const [selectedIntegrations, setSelectedIntegrations] = React.useState<string[]>([])
  const integrations = useLiveQuery(
    () => (user ? listIntegrations(user.uid) : Promise.resolve([])),
    [user?.uid],
    [] as IntegrationRecord[]
  )
  const inputRef = React.useRef<ChatInputHandle>(null)

  const abortRef = React.useRef<AbortController | null>(null)
  const conversationRef = React.useRef<ConversationRecord | null>(null)
  const skipLoadRef = React.useRef<string | null>(null)
  const liveRef = React.useRef<ChatMessageData | null>(null)
  const flushRef = React.useRef<number | null>(null)

  const conversationId = conversation?.id ?? id ?? null

  const currentModel = React.useMemo<ModelInfo | undefined>(() => {
    if (!modelKey) return undefined
    const [providerId, ...rest] = modelKey.split(":")
    const modelId = rest.join(":")
    return (
      models.find((model) => model.providerId === providerId && model.id === modelId) ??
      undefined
    )
  }, [modelKey, models])

  /** Only a connected token reaches the agent, and only for the attached service. */
  const integrationContext = React.useMemo<IntegrationContext>(() => {
    const github = integrations.find(
      (record) => record.serviceId === "github" && record.status === "connected" && record.token
    )
    return {
      github: github?.token
        ? { token: github.token, login: github.account?.login ?? github.accountLabel }
        : undefined,
      selected: selectedIntegrations,
    }
  }, [integrations, selectedIntegrations])

  const currentProvider = currentModel ? getProvider(currentModel.providerId) : undefined
  const currentKey = currentProvider
    ? keys.find((record) => record.providerId === currentProvider.id)
    : undefined

  /* ---------------------------------------------------------------- loading */

  React.useEffect(() => {
    if (!user) return
    let cancelled = false
    if (!id) {
      setConversation(null)
      setMessages(EMPTY_MESSAGES)
      setLoadingConversation(false)
      setPendingAsk(null)
      setLastError(null)
      setTemporary(searchParams.get("temporary") === "1")
      return
    }
    if (skipLoadRef.current === id) {
      skipLoadRef.current = null
      setLoadingConversation(false)
      return
    }
    setLoadingConversation(true)
    void (async () => {
      const record = await getConversation(user.uid, id)
      if (cancelled) return
      if (!record) {
        navigate("/chat", { replace: true })
        return
      }
      const stored = await listMessages(user.uid, record.id)
      if (record.projectId) {
        const projectRecord = await getProject(user.uid, record.projectId)
        if (!cancelled) setProject(projectRecord ? { instructions: projectRecord.instructions } : null)
      } else {
        setProject(null)
      }
      if (cancelled) return
      conversationRef.current = record
      setConversation(record)
      setMode(record.mode)
      setTemporary(record.temporary)
      setModelKey(`${record.providerId}:${record.modelId}`)
      setMessages(stored.map(toChatMessage))
      const openAsk = stored
        .filter((message) => message.sender === "assistant")
        .flatMap((message) =>
          (message.tools ?? [])
            .filter((tool) => tool.name === "ask_question" && tool.status === "running")
            .map((tool) => ({ messageId: message.id, toolId: tool.id, input: tool.input ?? "{}" }))
        )
        .at(-1)
      setPendingAsk(openAsk ?? null)
      setLoadingConversation(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id, user, navigate, searchParams])

  React.useEffect(() => {
    const promptParam = searchParams.get("prompt")
    const modelParam = searchParams.get("model")
    const attachParam = searchParams.get("attach")
    if (modelParam && !id) setModelKey(modelParam)
    if (promptParam && !id) {
      const timer = window.setTimeout(() => inputRef.current?.setDraft({ text: promptParam }), 60)
      return () => window.clearTimeout(timer)
    }
    if (attachParam && user) {
      let cancelled = false
      void (async () => {
        const { db } = await import("@/lib/db")
        const record = await db.files.get(attachParam)
        if (!record || record.userId !== user.uid || cancelled) return
        const attachment = await fileToAttachment(record)
        setPendingLibrary({
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          url: attachment.url,
        })
      })()
      return () => {
        cancelled = true
      }
    }
  }, [searchParams, id, user])

  React.useEffect(() => {
    if (modelKey || !settings) return
    const preferred =
      settings.defaultProviderId && settings.defaultModelId
        ? `${settings.defaultProviderId}:${settings.defaultModelId}`
        : undefined
    if (preferred && models.some((model) => `${model.providerId}:${model.id}` === preferred)) {
      setModelKey(preferred)
      return
    }
    const first = models[0]
    if (first) setModelKey(`${first.providerId}:${first.id}`)
  }, [modelKey, settings, models])

  React.useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (flushRef.current) window.clearInterval(flushRef.current)
      cancelSpeech()
    }
  }, [])

  /* ------------------------------------------------------------ live flush */

  React.useEffect(() => {
    if (!isGenerating) return
    flushRef.current = window.setInterval(() => {
      const live = liveRef.current
      if (!live) return
      setMessages((current) =>
        current.map((message) => (message.id === live.id ? { ...live } : message))
      )
    }, 80)
    return () => {
      if (flushRef.current) window.clearInterval(flushRef.current)
      flushRef.current = null
    }
  }, [isGenerating])

  const modelOptions = React.useMemo<ModelOption[]>(() => {
    const list = [...models]
    if (currentModel && !list.some((model) => model.id === currentModel.id && model.providerId === currentModel.providerId)) {
      list.push(currentModel)
    }
    return list.map((model) => ({
      id: `${model.providerId}:${model.id}`,
      name: model.name,
      description: model.contextLength
        ? `${CAPABILITY_LABELS.text} · ${Math.round(model.contextLength / 1000)}k context`
        : undefined,
      meta: getProvider(model.providerId)?.name,
      group: model.providerId,
      icon: undefined,
    }))
  }, [models, currentModel])

  const modelGroups = React.useMemo<ModelPickerGroup[]>(() => {
    const providerIds = Array.from(new Set(modelOptions.map((option) => option.group ?? "")))
    return providerIds.map((providerId) => ({
      id: providerId,
      label: getProvider(providerId)?.name ?? providerId,
    }))
  }, [modelOptions])

  /* -------------------------------------------------------------- helpers */

  const reasoningSupported = currentModel?.capabilities.reasoning === "supported"
  const effortValue =
    settings?.reasoningMode === "fast"
      ? "low"
      : settings?.reasoningMode === "advanced"
        ? "high"
        : "medium"
  const totalContext = currentModel?.contextLength
  const usedContext = React.useMemo(
    () =>
      messages.reduce((sum, message) => sum + estimateTokens(message.content), 0) +
      Math.ceil(draftLength / 4),
    [messages, draftLength]
  )

  const providersWithoutKey = models.length === 0 && keys.length === 0

  const ensureConversation = async (): Promise<ConversationRecord> => {
    if (!user) throw new Error("No active profile.")
    if (conversationRef.current) return conversationRef.current
    if (!currentModel) throw new Error(t("chat.modelMissing"))
    const now = Date.now()
    const record: ConversationRecord = {
      id: crypto.randomUUID(),
      userId: user.uid,
      title: t("chat.new"),
      modelId: currentModel.id,
      providerId: currentModel.providerId,
      mode,
      temporary,
      pinned: false,
      sortIndex: now,
      createdAt: now,
      updatedAt: now,
    }
    await putConversation(record)
    conversationRef.current = record
    setConversation(record)
    skipLoadRef.current = record.id
    navigate(`/chat/${record.id}${temporary ? "?temporary=1" : ""}`, { replace: true })
    return record
  }

  const saveMessage = async (message: ChatMessageData, conversationId: string) => {
    if (!user) return
    await putMessage({
      id: message.id,
      userId: user.uid,
      conversationId,
      sender: message.sender,
      content: message.content,
      parts: message.parts,
      reasoning: message.reasoning ?? null,
      tools: message.tools,
      attachments: message.attachments,
      createdAt: Date.now(),
      modelId: currentModel?.id,
      providerId: currentModel?.providerId,
    })
  }

  const buildTurns = async (history: ChatMessageData[]): Promise<ChatTurn[]> => {
    const turns: ChatTurn[] = []
    for (const message of history) {
      if (message.sender === "user") {
        let content = message.content
        const images: { mimeType: string; dataUrl: string }[] = []
        for (const attachment of settings?.sendFilesToProvider === false ? [] : message.attachments ?? []) {
          if (attachment.mimeType.startsWith("image/") && attachment.url) {
            images.push({ mimeType: attachment.mimeType, dataUrl: attachment.url })
            continue
          }
          if (!user) continue
          if (!isTextFile({ name: attachment.name, mimeType: attachment.mimeType })) continue
          const blob = await getFileBlobById(attachment.id)
          if (!blob) continue
          const text = await readFileText(blob)
          content += `\n\nAttached file “${attachment.name}”:\n\`\`\`\n${text}\n\`\`\``
        }
        turns.push({ role: "user", content, images: images.length ? images : undefined })
      } else {
        turns.push({ role: "assistant", content: message.content })
      }
    }
    return turns
  }

  const getFileBlobById = async (fileId: string) => {
    const { db } = await import("@/lib/db")
    const record = await db.files.get(fileId)
    if (!record || record.userId !== user?.uid) return null
    return getFileBlob(record)
  }

  /* ------------------------------------------------------------- streaming */

  const runTurn = async (
    history: ChatMessageData[],
    options?: { assistantId?: string; approvedTools?: string[] }
  ) => {
    if (!user || !currentModel || !currentProvider) return
    if (!currentKey?.apiKey) {
      toast.error(t("chat.noProvider"))
      navigate("/providers")
      return
    }
    const conversationRecord = await ensureConversation()
    const assistantId = options?.assistantId ?? crypto.randomUUID()
    const assistantMessage: ChatMessageData = {
      id: assistantId,
      sender: "assistant",
      content: "",
      parts: [],
      tools: [],
    }
    liveRef.current = assistantMessage
    setMessages((current) => [...current, assistantMessage])
    setIsGenerating(true)
    setStage("thinking")
    setStartedAt(Date.now())
    setLastError(null)
    setPendingAsk(null)
    setPendingApproval(null)

    const controller = new AbortController()
    abortRef.current = controller

    const toolSpecs = [...availableToolSpecs({ settings: settings!, integrations: integrationContext })]
    if (currentModel.capabilities["tool-calling"] !== "unsupported") {
      toolSpecs.push(ASK_QUESTION_SPEC)
    }
    const system = buildSystemPrompt({
      mode,
      language,
      projectInstructions: project?.instructions,
      modelInstructions: settings?.systemInstructions,
      toolNames: toolSpecs.map((tool) => tool.name),
      imageSearchEnabled: Boolean(settings?.imageSearchEnabled),
    })

    const turns = await buildTurns(history)

    const result = await runAssistantTurn({
      provider: currentProvider,
      credentials: {
        apiKey: currentKey.apiKey,
        endpoint: currentKey.endpoint,
        apiVersion: currentKey.apiVersion,
      },
      model: currentModel,
      modelSettings: (() => {
        const stored = settings?.modelSettings?.[modelKey] ?? {}
        const next: ModelSettings = { ...stored }
        if (currentModel.capabilities.reasoning === "supported") {
          next.reasoningEffort =
            settings?.reasoningMode === "fast"
              ? "low"
              : settings?.reasoningMode === "advanced"
                ? "high"
                : "medium"
        }
        return next
      })(),
      appSettings: settings!,
      system,
      turns,
      toolSpecs,
      integrations: integrationContext,
      approvedTools: options?.approvedTools,
      signal: controller.signal,
      hooks: {
        onStage: (next) => setStage(next),
        onText: (chunk) => {
          const live = liveRef.current
          if (!live || live.id !== assistantId) return
          live.content += chunk
          live.parts = upsertTextPart(live, live.content)
        },
        onReasoning: (chunk) => {
          const live = liveRef.current
          if (!live || live.id !== assistantId) return
          live.reasoning = (live.reasoning ?? "") + chunk
        },
        onTool: (tool) => {
          const live = liveRef.current
          if (!live || live.id !== assistantId) return
          live.parts = upsertToolPart(live, tool)
          live.tools = [
            ...(live.tools ?? []).filter((item) => item.id !== tool.id),
            tool,
          ]
        },
      },
    })

    if (result.displayBlocks.length) {
      const sources = `\n\n---\n\n${result.displayBlocks.join("\n\n")}`
      assistantMessage.content += sources
      assistantMessage.parts = upsertTextPart(assistantMessage, assistantMessage.content)
      if (assistantMessage.tools?.length) {
        for (const tool of assistantMessage.tools) {
          assistantMessage.parts = upsertToolPart(assistantMessage, tool)
        }
      }
    }

    if (result.error) {
      assistantMessage.content = assistantMessage.content || `**${t("chat.errorPrefix")}**`
      assistantMessage.parts = upsertTextPart(
        assistantMessage,
        `${assistantMessage.content}\n\n> ${result.error}`
      )
      setLastError(result.error)
      toast.error(result.error)
    }

    if (result.aborted && !assistantMessage.content) {
      assistantMessage.content = t("chat.stopped")
      assistantMessage.parts = upsertTextPart(assistantMessage, assistantMessage.content)
    }

    if (result.pendingAsk) {
      setPendingAsk({ messageId: assistantId, toolId: result.pendingAsk.toolId, input: result.pendingAsk.input })
    } else {
      setPendingAsk(null)
    }

    if (result.pendingApproval) {
      setPendingApproval({
        messageId: assistantId,
        toolId: result.pendingApproval.toolId,
        name: result.pendingApproval.name,
        input: result.pendingApproval.input,
      })
    } else {
      setPendingApproval(null)
    }

    liveRef.current = null
    setMessages((current) =>
      current.map((message) => (message.id === assistantId ? { ...assistantMessage } : message))
    )
    await saveMessage(assistantMessage, conversationRecord.id)

    const firstUser = history.find((message) => message.sender === "user")
    const title =
      conversationRecord.title === t("chat.new") && firstUser
        ? firstUser.content.slice(0, 60).replace(/\s+/g, " ").trim() || conversationRecord.title
        : conversationRecord.title
    const updated: ConversationRecord = {
      ...conversationRecord,
      title,
      modelId: currentModel.id,
      providerId: currentModel.providerId,
      mode,
      updatedAt: Date.now(),
    }
    await putConversation(updated)
    conversationRef.current = updated
    setConversation(updated)

    setIsGenerating(false)
    setStage("idle")
    setStartedAt(undefined)
    abortRef.current = null
  }

  /* ---------------------------------------------------------------- actions */

  const handleSend = async (payload: ChatInputPayload) => {
    if (!user) return
    if (pendingAsk) {
      toast.message("Answer the open question first.")
      return
    }
    if (pendingApproval) {
      toast.message("Approve or cancel the pending action first.")
      return
    }
    if (!currentModel || !currentProvider) {
      toast.error(t("chat.modelMissing"))
      navigate("/providers")
      return
    }
    if (!currentKey?.apiKey) {
      toast.error(t("chat.noProvider"))
      navigate("/providers")
      return
    }
    if (!settings) return

    const command = payload.text.trim()
    if (command === "/temporary") {
      setTemporary(true)
      if (conversationRef.current) {
        const updated = { ...conversationRef.current, temporary: true, updatedAt: Date.now() }
        conversationRef.current = updated
        setConversation(updated)
        await putConversation(updated)
        navigate(`/chat/${updated.id}?temporary=1`, { replace: true })
      } else {
        navigate("/chat?temporary=1", { replace: true })
      }
      toast.success(t("chat.temporary"))
      return
    }
    if (command === "/clear") {
      if (conversationRef.current) {
        await deleteMessages(user.uid, conversationRef.current.id)
      }
      setMessages([])
      setPendingAsk(null)
      setLastError(null)
      toast.success("Conversation cleared")
      return
    }

    setLastError(null)
    const conversationRecord = await ensureConversation()
    const attachments: MessageAttachmentData[] = []
    if (pendingLibrary) attachments.push(pendingLibrary)
    for (const file of payload.files ?? []) {
      try {
        const record = await saveLibraryFile(user.uid, file, "Chat attachments")
        const attachment = await fileToAttachment(record)
        attachments.push({
          id: attachment.id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          url: attachment.url,
        })
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not attach the file.")
      }
    }

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      sender: "user",
      content: payload.text,
      attachments: attachments.length ? attachments : undefined,
    }
    setPendingLibrary(null)
    const nextHistory = [...messages, userMessage]
    setMessages(nextHistory)
    await saveMessage(userMessage, conversationRecord.id)
    await putConversation({ ...conversationRecord, updatedAt: Date.now() })

    await runTurn(nextHistory)
  }

  const stop = () => {
    abortRef.current?.abort()
    setIsGenerating(false)
    setStage("idle")
  }

  const regenerate = async () => {
    if (isGenerating) return
    const lastAssistant = [...messages].reverse().find((message) => message.sender === "assistant")
    if (!lastAssistant) return
    const index = messages.findIndex((message) => message.id === lastAssistant.id)
    const history = messages.slice(0, index)
    setMessages(history)
    if (conversationId) {
      await deleteMessagesForAssistant(lastAssistant.id)
    }
    await runTurn(history)
  }

  const deleteMessagesForAssistant = async (_messageId: string) => {
    // Remove just this assistant row by rewriting the transcript in memory and DB.
    if (!conversationId) return
    const { db } = await import("@/lib/db")
    await db.messages.delete(_messageId)
  }

  const handleEdit = async (messageId: string, content: string) => {
    if (!conversationId || isGenerating) return
    const index = messages.findIndex((message) => message.id === messageId)
    if (index < 0) return
    const edited: ChatMessageData = { ...messages[index], content, parts: undefined }
    const history = [...messages.slice(0, index), edited]
    const removed = messages.slice(index + 1)
    setMessages(history)
    const { db } = await import("@/lib/db")
    await db.messages.bulkDelete(removed.map((message) => message.id))
    await saveMessage(edited, conversationId)
    await runTurn(history)
  }

  const handleAskAnswer = async (
    messageId: string,
    toolId: string,
    result: AskQuestionResult
  ) => {
    if (!pendingAsk || !conversationId || !user) return
    const input = askQuestionToolArgs(pendingAsk.input)
    const answerText = answersToTurnText(result, input)
    const output = formatAskQuestionOutput(result)
    const updatedMessages = messages.map((message) =>
      message.id === (pendingAsk.messageId || messageId)
        ? {
            ...message,
            tools: (message.tools ?? []).map((tool) =>
              tool.id === toolId
                ? { ...tool, status: "done" as const, output }
                : tool
            ),
            parts: (message.parts ?? []).map((part) =>
              part.type === "tool" && part.tool.id === toolId
                ? { ...part, tool: { ...part.tool, status: "done" as const, output } }
                : part
            ),
          }
        : message
    )
    setMessages(updatedMessages)
    setPendingAsk(null)
    const assistant = updatedMessages.find((message) => message.id === pendingAsk.messageId)
    if (assistant) await saveMessage(assistant, conversationId)

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      sender: "user",
      content: answerText,
    }
    const history = [...updatedMessages, userMessage]
    setMessages(history)
    await saveMessage(userMessage, conversationId)
    await runTurn(history)
  }

  /**
   * A write tool stops the turn until this runs. Nothing is executed on the
   * user's behalf without this click: approval executes exactly the call the
   * model asked for and hands its real result back into the conversation.
   */
  const resolveApproval = async (approved: boolean) => {
    const pending = pendingApproval
    if (!pending || !settings || !conversationId) return
    setPendingApproval(null)
    if (!approved) {
      toast.message("Write action cancelled.")
      return
    }
    const tool = toolByName(pending.name)
    if (!tool) {
      toast.error(`Unknown tool ${pending.name}.`)
      return
    }
    let args: Record<string, unknown> = {}
    try {
      args = pending.input ? (JSON.parse(pending.input) as Record<string, unknown>) : {}
    } catch {
      args = {}
    }
    const result = await tool.execute(args, { settings, integrations: integrationContext })
    const updatedMessages = messages.map((message) =>
      message.id === pending.messageId
        ? {
            ...message,
            tools: (message.tools ?? []).map((entry) =>
              entry.id === pending.toolId
                ? { ...entry, status: result.ok ? ("done" as const) : ("error" as const), output: result.content }
                : entry
            ),
            parts: (message.parts ?? []).map((part) =>
              part.type === "tool" && part.tool.id === pending.toolId
                ? { ...part, tool: { ...part.tool, status: result.ok ? ("done" as const) : ("error" as const), output: result.content } }
                : part
            ),
          }
        : message
    )
    setMessages(updatedMessages)
    const assistant = updatedMessages.find((message) => message.id === pending.messageId)
    if (assistant) await saveMessage(assistant, conversationId)

    const userMessage: ChatMessageData = {
      id: crypto.randomUUID(),
      sender: "user",
      content: `I approved running ${pending.name}. Here is what it returned:\n\n${result.content}`,
    }
    const history = [...updatedMessages, userMessage]
    setMessages(history)
    await saveMessage(userMessage, conversationId)
    await runTurn(history, { approvedTools: [pending.name] })
  }

  const copyTranscript = async () => {
    const lastAssistant = [...messages].reverse().find((message) => message.sender === "assistant")
    if (!lastAssistant) return
    await navigator.clipboard.writeText(lastAssistant.content)
    toast.success(t("common.copied"))
  }

  const readLast = () => {
    if (speaking) {
      cancelSpeech()
      setSpeaking(false)
      return
    }
    const lastAssistant = [...messages].reverse().find((message) => message.sender === "assistant")
    if (!lastAssistant) return
    setSpeaking(true)
    try {
      speak(lastAssistant.content, {
        language: language === "ar" ? "ar-SA" : "en-US",
        voiceUri: settings?.ttsVoiceUri,
        rate: settings?.ttsRate,
        onEnd: () => setSpeaking(false),
        onStateChange: (state) => setSpeaking(state !== "idle"),
      })
    } catch (error) {
      setSpeaking(false)
      toast.error(error instanceof Error ? error.message : "Speech is unavailable.")
    }
  }

  const saveTemporary = async () => {
    if (!conversation) return
    const updated = { ...conversation, temporary: false, updatedAt: Date.now() }
    await putConversation(updated)
    setConversation(updated)
    setTemporary(false)
    navigate(`/chat/${updated.id}`, { replace: true })
    toast.success("Chat saved to history.")
  }

  const deleteCurrent = async () => {
    if (!conversation || !user) return
    await deleteConversation(user.uid, conversation.id)
    navigate("/chat")
  }

  /* ------------------------------------------------------------------ view */

  const suggestions: PromptSuggestion[] = [
    { id: "explain", label: language === "ar" ? "اشرح لي هذا المشروع" : "Explain what this project does" },
    { id: "plan", label: language === "ar" ? "ضع خطة لإطلاق منتج" : "Plan the launch of a product" },
    { id: "compare", label: language === "ar" ? "قارن بين نموذجين بالجدول" : "Compare two models in a table" },
  ]

  const toolsRow = (
    <div className="flex min-w-0 items-center gap-1">
      <span data-composer-label>
        <ModePicker
          side="top"
          value={mode}
          onChange={(next) => {
            setMode(next)
            if (conversation) void putConversation({ ...conversation, mode: next })
          }}
          label={t("chat.mode")}
        />
      </span>
      <span data-composer-label className="min-w-0">
        <ModelPicker
          side="top"
          options={modelOptions}
          groups={modelGroups}
          value={modelKey}
          onChange={(next) => {
            setModelKey(next)
            const [providerId, ...rest] = next.split(":")
            void patchSettings({ defaultProviderId: providerId, defaultModelId: rest.join(":") })
          }}
          efforts={reasoningSupported ? DEFAULT_MODEL_EFFORTS : false}
          effort={reasoningSupported ? effortValue : undefined}
          onEffortChange={(value) => {
            const mode = value === "low" ? "fast" : value === "high" || value === "xhigh" ? "advanced" : "balanced"
            void patchSettings({ reasoningMode: mode })
          }}
          effortLabel={t("chat.reasoning")}
          searchPlaceholder={t("models.searchPlaceholder")}
          placeholder={t("chat.modelMissing")}
          disabled={!modelOptions.length}
          className="min-w-0 max-w-[min(220px,55vw)]"
        />
      </span>
      <IntegrationPicker
        integrations={integrations}
        selected={selectedIntegrations}
        onChange={setSelectedIntegrations}
        className="shrink-0"
      />
      {totalContext ? (
        <span data-composer-overflow className="hidden sm:block">
          <ContextMeter used={usedContext} total={totalContext} showFrom={0.02} />
        </span>
      ) : null}
    </div>
  )

  const banners = (
    <>
      {temporary ? (
        <div className="mx-3 mb-1 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-[11.5px] text-amber-700 dark:text-amber-300">
          <Clock className="size-3.5" />
          <span className="flex-1">{t("chat.temporaryHint")}</span>
          {conversation ? (
            <Button size="sm" variant="outline" className="h-6 gap-1 text-[11px]" onClick={saveTemporary}>
              <BookmarkPlus className="size-3" />
              {t("chat.saveTemporary")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {pendingLibrary ? (
        <div className="mx-3 mb-1 flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-[11.5px] text-muted-foreground">
          <span className="flex-1">
            {t("library.attach")}: <span className="text-foreground">{pendingLibrary.name}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px]"
            onClick={() => setPendingLibrary(null)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      ) : null}
      {providersWithoutKey ? (
        <div className="mx-3 mb-1 flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-[11.5px] text-muted-foreground">
          <span className="flex-1">{t("chat.noProvider")}</span>
          <Button size="sm" variant="outline" className="h-6 text-[11px]" onClick={() => navigate("/providers")}>
            {t("providers.title")}
          </Button>
        </div>
      ) : null}
      {pendingApproval ? (
        <div className="mx-3 mb-1 flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11.5px] text-amber-700 dark:text-amber-300">
          <span className="flex-1">
            {t("integration.approval.title")}: <span className="font-mono">{pendingApproval.name}</span>
          </span>
          <Button size="sm" className="h-6 text-[11px]" onClick={() => void resolveApproval(true)}>
            {t("integration.approval.allow")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px]"
            onClick={() => void resolveApproval(false)}
          >
            {t("integration.approval.cancel")}
          </Button>
        </div>
      ) : null}
      {lastError ? (
        <div className="mx-3 mb-1 flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-[11.5px] text-destructive">
          <span className="flex-1">{lastError}</span>
          <Button size="sm" variant="outline" className="h-6 gap-1 text-[11px]" onClick={() => void regenerate()}>
            <RefreshCw className="size-3" />
            {t("common.retry")}
          </Button>
        </div>
      ) : null}
    </>
  )

  if (loadingConversation) {
    return (
      <div className="grid flex-1 place-items-center">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatNavbar
        title={conversation?.title ?? t("chat.new")}
        right={
          <>
            {temporary ? (
              <Badge variant="outline" className="h-5 text-[10px]">
                {t("chat.temporaryBadge")}
              </Badge>
            ) : null}
            {conversation ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => void deleteCurrent()}
                aria-label={t("common.delete")}
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
                </svg>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={readLast}
              aria-label={speaking ? "Stop speaking" : "Read answer aloud"}
              disabled={!messages.some((message) => message.sender === "assistant")}
            >
              {speaking ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => void copyTranscript()}
              aria-label={t("chat.copy")}
              disabled={!messages.some((message) => message.sender === "assistant")}
            >
              <Copy className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => void regenerate()}
              aria-label={t("chat.regenerate")}
              disabled={isGenerating || !conversation}
            >
              <RefreshCw className="size-4" />
            </Button>
            <ThemeToggle floating={false} className="size-7" />
          </>
        }
      />

      <div className={cn("flex min-h-0 flex-1 flex-col", isEmpty && "justify-center")}>
        {isEmpty ? (
          <ChatEmptyState
            className="pb-2"
            title={t("home.greeting")}
            description={t("home.subtitle")}
            icon={<BotMark />}
          >
            {pendingLibrary ? (
        <div className="mx-3 mb-1 flex flex-wrap items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-[11.5px] text-muted-foreground">
          <span className="flex-1">
            {t("library.attach")}: <span className="text-foreground">{pendingLibrary.name}</span>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[11px]"
            onClick={() => setPendingLibrary(null)}
          >
            {t("common.cancel")}
          </Button>
        </div>
      ) : null}
      {providersWithoutKey ? (
              <div className="mx-auto flex max-w-md flex-col items-center gap-2">
                <Button size="sm" onClick={() => navigate("/providers")}>
                  {t("providers.addKey")}
                </Button>
                <p className="text-[11.5px] text-muted-foreground">{t("chat.noProvider")}</p>
              </div>
            ) : null}
          </ChatEmptyState>
        ) : (
          <MarkdownImageLightbox>
          <MessageList
            className="min-h-0 flex-1"
            patternHandlers={CHAT_PATTERN_HANDLERS}
            messages={messages}
            isGenerating={isGenerating}
            generationStage={stage}
            generationStartedAt={startedAt}
            onEditMessage={handleEdit}
            onAskAnswer={(messageId, toolId, result) => void handleAskAnswer(messageId, toolId, result)}
            renderActions={(message) =>
              message.sender === "assistant" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-[11.5px]"
                  onClick={async () => {
                    await navigator.clipboard.writeText(message.content)
                    toast.success(t("common.copied"))
                  }}
                >
                  <Copy className="size-3.5" />
                  {t("common.copy")}
                </Button>
              ) : null
            }
          />
          </MarkdownImageLightbox>
        )}

        <div className="w-full shrink-0 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {banners}
          <IntegrationChips
            selected={selectedIntegrations}
            integrations={integrations}
            onRemove={(id) => setSelectedIntegrations((current) => current.filter((item) => item !== id))}
          />
          <ChatInput
            ref={inputRef}
            className={cn(isEmpty && "pb-0 sm:pb-0")}
            isGenerating={isGenerating}
            onStop={stop}
            placeholder={t("chat.placeholder")}
            onSend={(payload) => void handleSend(payload)}
            onTextChange={(text) => setDraftLength(text.length)}
            disabled={!currentModel}
            tools={toolsRow}
            slashCommands={[
              {
                name: "temporary",
                description: "Start a temporary chat that is kept out of history",
                mustStartMessage: true,
              },
              {
                name: "clear",
                description: "Clear this conversation from the device",
                mustStartMessage: true,
              },
            ]}
          />
          {isEmpty ? (
            <PromptSuggestions
              items={suggestions}
              onSelect={(item) => void handleSend({ text: item.label, files: [], skills: [] })}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}

function BotMark() {
  return (
    <span className="grid size-full place-items-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5">
        <rect x="4" y="7" width="16" height="12" rx="3" />
        <path d="M12 3v4M9 13h.01M15 13h.01M9 17h6" />
      </svg>
    </span>
  )
}
