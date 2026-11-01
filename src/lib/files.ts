import { db, putFile } from "@/lib/db"
import type { LibraryFileRecord } from "@/lib/types"

export const MAX_FILE_BYTES = 25 * 1024 * 1024
export const MAX_INLINE_TEXT = 120_000

const TEXT_EXTENSIONS = [
  "txt", "md", "markdown", "json", "csv", "tsv", "log", "xml", "yaml", "yml",
  "html", "css", "js", "jsx", "ts", "tsx", "py", "rs", "go", "java", "c", "h",
  "cpp", "sh", "sql", "toml", "ini", "env", "svg",
]

export function fileExtension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? ""
}

export function isTextFile(file: { name: string; mimeType: string }): boolean {
  if (file.mimeType.startsWith("text/")) return true
  if (["application/json", "application/xml", "application/javascript"].includes(file.mimeType)) return true
  return TEXT_EXTENSIONS.includes(fileExtension(file.name))
}

export function isPreviewableImage(mimeType: string): boolean {
  return /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/.test(mimeType)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

async function opfsRoot() {
  if (!navigator.storage?.getDirectory) return null
  try {
    return await navigator.storage.getDirectory()
  } catch {
    return null
  }
}

async function writeOpfs(id: string, blob: Blob): Promise<boolean> {
  const root = await opfsRoot()
  if (!root) return false
  try {
    const directory = await root.getDirectoryHandle("ai-platform-files", { create: true })
    const handle = await directory.getFileHandle(id, { create: true })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return true
  } catch {
    return false
  }
}

async function readOpfs(id: string): Promise<Blob | null> {
  const root = await opfsRoot()
  if (!root) return null
  try {
    const directory = await root.getDirectoryHandle("ai-platform-files")
    const handle = await directory.getFileHandle(id)
    return await handle.getFile()
  } catch {
    return null
  }
}

export async function readFileText(file: Blob): Promise<string> {
  const text = await file.text()
  return text.length > MAX_INLINE_TEXT ? `${text.slice(0, MAX_INLINE_TEXT)}\n…[truncated]` : text
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"))
    reader.readAsDataURL(blob)
  })
}

export async function saveLibraryFile(
  userId: string,
  file: File,
  folder = "Uploads"
): Promise<LibraryFileRecord> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`“${file.name}” is larger than the 25 MB local limit.`)
  }
  const id = crypto.randomUUID()
  // Large binaries go to OPFS, everything else stays in IndexedDB.
  const useOpfs = file.size > 1024 * 1024 && (await writeOpfs(id, file))
  const record: LibraryFileRecord = {
    id,
    userId,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    storage: useOpfs ? "opfs" : "dexie",
    blob: useOpfs ? undefined : file,
    folder,
    createdAt: Date.now(),
  }
  await putFile(record)
  return record
}

export async function getFileBlob(record: LibraryFileRecord): Promise<Blob | null> {
  if (record.storage === "opfs") return readOpfs(record.id)
  return record.blob ?? (await db.files.get(record.id))?.blob ?? null
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadJson(value: unknown, filename: string) {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }), filename)
}

export async function fileToAttachment(record: LibraryFileRecord) {
  const blob = await getFileBlob(record)
  const url = blob ? await blobToDataUrl(blob) : ""
  return {
    id: record.id,
    name: record.name,
    mimeType: record.mimeType,
    size: record.size,
    url,
  }
}
