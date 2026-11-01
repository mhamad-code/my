import { chromium } from "playwright"
import fs from "node:fs"

const base = "http://localhost:3000"
const routes = ["/", "/chat", "/models", "/providers", "/projects", "/library", "/images", "/search", "/integrations", "/settings", "/account", "/login", "/register"]
const widths = [768, 1024, 1280, 1440]
const report = { errors: [], sweep: [], images: [], checks: {} }

const browser = await chromium.launch()
browser.on("disconnected", () => console.log("DISCONNECTED"))
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "ar" })
const page = await context.newPage()
page.on("pageerror", (error) => report.errors.push(`pageerror: ${error.message.slice(0, 160)}`))
page.on("console", (message) => {
  if (message.type() === "error") report.errors.push(`console: ${message.text().slice(0, 160)}`)
})

const measureOn = (target) =>
  target.evaluate(() => {
    const viewport = window.innerWidth
    const offenders = []
    document.querySelectorAll("body *").forEach((element) => {
      if (element.closest("#app-sidebar")) return
      if (element.getAttribute("aria-hidden") === "true") return
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      if (rect.right > viewport + 1 || rect.left < -1) {
        offenders.push({ tag: element.tagName.toLowerCase(), slot: element.getAttribute("data-slot") || "", left: Math.round(rect.left), right: Math.round(rect.right), className: String(element.className).slice(0, 90) })
      }
    })
    return { viewport, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 5), offenderCount: offenders.length }
  })

try {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1600)
  const seed = await page.evaluate(async () => {
    const db = await import("/src/lib/db.ts")
    const session = await import("/src/store/session.ts")
    const tokens = await import("/src/lib/tokens.ts")
    const user = session.useSession.getState().user
    if (!user) return { error: "no local profile" }
    const now = Date.now()
    const id = "media-fixture-desktop"
    await db.putConversation({ id, userId: user.uid, title: "Images and sources", modelId: "gpt-4o-mini", providerId: "openai", mode: "chat", temporary: false, pinned: false, sortIndex: now, createdAt: now, updatedAt: now })
    const content = [
      "## صور ومصادر",
      tokens.encodeToken("img", { src: "https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg", title: "GitHub", description: "منصة لاستضافة المشاريع البرمجية وإدارة المستودعات والتعاون بين المطورين.", page: "https://github.com", source: "Wikimedia Commons" }),
      tokens.encodeToken("img", { src: "https://upload.wikimedia.org/wikipedia/commons/3/35/GitLab_icon.svg", title: "GitLab", description: "منصة DevOps متكاملة لإدارة المستودعات والتكامل المستمر.", page: "https://about.gitlab.com", source: "Wikimedia Commons" }),
      tokens.encodeToken("src", { index: 1, title: "GitHub — Wikipedia", url: "https://en.wikipedia.org/wiki/GitHub", snippet: "GitHub is a developer platform.", source: "Wikipedia" })
    ].join("\n\n")
    const shared = { userId: user.uid, conversationId: id, reasoning: null, tools: undefined, parts: undefined, attachments: undefined }
    await db.putMessage({ ...shared, id: "d1", sender: "user", content: "اعرض لي صوراً", createdAt: now })
    await db.putMessage({ ...shared, id: "d2", sender: "assistant", content, createdAt: now + 1 })
    return { id }
  })
  await page.goto(`${base}/chat/${seed.id}`, { waitUntil: "load", timeout: 25000 }).catch(() => {})
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: "artifacts/chat-desktop.png" })
  report.images = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-slot="message"] img')).map((img) => {
      const rect = img.getBoundingClientRect()
      return { width: Math.round(rect.width), height: Math.round(rect.height) }
    })
  )
  report.checks.sidebarClosedByDefault = await page.evaluate(() => document.getElementById("app-sidebar").getAttribute("aria-hidden"))
  await page.getByRole("button", { name: /القائمة|Menu/ }).first().click()
  await page.waitForTimeout(450)
  await page.screenshot({ path: "artifacts/sidebar-open-desktop.png" })
  report.checks.sidebarOpenWidth = await page.evaluate(() => Math.round(document.getElementById("app-sidebar").getBoundingClientRect().width))
  await page.keyboard.press("Escape")
  await page.waitForTimeout(350)
  report.checks.sidebarAfterEscape = await page.evaluate(() => document.getElementById("app-sidebar").getAttribute("aria-hidden"))

  for (const width of widths) {
    const widthContext = await browser.newContext({ viewport: { width, height: 900 }, locale: "ar" })
    const widthPage = await widthContext.newPage()
    for (const route of routes) {
      try {
        await widthPage.goto(base + route, { waitUntil: "domcontentloaded", timeout: 15000 })
      } catch (error) {
        report.errors.push(`goto ${route}@${width}: ${String(error).slice(0, 100)}`)
        continue
      }
      await widthPage.waitForTimeout(300)
      const result = await measureOn(widthPage)
      report.sweep.push({ width, route, ...result })
    }
    await widthContext.close().catch(() => {})
  }

  await page.goto(`${base}/models`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(600)
  await page.screenshot({ path: "artifacts/models-desktop.png" })
  report.fatal = null
} catch (error) {
  report.fatal = String(error).slice(0, 400)
} finally {
  fs.writeFileSync("artifacts/audit-desktop.json", JSON.stringify(report, null, 2))
  await browser.close().catch(() => {})
}

const failures = report.sweep.filter((entry) => entry.offenderCount > 0 || entry.scrollWidth > entry.viewport)
console.log(JSON.stringify({ fatal: report.fatal, checks: report.checks, images: report.images, sweepCount: report.sweep.length, failures, errors: report.errors.slice(0, 10) }, null, 1))
