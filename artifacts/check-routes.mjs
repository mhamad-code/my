import { chromium } from "playwright"

const browser = await chromium.launch(
  process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {}
)
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`))
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`)
})

const base = "http://127.0.0.1:3000"

// First load creates the local profile. Then seed one model so the card + tooltip path mounts.
await page.goto(base + "/", { waitUntil: "networkidle" })
await page.waitForTimeout(800)
const seeded = await page.evaluate(async () => {
  const open = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open("ai-platform")
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  const db = await open()
  const row = await new Promise((resolve, reject) => {
    const request = db.transaction("settings", "readonly").objectStore("settings").getAll()
    request.onsuccess = () => resolve(request.result[0])
    request.onerror = () => reject(request.error)
  })
  if (!row?.userId) return "no-profile"
  const userId = row.userId
  const record = {
    id: `${userId}:openai`,
    userId,
    providerId: "openai",
    updatedAt: Date.now(),
    models: [
      {
        id: "gpt-local-check",
        name: "Local Check Model",
        providerId: "openai",
        description: "Seeded only inside this test browser to mount the model card.",
        capabilities: { chat: "supported", "tool-calling": "supported", vision: "unknown" },
        contextLength: 128000,
        free: true,
        pricing: { inputPerMTokens: 0, outputPerMTokens: 0 },
        updatedAt: Date.now(),
      },
    ],
  }
  await new Promise((resolve, reject) => {
    const request = db.transaction("modelCache", "readwrite").objectStore("modelCache").put(record)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
  return "ok"
})

const routes = [
  "/",
  "/models",
  "/providers",
  "/chat",
  "/settings",
  "/library",
  "/projects",
  "/images",
  "/search",
  "/integrations",
  "/account",
  "/nope",
]

const report = {}
for (const route of routes) {
  errors.length = 0
  await page.goto(base + route, { waitUntil: "networkidle" })
  await page.waitForTimeout(900)
  const crash = await page.getByText("This page could not be rendered.").count()
  const text = (await page.locator("body").innerText()).replace(/\s+/g, " ").trim().slice(0, 110)
  report[route] = { seeded, crash, textLength: text.length, errors: errors.slice(0, 4), text }
}

// Exercise the tooltip on the models page — the call site that used to crash.
errors.length = 0
await page.goto(base + "/models", { waitUntil: "networkidle" })
await page.waitForTimeout(800)
const cardCount = await page.getByText("Local Check Model").count()
if (cardCount) {
  await page.getByRole("button", { name: /favorite|إضافة|مفضلة/i }).first().hover()
  await page.waitForTimeout(500)
}
const tooltipVisible = await page.locator("[data-slot=tooltip-content], [role=tooltip]").count()
report.tooltip = { cardCount, tooltipVisible, errors: errors.slice(0, 4) }

await page.screenshot({ path: "artifacts/models.png", fullPage: false })
await page.goto(base + "/chat", { waitUntil: "networkidle" })
await page.waitForTimeout(900)
await page.screenshot({ path: "artifacts/chat.png", fullPage: false })

await browser.close()
console.log(JSON.stringify(report, null, 2))
