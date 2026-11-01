import { chromium } from "playwright"
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar", deviceScaleFactor: 2 })
const page = await context.newPage()
await page.goto("http://localhost:3000/models", { waitUntil: "domcontentloaded" })
await page.waitForTimeout(1500)
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(1200)
const info = await page.evaluate(() => {
  const h1 = document.querySelector("h1")
  const style = h1 ? getComputedStyle(h1) : null
  return {
    fontStatus: document.fonts.status,
    geistLoaded: document.fonts.check('16px "Geist Variable"'),
    h1Text: h1?.textContent,
    color: style?.color,
    fontFamily: style?.fontFamily,
    fontSize: style?.fontSize,
    opacity: style?.opacity,
    visibility: style?.visibility,
    bodyText: document.body.innerText.slice(0, 160),
    sheets: document.styleSheets.length,
  }
})
console.log(JSON.stringify(info, null, 1))
await page.screenshot({ path: "artifacts/diag-models.png" })
await browser.close()
