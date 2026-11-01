import { chromium } from "playwright"
const base = "http://localhost:3000"
const routes = ["/", "/chat", "/models", "/providers", "/projects", "/library", "/images", "/search", "/integrations", "/settings", "/account", "/login", "/register"]
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar" })
const page = await context.newPage()
const result = []
for (const route of routes) {
  try {
    await page.goto(base + route, { waitUntil: "domcontentloaded", timeout: 15000 })
    await page.waitForTimeout(450)
    result.push(await page.evaluate((name) => {
      const h1 = document.querySelector("h1")
      const text = document.body.innerText.trim()
      return { route: name, textLength: text.length, heading: h1?.textContent?.slice(0, 40) ?? null, crashed: text.includes("could not be rendered") }
    }, route))
  } catch (error) {
    result.push({ route, error: String(error).slice(0, 120) })
  }
}
console.log(JSON.stringify(result))
await browser.close()
