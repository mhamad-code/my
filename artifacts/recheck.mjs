import { chromium } from "playwright"
const base = "http://localhost:3000"
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar", deviceScaleFactor: 2 })
const page = await context.newPage()
await page.goto(base + "/", { waitUntil: "domcontentloaded" })
await page.waitForTimeout(1500)
await page.evaluate(async () => {
  const db = await import("/src/lib/db.ts")
  const session = await import("/src/store/session.ts")
  const tokens = await import("/src/lib/tokens.ts")
  const user = session.useSession.getState().user
  const now = Date.now()
  const id = "media-fixture"
  await db.putConversation({ id, userId: user.uid, title: "Images and sources", modelId: "gpt-4o-mini", providerId: "openai", mode: "chat", temporary: false, pinned: false, sortIndex: now, createdAt: now, updatedAt: now })
  const img = (p) => tokens.encodeToken("img", p)
  const src = (p) => tokens.encodeToken("src", p)
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
})
await page.goto(base + "/chat/media-fixture", { waitUntil: "load" })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(1500)
const styles = await page.evaluate(() => {
  const anchor = document.querySelector("a[data-media-card]")
  const muted = anchor?.querySelector("[data-media-muted]")
  const link = document.querySelector('[data-slot="message-markdown"] a[href^="https://github.com/some"]')
  return {
    cardAnchor: anchor ? { color: getComputedStyle(anchor).color, decoration: getComputedStyle(anchor).textDecorationLine } : null,
    muted: muted ? { color: getComputedStyle(muted).color, decoration: getComputedStyle(muted).textDecorationLine } : null,
    proseLink: link ? { color: getComputedStyle(link).color, decoration: getComputedStyle(link).textDecorationLine } : null,
  }
})
await page.screenshot({ path: "artifacts/chat-mobile-final.png" })
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
await browser.close().catch(() => {})
console.log(JSON.stringify(styles, null, 1))
