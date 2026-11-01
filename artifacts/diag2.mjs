import { chromium } from "playwright"
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const page = await context.newPage()
page.on("requestfailed", (r) => console.log("REQFAIL", r.url().slice(-60), r.failure()?.errorText))
await page.goto("http://localhost:3000/models", { waitUntil: "load" })
await page.waitForTimeout(2500)
const info = await page.evaluate(() => {
  const body = document.body
  const style = getComputedStyle(body)
  const h1 = document.querySelector("h1")
  const rect = h1?.getBoundingClientRect()
  return {
    textContentLength: body.textContent.length,
    innerTextLength: body.innerText.length,
    bodyDisplay: style.display,
    bodyVisibility: style.visibility,
    bodyFontSize: style.fontSize,
    rootRect: document.getElementById("root").getBoundingClientRect().toJSON(),
    h1Rects: h1?.getClientRects().length,
    h1Rect: rect ? { w: Math.round(rect.width), h: Math.round(rect.height) } : null,
    fontFaces: Array.from(document.fonts).map((f) => `${f.family}:${f.status}`),
    fontResources: performance.getEntriesByType("resource").filter((e) => /woff|font|ttf/i.test(e.name)).map((e) => `${e.name.split("/").pop()}:${e.transferSize}`),
  }
})
console.log(JSON.stringify(info, null, 1))
await page.screenshot({ path: "artifacts/diag2.png" })
await browser.close()
