import { chromium } from "playwright"
import fs from "node:fs"

const base = "http://localhost:3000"
const out = "artifacts"
fs.mkdirSync(out, { recursive: true })

const widths = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1440]
const routes = [
  "/",
  "/chat",
  "/models",
  "/providers",
  "/projects",
  "/library",
  "/images",
  "/search",
  "/integrations",
  "/settings",
  "/account",
  "/login",
  "/register",
]

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: "ar",
  deviceScaleFactor: 2,
})
const page = await context.newPage()
const errors = []
page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`))
page.on("console", (message) => {
  if (message.type() === "error") errors.push(`console: ${message.text()}`)
})

await page.goto(`${base}/`, { waitUntil: "networkidle" })
await page.waitForTimeout(1200)

const seed = await page.evaluate(async () => {
  const db = await import("/src/lib/db.ts")
  const session = await import("/src/store/session.ts")
  const tokens = await import("/src/lib/tokens.ts")
  const user = session.useSession.getState().user
  if (!user) return { error: "no local profile" }
  const now = Date.now()
  const id = "media-fixture"
  await db.putConversation({
    id,
    userId: user.uid,
    title: "Images and sources",
    modelId: "gpt-4o-mini",
    providerId: "openai",
    mode: "chat",
    temporary: false,
    pinned: false,
    sortIndex: now,
    createdAt: now,
    updatedAt: now,
  })
  const img = (payload) => tokens.encodeToken("img", payload)
  const src = (payload) => tokens.encodeToken("src", payload)
  const content = [
    "## صور ومصادر",
    "هذه فقرة شرح عادية قبل الصور، لقياس المسافة البصرية بين النص والبطاقات.",
    img({
      src: "https://upload.wikimedia.org/wikipedia/commons/9/91/Octicons-mark-github.svg",
      title: "GitHub",
      description:
        "منصة لاستضافة المشاريع البرمجية وإدارة المستودعات والتعاون بين المطورين.",
      page: "https://github.com",
      source: "Wikimedia Commons",
    }),
    img({
      src: "https://upload.wikimedia.org/wikipedia/commons/3/35/GitLab_icon.svg",
      title: "GitLab",
      description: "منصة DevOps متكاملة لإدارة المستودعات والتكامل المستمر.",
      page: "https://about.gitlab.com",
      source: "Wikimedia Commons",
    }),
    img({
      src: "https://example.invalid/missing.png",
      title: "صورة غير متاحة",
      description: "رابط معطوب لاختبار البديل.",
      page: "https://example.com",
    }),
    "نص عادي مع [رابط خارجي طويل جداً](https://github.com/some/really/long/path/that/keeps/going/for/wrapping) داخل الإجابة.",
    src({
      index: 1,
      title: "GitHub — Wikipedia",
      url: "https://en.wikipedia.org/wiki/GitHub",
      snippet: "GitHub is a developer platform for hosting and collaborating on code.",
      source: "Wikipedia",
    }),
    src({
      index: 2,
      title: "GitLab — Wikipedia",
      url: "https://en.wikipedia.org/wiki/GitLab",
      snippet: "GitLab is a DevOps platform.",
      source: "Wikipedia",
    }),
  ].join("\n\n")
  const base = {
    userId: user.uid,
    conversationId: id,
    reasoning: null,
    tools: undefined,
    parts: undefined,
    attachments: undefined,
  }
  await db.putMessage({ ...base, id: "m1", sender: "user", content: "اعرض لي صوراً", createdAt: now })
  await db.putMessage({
    ...base,
    id: "m2",
    sender: "assistant",
    content,
    createdAt: now + 1,
  })
  return { uid: user.uid, id }
})

const report = { seed, checks: [], widths: [], errors }

// Viewer state: everything that is deliberately parked outside the viewport.
const measure = () =>
  page.evaluate(() => {
    const width = window.innerWidth
    const offenders = []
    document.querySelectorAll("body *").forEach((element) => {
      if (element.closest("#app-sidebar")) return
      if (element.getAttribute("aria-hidden") === "true") return
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      if (rect.right > width + 1 || rect.left < -1) {
        offenders.push({
          tag: element.tagName.toLowerCase(),
          slot: element.getAttribute("data-slot") || "",
          className: String(element.className).slice(0, 120),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
        })
      }
    })
    return {
      viewport: width,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      offenders: offenders.slice(0, 6),
      offenderCount: offenders.length,
    }
  })

async function visit(path, label) {
  try {
    await page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 15000 })
  } catch (error) {
    errors.push(`goto: ${path} ${String(error).slice(0, 120)}`)
    return
  }
  await page.waitForTimeout(300)
  const result = await measure()
  report.widths.push({ width: page.viewportSize().width, path, ...result })
  const crashed = await page.locator("text=This page could not be rendered.").count()
  if (crashed) errors.push(`crash: ${label} ${path}`)
}

// ---- overflow sweep at every requested width, on every route ----
for (const width of widths) {
  await page.setViewportSize({ width, height: width <= 430 ? 844 : 900 })
  for (const route of routes) await visit(route, "sweep")
}

// ---- screenshots: mobile chat, images, sidebar open ----
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(`${base}/chat/${seed.id ?? ""}`, { waitUntil: "load", timeout: 20000 }).catch(() => {})
await page.waitForTimeout(1200)
await page.screenshot({ path: `${out}/chat-mobile.png`, fullPage: false })

const cards = await page.locator("[data-media-card]").count()
const brokenFallback = await page.locator("text=صورة غير متاحة").count()
const dialogBefore = await page.getByRole("dialog").count()
await page.locator('[data-media-card] button').first().click()
await page.waitForTimeout(500)
const dialogOpen = await page.getByRole("dialog").count()
await page.screenshot({ path: `${out}/chat-lightbox.png` })
await page.keyboard.press("Escape")
await page.waitForTimeout(300)
const dialogClosed = await page.getByRole("dialog").count()

// sidebar: hidden by default, opens from the hamburger
const sidebarBefore = await page.evaluate(() => {
  const element = document.getElementById("app-sidebar")
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    hidden: element.getAttribute("aria-hidden"),
    inert: element.hasAttribute("inert"),
    left: Math.round(rect.left),
    right: Math.round(rect.right),
    width: Math.round(rect.width),
  }
})
await page.getByRole("button", { name: /القائمة|Menu/ }).first().click()
await page.waitForTimeout(450)
const sidebarOpen = await page.evaluate(() => {
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
await page.screenshot({ path: `${out}/sidebar-open-mobile.png` })
await page.keyboard.press("Escape")
await page.waitForTimeout(400)
const sidebarAfterEscape = await page.evaluate(() => {
  const element = document.getElementById("app-sidebar")
  return { hidden: element.getAttribute("aria-hidden"), inert: element.hasAttribute("inert") }
})

// outside click closes
await page.getByRole("button", { name: /القائمة|Menu/ }).first().click()
await page.waitForTimeout(350)
await page.mouse.click(360, 700)
await page.waitForTimeout(400)
const sidebarAfterBackdrop = await page.evaluate(() => {
  const element = document.getElementById("app-sidebar")
  return { hidden: element.getAttribute("aria-hidden") }
})

// desktop
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto(`${base}/chat/${seed.id ?? ""}`, { waitUntil: "load", timeout: 20000 }).catch(() => {})
await page.waitForTimeout(900)
await page.screenshot({ path: `${out}/chat-desktop.png`, fullPage: false })
const desktopOverflow = await measure()

await page.goto(`${base}/models`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/models-mobile-check.png` })

// narrow phone: models page
await page.setViewportSize({ width: 320, height: 720 })
await page.goto(`${base}/models`, { waitUntil: "domcontentloaded" })
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/models-320.png` })

report.checks.push({
  cards,
  brokenFallback,
  lightbox: { dialogBefore, dialogOpen, dialogClosed },
  sidebarBefore,
  sidebarOpen,
  sidebarAfterEscape,
  sidebarAfterBackdrop,
  desktopOverflow,
})

fs.writeFileSync(`${out}/ui-report.json`, JSON.stringify(report, null, 2))
await browser.close()
console.log(JSON.stringify(report.checks, null, 2))
console.log("routes checked:", report.widths.length)
console.log("overflow failures:", report.widths.filter((entry) => entry.offenderCount > 0).length)
for (const failure of report.widths.filter((entry) => entry.offenderCount > 0).slice(0, 12)) {
  console.log(JSON.stringify({ width: failure.width, path: failure.path, scrollWidth: failure.scrollWidth, offenders: failure.offenders }))
}
console.log("errors:", JSON.stringify(errors.slice(0, 12), null, 1))
