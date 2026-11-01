import { FolderKanban, MessageSquare, Paperclip, Pencil, Plus, Trash2 } from "lucide-react"
import * as React from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { toast } from "sonner"

import { PageBody, PageHeader } from "@/components/platform/PageHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  deleteProject,
  listConversations,
  listFiles,
  listProjects,
  putConversation,
  putFile,
  putProject,
} from "@/lib/db"
import type { ProjectRecord } from "@/lib/types"
import { getProvider } from "@/platform/providers"
import { usePlatform } from "@/store/platform"
import { useSession } from "@/store/session"
import { useT } from "@/i18n"

type Draft = {
  id?: string
  name: string
  description: string
  instructions: string
  modelId: string
}

const emptyDraft: Draft = { name: "", description: "", instructions: "", modelId: "" }

export default function ProjectsPage() {
  const { t } = useT()
  const user = useSession((state) => state.user)
  const models = usePlatform((state) => state.models)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ProjectRecord | null>(null)
  const [chatTarget, setChatTarget] = React.useState<ProjectRecord | null>(null)
  const [fileTarget, setFileTarget] = React.useState<ProjectRecord | null>(null)

  const projects = useLiveQuery(
    () => (user ? listProjects(user.uid) : Promise.resolve([])),
    [user?.uid],
    []
  )
  const conversations = useLiveQuery(
    () => (user ? listConversations(user.uid) : Promise.resolve([])),
    [user?.uid],
    []
  )
  const files = useLiveQuery(() => (user ? listFiles(user.uid) : Promise.resolve([])), [user?.uid], [])

  const save = async () => {
    if (!user || !draft) return
    if (!draft.name.trim()) {
      toast.error(t("projects.name"))
      return
    }
    const now = Date.now()
    const existing = draft.id ? projects.find((project) => project.id === draft.id) : undefined
    const record: ProjectRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      userId: user.uid,
      name: draft.name.trim(),
      description: draft.description.trim(),
      instructions: draft.instructions,
      modelId: draft.modelId || undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await putProject(record)
    setDraft(null)
    toast.success(existing ? "Project updated" : "Project created")
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("projects.title")}
        description={t("projects.subtitle")}
        actions={
          <Button size="sm" className="h-8 gap-1.5" onClick={() => setDraft({ ...emptyDraft })}>
            <Plus className="size-3.5" />
            {t("projects.new")}
          </Button>
        }
      />
      <PageBody>
        {projects.length === 0 ? (
          <div className="grid place-items-center rounded-lg border border-dashed px-6 py-16 text-center">
            <FolderKanban className="mb-3 size-6 text-muted-foreground" />
            <p className="text-[13px] text-muted-foreground">{t("projects.subtitle")}</p>
            <Button size="sm" className="mt-3 gap-1.5" onClick={() => setDraft({ ...emptyDraft })}>
              <Plus className="size-3.5" />
              {t("projects.new")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => {
              const projectChats = conversations.filter((chat) => chat.projectId === project.id)
              const projectFiles = files.filter((file) => file.projectId === project.id)
              return (
                <Card key={project.id} className="gap-3">
                  <CardHeader className="pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                          <FolderKanban className="size-3.5" />
                        </span>
                        <CardTitle className="truncate text-[13.5px]">{project.name}</CardTitle>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={t("common.rename")}
                          onClick={() =>
                            setDraft({
                              id: project.id,
                              name: project.name,
                              description: project.description,
                              instructions: project.instructions,
                              modelId: project.modelId ?? "",
                            })
                          }
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          aria-label={t("projects.delete")}
                          onClick={() => setDeleteTarget(project)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    {project.description ? (
                      <p className="line-clamp-2 text-[11.5px] text-muted-foreground">
                        {project.description}
                      </p>
                    ) : null}
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="h-5 gap-1 text-[10px]">
                        <MessageSquare className="size-2.5" />
                        {projectChats.length} {t("projects.chats")}
                      </Badge>
                      <Badge variant="outline" className="h-5 gap-1 text-[10px]">
                        <Paperclip className="size-2.5" />
                        {projectFiles.length} {t("projects.files")}
                      </Badge>
                      {project.modelId ? (
                        <Badge variant="secondary" className="h-5 max-w-[160px] truncate text-[10px]">
                          {project.modelId}
                        </Badge>
                      ) : null}
                    </div>
                    {project.instructions ? (
                      <p className="line-clamp-2 rounded-md bg-muted/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
                        {project.instructions}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11.5px]"
                        onClick={() => setChatTarget(project)}
                      >
                        <Plus className="size-3" />
                        {t("projects.chats")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11.5px]"
                        onClick={() => setFileTarget(project)}
                      >
                        <Plus className="size-3" />
                        {t("projects.files")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </PageBody>

      <Dialog open={Boolean(draft)} onOpenChange={(open) => (!open ? setDraft(null) : undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              {draft?.id ? t("common.rename") : t("projects.new")}
            </DialogTitle>
            <DialogDescription className="text-[12px]">
              {t("projects.instructionsHint")}
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[12px]">{t("projects.name")}</Label>
                <Input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  className="h-8 text-[12px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">{t("projects.description")}</Label>
                <Input
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  className="h-8 text-[12px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">{t("projects.instructions")}</Label>
                <Textarea
                  value={draft.instructions}
                  onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
                  className="min-h-24 text-[12px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">{t("projects.defaultModel")}</Label>
                <Select
                  value={draft.modelId}
                  onValueChange={(value) => setDraft({ ...draft, modelId: value })}
                >
                  <SelectTrigger className="h-8 text-[12px]">
                    <SelectValue placeholder={t("common.none")} />
                  </SelectTrigger>
                  <SelectContent>
                    {models.map((model) => (
                      <SelectItem
                        key={`${model.providerId}:${model.id}`}
                        value={`${model.providerId}:${model.id}`}
                        className="text-[12px]"
                      >
                        {model.name} · {getProvider(model.providerId)?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={() => void save()}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(chatTarget)} onOpenChange={(open) => (!open ? setChatTarget(null) : undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">{t("projects.chats")}</DialogTitle>
            <DialogDescription className="text-[12px]">
              Attach an existing chat to “{chatTarget?.name}”. Its messages stay on this device.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {conversations.filter((chat) => chat.projectId !== chatTarget?.id).length ? (
              conversations
                .filter((chat) => chat.projectId !== chatTarget?.id)
                .slice(0, 50)
                .map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-[12px] hover:bg-accent"
                    onClick={() => {
                      if (!chatTarget) return
                      void putConversation({ ...chat, projectId: chatTarget.id, updatedAt: Date.now() })
                      setChatTarget(null)
                      toast.success("Chat attached")
                    }}
                  >
                    <span className="truncate">{chat.title}</span>
                    <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))
            ) : (
              <p className="p-2 text-[12px] text-muted-foreground">{t("nav.noChats")}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(fileTarget)} onOpenChange={(open) => (!open ? setFileTarget(null) : undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">{t("projects.files")}</DialogTitle>
            <DialogDescription className="text-[12px]">
              Attach a file from your library to “{fileTarget?.name}”.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto">
            {files.filter((file) => file.projectId !== fileTarget?.id).length ? (
              files
                .filter((file) => file.projectId !== fileTarget?.id)
                .map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-start text-[12px] hover:bg-accent"
                    onClick={() => {
                      if (!fileTarget) return
                      void putFile({ ...file, projectId: fileTarget.id })
                      setFileTarget(null)
                      toast.success("File attached")
                    }}
                  >
                    <span className="truncate">{file.name}</span>
                    <Plus className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))
            ) : (
              <p className="p-2 text-[12px] text-muted-foreground">{t("common.empty")}</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => (!open ? setDeleteTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("projects.delete")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px]">
              {deleteTarget?.name} — {t("projects.deleteWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteTarget || !user) return
                void deleteProject(user.uid, deleteTarget.id).then(() => {
                  setDeleteTarget(null)
                  toast.success("Project deleted")
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
