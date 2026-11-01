import { chromium } from "playwright"
import fs from "node:fs"

const base = "http://localhost:3000"
const routes = ["/", "/chat", "/models", "/providers", "/projects", "/library", "/images", "/search", "/integrations", "/settings", "/account", "/login", "/register"]
const widths = [320, 360, 375, 390, 414, 430]
const report = { errors: [], sweep: [], checks: {}, images: [] }

const browser = await chromium.launch()
browser.on("disconnected", () => console.log("DISCONNECTED"))
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "ar",
  deviceScaleFactor: 2,
})
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
        offenders.push({
          tag: element.tagName.toLowerCase(),
          slot: element.getAttribute("data-slot") || "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          className: String(element.className).slice(0, 90),
        })
      }
    })
    return {
      viewport,
      scrollWidth: document.documentElement.scrollWidth,
      offenders: offenders.slice(0, 5),
      offenderCount: offenders.length,
    }
  })

try {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded" })
  await page.waitForTimeout(1600)

  report.seed = await page.evaluate(async () => {
    const db = await import("/src/lib/db.ts")
    const session = await import("/src/store/session.ts")
    const tokens = await import("/src/lib/tokens.ts")
    const user = session.useSession.getState().user
    if (!user) return { error: "no local profile" }
    const now = Date.now()
    const id = "media-fixture"
    await db.putConversation({
      id, userId: user.uid, title: "Images and sources", modelId: "gpt-4o-mini",
      providerId: "openai", mode: "chat", temporary: false, pinned: false,
      sortIndex: now, createdAt: now, updatedAt: now,
    })
    const img = (payload) => tokens.encodeToken("img", payload)
    const src = (payload) => tokens.encodeToken("src", payload)
    const content = [
      "## صور ومصادر",
      "هذه فقرة شرح عادية قبل الصور، لقياس المسافة البصرية بين النص والبطاقات.",
      img({ src: "https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg", title: "GitHub", description: "منصة لاستضافة المشاريع البرمجية وإدارة المستودعات والتعاون بين المطورين.", page: "https://github.com", source: "Wikimedia Commons" }),
      img({ src: "https://upload.wikimedia.org/wikipedia/commons/3/35/GitLab_icon.svg", title: "GitLab", description: "منصة DevOps متكاملة لإدارة المستودعات والتكامل المستمر.", page: "https://about.gitlab.com", source: "Wikimedia Commons" }),
      img({ src: "https://example.invalid/missing.png", title: "صورة غير متاحة", description: "رابط معطوب لاختبار البديل.", page: "https://example.com" }),
      "نص عادي مع [رابط خارجي طويل جداً](https://github.com/some/really/long/path/that/keeps/going/for/wrapping) داخل الإجابة.",
      src({ index: 1, title: "GitHub — Wikipedia", url: "https://en.wikipedia.org/wiki/GitHub", snippet: "GitHub is a developer platform for hosting and collaborating on code.", source: "Wikipedia" }),
      src({ index: 2, title: "GitLab — Wikipedia", url: "https://en.wikipedia.org/wiki/GitLab", snippet: "GitLab is a DevOps platform.", source: "Wikipedia" }),
    ].join("\n\n")
    const shared = { userId: user.uid, conversationId: id, reasoning: null, tools: undefined, parts: undefined, attachments: undefined }
    await db.putMessage({ ...shared, id: "m1", sender: "user", content: "اعرض لي صوراً", createdAt: now })
    await db.putMessage({ ...shared, id: "m2", sender: "assistant", content, createdAt: now + 1 })
    return { id }
  })

  await page.goto(`${base}/chat/${report.seed.id}`, { waitUntil: "load", timeout: 25000 }).catch(() => {})
  await page.waitForTimeout(2200)

  report.images = await page.evaluate(() => {
    const message = document.querySelector('[data-slot="message"]')
    const messageWidth = message ? Math.round(message.getBoundingClientRect().width) : 0
    return Array.from(document.querySelectorAll('[data-slot="message"] img')).map((img) => {
      const rect = img.getBoundingClientRect()
      return {
        slot: img.getAttribute("data-slot") || "media-card-image",
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        messageWidth,
        overflowsMessage: messageWidth > 0 && rect.width > messageWidth + 1,
        viewportOverflow: Math.round(rect.width) > window.innerWidth,
      }
    })
  })

  report.checks.cards = await page.locator("[data-media-card]").count()
  report.checks.sourceStyle = await page.evaluate(() => {
    const card = document.querySelector("a[data-media-card]")
    const snippet = card?.querySelector("span.line-clamp-2")
    if (!snippet) return null
    const style = getComputedStyle(snippet)
    return { color: style.color, decoration: style.textDecorationLine }
  })
  report.checks.brokenFallback = await page.locator("text=صورة غير متاحة").count()
  await page.screenshot({ path: "artifacts/chat-mobile.png" })

  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
  await page.screenshot({ path: "artifacts/chat-mobile.png" })
  await page.locator('[data-media-card] button').first().click()
  await page.waitForTimeout(600)
  report.checks.lightboxOpened = await page.getByRole("dialog").count()
  await page.screenshot({ path: "artifacts/chat-lightbox.png" })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
  report.checks.lightboxClosed = await page.getByRole("dialog").count()

  const sidebarState = () =>
    page.evaluate(() => {
      const element = document.getElementById("app-sidebar")
      const rect = element.getBoundingClientRect()
      return {
        hidden: element.getAttribute("aria-hidden"),
        inert: element.hasAttribute("inert"),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
        viewport: window.innerWidth,
      }
    })

  report.checks.sidebarClosedByDefault = await sidebarState()
  await page.getByRole("button", { name: /القائمة|Menu/ }).first().click()
  await page.waitForTimeout(450)
  report.checks.sidebarOpen = await sidebarState()
  await page.screenshot({ path: "artifacts/sidebar-open-mobile.png" })
  await page.keyboard.press("Escape")
  await page.waitForTimeout(400)
  report.checks.sidebarAfterEscape = await sidebarState()
  await page.getByRole("button", { name: /القائمة|Menu/ }).first().click()
  await page.waitForTimeout(350)
  await page.mouse.click(360, 760)
  await page.waitForTimeout(400)
  report.checks.sidebarAfterBackdrop = await sidebarState()

  for (const width of widths) {
    const widthContext = await browser.newContext({ viewport: { width, height: 844 }, locale: "ar" })
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

  const narrowContext = await browser.newContext({ viewport: { width: 320, height: 720 }, locale: "ar", deviceScaleFactor: 2 })
  const narrowPage = await narrowContext.newPage()
  await narrowPage.goto(`${base}/models`, { waitUntil: "domcontentloaded" })
  await narrowPage.waitForTimeout(900)
  await narrowPage.screenshot({ path: "artifacts/models-320.png" })
  await narrowContext.close().catch(() => {})
  report.fatal = null
} catch (error) {
  report.fatal = String(error).slice(0, 400)
} finally {
  fs.writeFileSync("artifacts/audit-mobile.json", JSON.stringify(report, null, 2))
  await browser.close().catch(() => {})
}

const failures = report.sweep.filter((entry) => entry.offenderCount > 0 || entry.scrollWidth > entry.viewport)
console.log(JSON.stringify({ fatal: report.fatal, seed: report.seed, checks: report.checks, images: report.images, sweepCount: report.sweep.length, failures, errors: report.errors.slice(0, 10) }, null, 1))
