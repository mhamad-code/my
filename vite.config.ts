import { copyFile } from "node:fs/promises"
import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

/**
 * GitHub Pages has no rewrite rules, so a deep link such as /login is answered
 * with 404.html. Shipping a copy of index.html as 404.html lets the SPA boot and
 * resolve the route itself. Vite's own build output stays untouched.
 */
function spaFallback(): Plugin {
  const outDir = path.resolve(import.meta.dirname, "dist")
  return {
    name: "spa-fallback-404",
    apply: "build",
    async closeBundle() {
      await copyFile(path.join(outDir, "index.html"), path.join(outDir, "404.html"))
    },
  }
}

// Project sites are served from https://<owner>.github.io/<repo>/, so the CI
// build sets VITE_BASE=/<repo>/. Local dev and root deployments keep "/".
const base = process.env.VITE_BASE ?? "/"

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), spaFallback()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
