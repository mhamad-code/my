import type { MessageToolCallData } from "@/components/ui/message-parts"
import type { GenerationStage } from "@/components/ui/generation-status"
import type { AppSettings, ModelSettings } from "@/lib/types"
import {
  ProviderError,
  streamChat,
  type ChatTurn,
  type ProviderCredentials,
  type StreamEvent,
  type ToolCall,
  type ToolSpec,
} from "@/platform/adapters"
import type { ModelInfo, ProviderDefinition } from "@/platform/providers"
import { askQuestionToolArgs } from "@/platform/ask-question"
import { toolByName, type IntegrationContext } from "@/platform/tools"

export type ChatTurnResult = {
  text: string
  reasoning: string
  displayBlocks: string[]
  pendingAsk?: { toolId: string; input: string }
  /** A write tool the model asked for; the user has to approve it first. */
  pendingApproval?: { toolId: string; name: string; input: string }
  usage?: { inputTokens?: number; outputTokens?: number }
  aborted: boolean
  error?: string
}

export type ChatEngineHooks = {
  onText: (chunk: string) => void
  onReasoning: (chunk: string) => void
  onStage: (stage: GenerationStage) => void
  onTool: (tool: MessageToolCallData) => void
  onUsage?: (usage: { inputTokens?: number; outputTokens?: number }) => void
}

export type ChatEngineParams = {
  provider: ProviderDefinition
  credentials: ProviderCredentials
  model: ModelInfo
  modelSettings: ModelSettings
  appSettings: AppSettings
  system: string
  turns: ChatTurn[]
  toolSpecs?: ToolSpec[]
  /** Connected services and the ones the user attached to this message. */
  integrations?: IntegrationContext
  /** Tool names the user already approved for this turn. */
  approvedTools?: string[]
  signal: AbortSignal
  hooks: ChatEngineHooks
}

const MAX_TOOL_ROUNDS = 4

function toolFromCall(call: ToolCall, status: MessageToolCallData["status"]): MessageToolCallData {
  return {
    id: call.id,
    name: call.name,
    status,
    input: call.arguments,
  }
}

/**
 * Streams one assistant turn, including provider-native tool calls. The loop
 * stops and hands control back when the model asks a structured question, so the
 * UI can collect the answer with AskQuestion.
 */
