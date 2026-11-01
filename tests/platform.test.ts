import assert from "node:assert/strict"
import test from "node:test"

import { askQuestionToolArgs, answersToTurnText } from "../src/platform/ask-question.ts"
import { imageResultMarkdown, searchResultMarkdown } from "../src/platform/search.ts"
import { decodeToken } from "../src/lib/tokens.ts"
import { PROVIDERS, getProvider } from "../src/platform/providers.ts"

test("ask_question arguments are normalised for the UI", () => {
  const parsed = askQuestionToolArgs(
    JSON.stringify({
      title: "Before I start",
      questions: [{ prompt: "Which stack?", options: ["Next.js", "Vite"] }],
    })
  )
  assert.equal(parsed.title, "Before I start")
  assert.equal(parsed.questions.length, 1)
  assert.equal(parsed.questions[0].id, "q0")
  assert.deepEqual(
    parsed.questions[0].options.map((option) => option.label),
    ["Next.js", "Vite"]
  )
})

test("malformed ask_question input still yields a usable question", () => {
  const parsed = askQuestionToolArgs("not json")
  assert.equal(parsed.questions.length, 1)
  assert.ok(parsed.questions[0].options.length >= 2)
})

test("answers are turned into a real conversation turn", () => {
  const input = askQuestionToolArgs(
    JSON.stringify({
      questions: [
        { id: "style", prompt: "Style?", options: [{ id: "dark", label: "Dark" }, { id: "light", label: "Light" }] },
      ],
    })
  )
  const text = answersToTurnText(
    { skipped: false, answers: { style: { optionIds: ["dark"] } } },
    input
  )
  assert.match(text, /Style\?: Dark/)
})

test("sources render with the exact URLs that were returned", () => {
  const markdown = searchResultMarkdown([
    { title: "Example", url: "https://example.com/a", snippet: "Snippet", source: "Wikipedia" },
  ])
  const token = /\[\[src:([A-Za-z0-9_-]+)\]\]/.exec(markdown)?.[1]
  assert.ok(token, "a source token is emitted")
  const payload = decodeToken(token)
  assert.equal(payload?.url, "https://example.com/a")
  assert.equal(payload?.index, 1)
  assert.equal(payload?.title, "Example")
})

test("image cards carry source, licence and author", () => {
  const markdown = imageResultMarkdown([
    {
      title: "Colosseum",
      imageUrl: "https://upload.wikimedia.org/x.jpg",
      pageUrl: "https://commons.wikimedia.org/wiki/File:X",
      source: "Wikimedia Commons",
      license: "CC BY-SA 4.0",
      author: "Someone",
    },
  ])
  const token = /\[\[img:([A-Za-z0-9_-]+)\]\]/.exec(markdown)?.[1]
  assert.ok(token, "an image token is emitted")
  const payload = decodeToken(token)
  assert.equal(payload?.source, "Wikimedia Commons")
  assert.equal(payload?.src, "https://upload.wikimedia.org/x.jpg")
  assert.equal(payload?.page, "https://commons.wikimedia.org/wiki/File:X")
  assert.match(String(payload?.description), /CC BY-SA 4\.0/)
  assert.match(String(payload?.description), /Someone/)
})

test("catalog holds the 20 requested providers and no invented ones", () => {
  assert.equal(PROVIDERS.length, 20)
  assert.equal(getProvider("bedrock")?.requiresProxy, true)
  assert.equal(getProvider("replicate")?.requiresProxy, true)
  assert.equal(getProvider("openrouter")?.supportsModelDiscovery, true)
})
