/**
 * Inline tokens for rich blocks inside an answer.
 *
 * The message components render markdown, and the only sanctioned way to put a
 * React component inside that markdown is a `patternHandlers` entry — it gets
 * the paragraph's text and may return a node. So a rich block travels as plain
 * paragraph text shaped `[[kind:base64url-json]]`: base64url never contains
 * `]`, `|` or whitespace, which keeps it safe for markdown and for the regex.
 *
 * Nothing here touches the DOM; both the producer (search) and the renderer
 * (chat/media) use these helpers.
 */

export type TokenKind = "img" | "src"

/** No `g` flag: the markdown renderer compiles its own global copy. */
export const TOKEN_PATTERN = /\[\[(img|src):([A-Za-z0-9_-]+)\]\]/

export function encodeToken(kind: TokenKind, payload: Record<string, unknown>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(payload))
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const base64 = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
  return `[[${kind}:${base64}]]`
}

/** Returns the decoded object, or null when the token is malformed. */
export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    let base64 = token.replace(/-/g, "+").replace(/_/g, "/")
    while (base64.length % 4 !== 0) base64 += "="
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}
