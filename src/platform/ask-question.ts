import type { AskQuestionItem, AskQuestionResult } from "@/components/ui/ask-question"

export type AskQuestionInput = {
  title?: string
  questions: AskQuestionItem[]
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback
}

/**
 * Normalises whatever the model emitted into the exact shape `AskQuestion`
 * expects. Providers differ in naming, so ids and option ids are generated when
 * missing and every question gets at least two options.
 */
export function askQuestionToolArgs(raw: string | undefined): AskQuestionInput {
  let parsed: unknown = {}
  try {
    parsed = raw ? JSON.parse(raw) : {}
  } catch {
    parsed = {}
  }
  const source = parsed as {
    title?: unknown
    questions?: {
      id?: unknown
      prompt?: unknown
      question?: unknown
      options?: unknown
      allowMultiple?: unknown
      multiple?: unknown
    }[]
  }
  const questions = Array.isArray(source.questions) ? source.questions : []
  const items: AskQuestionItem[] = questions.slice(0, 5).map((question, index) => {
    const optionsSource = Array.isArray(question.options) ? question.options : []
    const options = optionsSource.slice(0, 6).map((option, optionIndex) => {
      if (typeof option === "string") {
        return { id: `o${optionIndex}`, label: option }
      }
      const record = option as { id?: unknown; label?: unknown; value?: unknown }
      return {
        id: asString(record.id, `o${optionIndex}`),
        label: asString(record.label ?? record.value, `Option ${optionIndex + 1}`),
      }
    })
    return {
      id: asString(question.id, `q${index}`),
      prompt: asString(question.prompt ?? question.question, `Question ${index + 1}`),
      options: options.length >= 2 ? options : [
        ...options,
        { id: "yes", label: "Yes" },
        { id: "no", label: "No" },
      ].slice(0, 2),
      allowMultiple: Boolean(question.allowMultiple ?? question.multiple),
    }
  })

  return {
    title: typeof source.title === "string" ? source.title : undefined,
    questions:
      items.length > 0
        ? items
        : [
            {
              id: "q0",
              prompt: "How should I continue?",
              options: [
                { id: "continue", label: "Continue" },
                { id: "change", label: "Change the approach" },
              ],
            },
          ],
  }
}

/** Human-readable answer text, appended to the conversation as a user turn. */
export function answersToTurnText(result: AskQuestionResult, input: AskQuestionInput): string {
  const detail = input.questions
    .map((question) => {
      const selection = result.answers[question.id]
      if (!selection) return undefined
      const labels = selection.optionIds.map(
        (id) => question.options.find((option) => option.id === id)?.label ?? id
      )
      if (selection.other?.trim()) labels.push(selection.other.trim())
      if (!labels.length) return undefined
      return `- ${question.prompt}: ${labels.join(", ")}`
    })
    .filter(Boolean)
    .join("\n")
  return detail
    ? `Answers to your questions:\n${detail}`
    : "I skipped the clarifying questions — continue with sensible defaults."
}