export async function runAssistantTurn(params: ChatEngineParams): Promise<ChatTurnResult> {
  const { hooks, signal, provider, credentials, model } = params
  const turns = [...params.turns]
  const tools: ToolSpec[] = []
  if (provider.supportsTools && params.model.capabilities["tool-calling"] !== "unsupported") {
    tools.push(...(params.toolSpecs ?? []))
  }

  let text = ""
  let reasoning = ""
  const displayBlocks: string[] = []
  let usage: ChatTurnResult["usage"]

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const calls: ToolCall[] = []
      let roundText = ""
      hooks.onStage("responding")

      for await (const event of streamChat({
        provider,
        credentials,
        model: model.id,
        turns,
        system: params.system,
        settings: params.modelSettings,
        tools,
        signal,
      })) {
        if (signal.aborted) break
        handleEvent(event)
      }

      function handleEvent(event: StreamEvent) {
        switch (event.type) {
          case "text":
            text += event.text
            roundText += event.text
            hooks.onText(event.text)
            break
          case "reasoning":
            reasoning += event.text
            hooks.onReasoning(event.text)
            break
          case "tool_call":
            calls.push(event.call)
            break
          case "usage":
            usage = {
              inputTokens: (usage?.inputTokens ?? 0) + (event.inputTokens ?? 0),
              outputTokens: (usage?.outputTokens ?? 0) + (event.outputTokens ?? 0),
            }
            hooks.onUsage?.(usage)
            break
          case "done":
            break
        }
      }

      if (signal.aborted) {
        return { text, reasoning, displayBlocks, usage, aborted: true }
      }

      if (calls.length === 0) {
        return { text, reasoning, displayBlocks, usage, aborted: false }
      }

      // Attach the assistant's tool calls so the provider sees its own turn.
      turns.push({ role: "assistant", content: roundText, toolCalls: calls })

      const askCall = calls.find((call) => call.name === "ask_question")
      if (askCall) {
        const input = askQuestionToolArgs(askCall.arguments)
        hooks.onTool({
          id: askCall.id,
          name: "ask_question",
          status: "running",
          input: JSON.stringify(input),
        })
        return {
          text,
          reasoning,
          displayBlocks,
          usage,
          aborted: false,
          pendingAsk: { toolId: askCall.id, input: JSON.stringify(input) },
        }
      }

      let executedAny = false
      for (const call of calls) {
        const tool = toolByName(call.name)
        let args: Record<string, unknown> = {}
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {}
        } catch {
          args = {}
        }

        if (!tool) {
          turns.push({
            role: "tool",
            toolCallId: call.id,
            name: call.name,
            content: `Unknown tool “${call.name}”. Available tools: ${tools.map((item) => item.name).join(", ") || "none"}.`,
          })
          hooks.onTool({
            id: call.id,
            name: call.name,
            status: "error",
            input: call.arguments,
            output: `Unknown tool “${call.name}”.`,
          })
          executedAny = true
          continue
        }

        const environment = { settings: params.appSettings, integrations: params.integrations }
        if (!tool.available(environment)) {
          const reason = tool.unavailableReason?.(environment) ?? "Tool is disabled."
          turns.push({ role: "tool", toolCallId: call.id, name: call.name, content: reason })
          hooks.onTool(toolFromCall(call, "error"))
          hooks.onTool({
            id: call.id,
            name: call.name,
            status: "error",
            input: call.arguments,
            output: reason,
          })
          executedAny = true
          continue
        }

        // Writes stop here and go back to the UI for an explicit approval. The
        // model never sees a write execute because it asked nicely.
        const approved = params.approvedTools?.includes(call.name) ?? false
        if (tool.requiresConfirmation && params.appSettings.requireToolConsent && !approved) {
          hooks.onTool({ ...toolFromCall(call, "running"), output: "Waiting for your approval…" })
          return {
            text,
            reasoning,
            displayBlocks,
            usage,
            aborted: false,
            pendingApproval: { toolId: call.id, name: call.name, input: call.arguments || "{}" },
          }
        }

        hooks.onTool(toolFromCall(call, "running"))
        hooks.onStage(call.name === "web_search" ? "searching" : "thinking")
        const result = await tool.execute(args, {
          settings: params.appSettings,
          integrations: params.integrations,
          signal,
        })
        hooks.onTool({
          id: call.id,
          name: call.name,
          status: result.ok ? "done" : "error",
          input: call.arguments,
          output: result.content,
        })
        turns.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: result.content,
        })
        if (result.display) displayBlocks.push(result.display)
        executedAny = true
      }

      if (!executedAny) return { text, reasoning, displayBlocks, usage, aborted: false }
      hooks.onStage("thinking")
    }

    text += "\n\n_Stopped after the maximum number of tool rounds._"
    return { text, reasoning, displayBlocks, usage, aborted: false }
  } catch (error) {
    if (signal.aborted) {
      return { text, reasoning, displayBlocks, usage, aborted: true }
    }
    const message =
      error instanceof ProviderError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Unknown provider error."
    return { text, reasoning, displayBlocks, usage, aborted: false, error: message }
  }
}

/** System prompt assembled from platform rules, project instructions and mode. */
export function buildSystemPrompt(options: {
  mode: "ask" | "plan" | "agent"
  language: "en" | "ar"
  projectInstructions?: string
  modelInstructions?: string
  toolNames: string[]
  imageSearchEnabled: boolean
}): string {
  const lines = [
    "You are the assistant inside AI Platform, a local-first AI workspace.",
    "Answer in the language the user writes in. Be accurate and concise; never invent sources, links, images or capabilities.",
    "Markdown is supported (GFM tables, task lists, footnotes, KaTeX with $…$ or $$…$$, Mermaid with ```mermaid, code with syntax highlighting).",
    "You may produce charts and structured views by fenced blocks only when the user asks for data visualisation.",
    options.imageSearchEnabled
      ? "When the user asks about a place, person, company, product or object and an image would help, call search_images. Use only the image URLs it returns, cite the source page, and never generate or guess image links."
      : "Image search is disabled by the user; do not claim to show images.",
    options.toolNames.length
      ? `You can call these tools: ${options.toolNames.join(", ")}. Prefer a tool over guessing. Cite every web source you use with a markdown link.`
      : "No tools are available in this session. If you need current data, say so instead of guessing.",
    "For a larger task (building an app, writing an article, planning a trip) ask 2-4 focused clarifying questions with ask_question before starting.",
  ]
  if (options.mode === "plan") {
    lines.push(
      "Plan mode: produce a clear, ordered plan and wait for approval before writing long deliverable content."
    )
  }
  if (options.mode === "agent") {
    lines.push(
      "Agent mode: work through the task end to end, narrate progress briefly, and use todo lists for multi-step work."
    )
  }
  if (options.mode === "ask") {
    lines.push("Ask mode: answer the question directly without taking side actions.")
  }
  if (options.language === "ar") lines.push("The user's interface language is Arabic.")
  if (options.projectInstructions?.trim()) {
    lines.push(`Project instructions (follow them for this conversation):\n${options.projectInstructions.trim()}`)
  }
  if (options.modelInstructions?.trim()) {
    lines.push(`Custom instructions:\n${options.modelInstructions.trim()}`)
  }
  return lines.join("\n\n")
}
