/**
 * Text-to-speech through the browser's own Web Speech API. No paid service and
 * no API key is used. Voices depend on the operating system and browser.
 */

export type TtsState = "idle" | "speaking" | "paused"

export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

export function listVoices(): SpeechSynthesisVoice[] {
  if (!ttsSupported()) return []
  return window.speechSynthesis.getVoices()
}

export function onVoicesChanged(callback: () => void): () => void {
  if (!ttsSupported()) return () => {}
  window.speechSynthesis.addEventListener("voiceschanged", callback)
  return () => window.speechSynthesis.removeEventListener("voiceschanged", callback)
}

/** Best voice for a language tag, preferring an exact locale match. */
export function pickVoice(language: string, preferredUri?: string): SpeechSynthesisVoice | undefined {
  const voices = listVoices()
  if (preferredUri) {
    const preferred = voices.find((voice) => voice.voiceURI === preferredUri)
    if (preferred) return preferred
  }
  const prefix = language.split("-")[0]
  return (
    voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase()) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix))
  )
}

export function stripMarkdownForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " code block ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~>#]/g, "")
    .replace(/\|/g, " ")
}

export function speak(
  text: string,
  options: {
    language: string
    voiceUri?: string
    rate?: number
    onStateChange?: (state: TtsState) => void
    onEnd?: () => void
  }
) {
  if (!ttsSupported()) throw new Error("This browser does not support speech synthesis.")
  cancel()
  const utterance = new SpeechSynthesisUtterance(stripMarkdownForSpeech(text).slice(0, 30_000))
  const voice = pickVoice(options.language, options.voiceUri)
  if (voice) utterance.voice = voice
  utterance.lang = voice?.lang ?? options.language
  utterance.rate = options.rate ?? 1
  utterance.onstart = () => options.onStateChange?.("speaking")
  utterance.onpause = () => options.onStateChange?.("paused")
  utterance.onresume = () => options.onStateChange?.("speaking")
  utterance.onend = () => {
    options.onStateChange?.("idle")
    options.onEnd?.()
  }
  utterance.onerror = () => {
    options.onStateChange?.("idle")
  }
  window.speechSynthesis.speak(utterance)
}

export function pause() {
  if (ttsSupported()) window.speechSynthesis.pause()
}

export function resume() {
  if (ttsSupported()) window.speechSynthesis.resume()
}

export function cancel() {
  if (!ttsSupported()) return
  window.speechSynthesis.cancel()
}

export function isSpeaking(): boolean {
  return ttsSupported() && window.speechSynthesis.speaking && !window.speechSynthesis.paused
}
