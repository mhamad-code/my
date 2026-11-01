import { Download, Library, MessageSquarePlus, Pencil, Search, Trash2, Upload } from "lucide-react"
import * as React from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { PageHeader } from "@/components/platform/PageHeader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { FileIcon } from "@/components/ui/file-icon"
import { deleteFile, listFiles, putFile } from "@/lib/db"
import type { LibraryFileRecord } from "@/lib/types"
import {
  downloadBlob,
  formatBytes,
  getFileBlob,
  isPreviewableImage,
  isTextFile,
  readFileText,
  saveLibraryFile,
} from "@/lib/files"
import { useSession } from "@/store/session"
import { useT } from "@/i18n"
import { cn } from "@/lib/utils"

export default function LibraryPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const files = useLiveQuery(() => (user ? listFiles(user.uid) : Promise.resolve([])), [user?.uid], [])
  const [search, setSearch] = React.useState("")
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [folder, setFolder] = React.useState("Uploads")
  const [renameTarget, setRenameTarget] = React.useState<LibraryFileRecord | null>(null)
  const [renameValue, setRenameValue] = React.useState("")
  const [deleteTarget, setDeleteTarget] = React.useState<LibraryFileRecord | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [previewText, setPreviewText] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const filtered = files.filter((file) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return file.name.toLowerCase().includes(term) || file.folder.toLowerCase().includes(term)
  })
  const selected = filtered.find((file) => file.id === selectedId) ?? filtered[0] ?? null

  React.useEffect(() => {
    let url: string | null = null
    setPreviewText(null)
    setPreviewUrl(null)
    if (!selected) return
    void (async () => {
      const blob = await getFileBlob(selected)
      if (!blob) return
      if (isPreviewableImage(selected.mimeType)) {
        url = URL.createObjectURL(blob)
        setPreviewUrl(url)
      } else if (selected.mimeType === "application/pdf") {
        url = URL.createObjectURL(blob)
        setPreviewUrl(url)
      } else if (isTextFile(selected)) {
        setPreviewText(await readFileText(blob))
      }
    })()
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [selected])

  const upload = async (fileList: FileList | null) => {
    if (!user || !fileList?.length) return
    setUploading(true)
    try {
      for (const file of Array.from(fileList)) {
        await saveLibraryFile(user.uid, file, folder.trim() || "Uploads")
      }
      toast.success(`${fileList.length} file(s) stored locally`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("library.title")}
        description={t("library.subtitle")}
        actions={
          <>
            <Input
              value={folder}
              onChange={(event) => setFolder(event.target.value)}
              placeholder={t("library.folder")}
              className="h-8 w-32 text-[12px]"
            />
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(event) => void upload(event.target.files)}
            />
            <Button
              size="sm"
              className="h-8 gap-1.5"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {t("library.upload")}
            </Button>
          </>
        }
      />

      <div className="flex items-center gap-2 border-b px-4 py-2 sm:px-6">
        <Search className="size-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("common.search")}
          className="h-7 max-w-xs border-0 bg-transparent px-0 text-[12px] shadow-none focus-visible:ring-0"
        />
        <span className="ms-auto text-[11px] text-muted-foreground">
          {files.length} files · {formatBytes(files.reduce((sum, file) => sum + file.size, 0))}
        </span>
      </div>

      <div className="min-h-0 flex-1">
        {files.length === 0 ? (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              <Library className="mx-auto mb-3 size-6 text-muted-foreground" />
              <p className="text-[13px] text-muted-foreground">{t("library.subtitle")}</p>
              <Button size="sm" className="mt-3 gap-1.5" onClick={() => inputRef.current?.click()}>
                <Upload className="size-3.5" />
                {t("library.upload")}
              </Button>
            </div>
          </div>
        ) : (
          <ResizablePanelGroup orientation="horizontal" id="ai-platform-library">
            <ResizablePanel defaultSize="30" minSize="20" className="min-w-0">
              <div className="h-full overflow-y-auto p-2">
                {filtered.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    onClick={() => setSelectedId(file.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start transition-colors",
                      selected?.id === file.id ? "bg-accent" : "hover:bg-muted/60"
                    )}
                  >
                    <FileIcon path={file.name} size={16} />
                    <span className="min-w-0 flex-1 truncate text-[12px]">{file.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatBytes(file.size)}
                    </span>
                  </button>
                ))}
                {filtered.length === 0 ? (
                  <p className="p-3 text-[12px] text-muted-foreground">{t("searchPage.noResults")}</p>
                ) : null}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="70" className="min-w-0">
              <div className="flex h-full min-h-0 flex-col">
                {selected ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
                      <FileIcon path={selected.name} size={18} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">{selected.name}</p>
                        <p className="text-[10.5px] text-muted-foreground">
                          {selected.mimeType} · {formatBytes(selected.size)} · {selected.folder}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-[11.5px]"
                        onClick={() => void getFileBlob(selected).then((blob) => blob && downloadBlob(blob, selected.name))}
                      >
                        <Download className="size-3" />
                        {t("common.download")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1 text-[11.5px]"
                        onClick={() => navigate(`/chat?attach=${selected.id}`)}
                      >
                        <MessageSquarePlus className="size-3" />
                        {t("library.attach")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 p-0"
                        aria-label={t("common.rename")}
                        onClick={() => {
                          setRenameTarget(selected)
                          setRenameValue(selected.name)
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 p-0 text-destructive hover:text-destructive"
                        aria-label={t("library.delete")}
                        onClick={() => setDeleteTarget(selected)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto p-4">
                      {previewText ? (
                        <pre className="whitespace-pre-wrap break-words font-mono text-[11.5px] leading-relaxed">
                          {previewText}
                        </pre>
                      ) : previewUrl ? (
                        isPreviewableImage(selected.mimeType) ? (
                          <img
                            src={previewUrl}
                            alt={selected.name}
                            className="mx-auto max-h-full max-w-full rounded-md border object-contain"
                          />
                        ) : (
                          <iframe
                            src={previewUrl}
                            title={selected.name}
                            sandbox=""
                            className="h-full min-h-[60vh] w-full rounded-md border"
                          />
                        )
                      ) : (
                        <p className="text-[12px] text-muted-foreground">{t("library.unsupported")}</p>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="grid h-full place-items-center text-[12px] text-muted-foreground">
                    {t("common.empty")}
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => (!open ? setRenameTarget(null) : undefined)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px]">{t("common.rename")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-[12px]">{t("library.folder")}</Label>
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              className="h-8 text-[12px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameTarget(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (!renameTarget) return
                void putFile({ ...renameTarget, name: renameValue.trim() || renameTarget.name }).then(() => {
                  setRenameTarget(null)
                  toast.success("File renamed")
                })
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("library.delete")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px]">
              {deleteTarget?.name} is removed from this device. Chats that already used it keep their
              own copy of the transcript.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget || !user) return
                void deleteFile(user.uid, deleteTarget.id).then(() => {
                  setDeleteTarget(null)
                  toast.success("File deleted")
                })
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
