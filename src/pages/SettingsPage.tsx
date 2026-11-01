import { Download, HardDrive, Languages, Shield, Trash2, Upload, Wrench } from "lucide-react"
import * as React from "react"
import { useTheme } from "next-themes"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { PageBody, PageHeader } from "@/components/platform/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  createBackup,
  importBackup,
  validateBackup,
} from "@/lib/backup"
import { storageEstimate, wipeUserData } from "@/lib/db"
import { downloadJson, formatBytes } from "@/lib/files"
import { toolRegistryForDisplay } from "@/platform/tools"
import { usePlatform } from "@/store/platform"
import { useSession } from "@/store/session"
import { useT } from "@/i18n"

export default function SettingsPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const settings = usePlatform((state) => state.settings)
  const patchSettings = usePlatform((state) => state.patchSettings)
  const load = usePlatform((state) => state.load)
  const { setTheme } = useTheme()

  const [includeKeys, setIncludeKeys] = React.useState(false)
  const [includeFiles, setIncludeFiles] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [estimate, setEstimate] = React.useState<{ usage: number; quota: number } | null>(null)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    void storageEstimate().then(setEstimate)
  }, [settings])

  if (!settings || !user) {
    return <div className="grid flex-1 place-items-center text-[12px] text-muted-foreground">…</div>
  }

  const exportBackup = async () => {
    setBusy(true)
    try {
      const payload = await createBackup(user.uid, settings, { includeKeys, includeFiles })
      downloadJson(payload, `ai-platform-backup-${new Date().toISOString().slice(0, 10)}.json`)
      toast.success("Backup exported")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.")
    } finally {
      setBusy(false)
    }
  }

  const importFromFile = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const text = await file.text()
      const payload = validateBackup(JSON.parse(text))
      const result = await importBackup(payload, user.uid, { includeKeys })
      await load(user.uid)
      toast.success(
        `Imported ${result.conversations} chats, ${result.messages} messages, ${result.projects} projects.`
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed.")
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  const tools = toolRegistryForDisplay(settings)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("settings.title")} description={t("app.localFirst")} />
      <PageBody>
        <Tabs defaultValue="appearance" className="gap-4">
          <TabsList className="h-8 w-full justify-start overflow-x-auto">
            <TabsTrigger value="appearance" className="text-[11.5px]">
              {t("settings.appearance")}
            </TabsTrigger>
            <TabsTrigger value="chat" className="text-[11.5px]">
              {t("settings.chat")}
            </TabsTrigger>
            <TabsTrigger value="search" className="text-[11.5px]">
              {t("nav.search")}
            </TabsTrigger>
            <TabsTrigger value="privacy" className="text-[11.5px]">
              {t("settings.privacy")}
            </TabsTrigger>
            <TabsTrigger value="storage" className="text-[11.5px]">
              {t("settings.storage")}
            </TabsTrigger>
            <TabsTrigger value="backup" className="text-[11.5px]">
              {t("settings.backup")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="text-[13px] font-medium">{t("settings.appearance")}</h2>
              <p className="mb-3 text-[11.5px] text-muted-foreground">
                Platform chrome follows this theme. Chat components keep their own design and use the
                same semantic tokens.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["light", "dark", "system"] as const).map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={settings.theme === value ? "default" : "outline"}
                    className="h-8 text-[12px]"
                    onClick={() => {
                      void patchSettings({ theme: value })
                      setTheme(value)
                    }}
                  >
                    {t(value === "light" ? "common.light" : value === "dark" ? "common.dark" : "common.system")}
                  </Button>
                ))}
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-medium">
                <Languages className="size-3.5" />
                {t("settings.language")}
              </h2>
              <Select
                value={settings.language}
                onValueChange={(value) => void patchSettings({ language: value as "en" | "ar" })}
              >
                <SelectTrigger className="h-8 w-52 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en" className="text-[12px]">
                    {t("common.english")}
                  </SelectItem>
                  <SelectItem value="ar" className="text-[12px]">
                    {t("common.arabic")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Arabic switches the whole application to RTL; the chat transcript follows the document
                direction.
              </p>
            </section>
          </TabsContent>

          <TabsContent value="chat" className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="text-[13px] font-medium">{t("settings.chat")}</h2>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-[12px]">{t("settings.reasoning")}</Label>
                    <p className="text-[11px] text-muted-foreground">{t("settings.reasoningHint")}</p>
                  </div>
                  <Select
                    value={settings.reasoningMode}
                    onValueChange={(value) =>
                      void patchSettings({ reasoningMode: value as "fast" | "balanced" | "advanced" })
                    }
                  >
                    <SelectTrigger className="h-8 w-32 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fast" className="text-[12px]">
                        Fast
                      </SelectItem>
                      <SelectItem value="balanced" className="text-[12px]">
                        Balanced
                      </SelectItem>
                      <SelectItem value="advanced" className="text-[12px]">
                        Advanced
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-[12px]">{t("settings.requireConsent")}</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Read-only tools run without a prompt; tools that change data are refused until you
                      build a confirmation flow for them.
                    </p>
                  </div>
                  <Switch
                    checked={settings.requireToolConsent}
                    onCheckedChange={(checked) => void patchSettings({ requireToolConsent: checked })}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-[12px]">{t("settings.sendFiles")}</Label>
                    <p className="text-[11px] text-muted-foreground">{t("chat.attachNote")}</p>
                  </div>
                  <Switch
                    checked={settings.sendFilesToProvider}
                    onCheckedChange={(checked) => void patchSettings({ sendFilesToProvider: checked })}
                  />
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <Label className="text-[12px]">Global custom instructions</Label>
                  <Textarea
                    value={settings.systemInstructions}
                    onChange={(event) => void patchSettings({ systemInstructions: event.target.value })}
                    placeholder="Answer with short paragraphs and cite sources."
                    className="min-h-20 text-[12px]"
                  />
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="text-[13px] font-medium">{t("settings.searchProvider")}</h2>
              <div className="mt-3 space-y-3">
                <Select
                  value={settings.searchProvider}
                  onValueChange={(value) =>
                    void patchSettings({
                      searchProvider: value as typeof settings.searchProvider,
                    })
                  }
                >
                  <SelectTrigger className="h-8 w-56 text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wikimedia" className="text-[12px]">
                      Wikipedia / Wikimedia (no key)
                    </SelectItem>
                    <SelectItem value="tavily" className="text-[12px]">
                      Tavily
                    </SelectItem>
                    <SelectItem value="brave" className="text-[12px]">
                      Brave Search
                    </SelectItem>
                    <SelectItem value="serper" className="text-[12px]">
                      Serper
                    </SelectItem>
                    <SelectItem value="none" className="text-[12px]">
                      {t("common.none")}
                    </SelectItem>
                  </SelectContent>
                </Select>

                {settings.searchProvider !== "wikimedia" && settings.searchProvider !== "none" ? (
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">{t("settings.searchKey")}</Label>
                    <Input
                      type="password"
                      value={settings.searchApiKey ?? ""}
                      onChange={(event) => void patchSettings({ searchApiKey: event.target.value })}
                      placeholder="API key"
                      className="h-8 font-mono text-[12px]"
                      autoComplete="off"
                    />
                    <p className="text-[10.5px] text-muted-foreground">
                      Third-party search APIs may block browser requests with CORS. When they do, the
                      error is shown instead of fake results.
                    </p>
                  </div>
                ) : null}

                <Separator />

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="text-[12px]">{t("settings.imageSearch")}</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Lets the assistant call Wikipedia/Wikimedia image search and cite real pages.
                    </p>
                  </div>
                  <Switch
                    checked={settings.imageSearchEnabled}
                    onCheckedChange={(checked) => void patchSettings({ imageSearchEnabled: checked })}
                  />
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="privacy" className="space-y-4">
            <Alert>
              <Shield className="size-4" />
              <AlertTitle className="text-[12.5px]">{t("app.localFirst")}</AlertTitle>
              <AlertDescription className="text-[11.5px] leading-relaxed">
                Conversations, messages, files, projects, images, model settings and API keys live in
                this browser only. Firebase Authentication, when configured, is used exclusively for
                sign-in; no conversation content is written to Firebase.
              </AlertDescription>
            </Alert>

            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-3 flex items-center gap-1.5 text-[13px] font-medium">
                <Wrench className="size-3.5" />
                Tool Registry
              </h2>
              <div className="space-y-2.5">
                {tools.map((tool) => (
                  <div key={tool.name} className="rounded-md border p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-[11.5px] font-medium">{tool.name}</code>
                      <Badge variant={tool.enabled ? "secondary" : "outline"} className="h-5 text-[10px]">
                        {tool.enabled ? t("common.enabled") : t("common.disabled")}
                      </Badge>
                      {tool.permissions.map((permission) => (
                        <Badge key={permission} variant="outline" className="h-5 text-[10px]">
                          {permission}
                        </Badge>
                      ))}
                      <Badge variant="outline" className="h-5 text-[10px]">
                        {tool.requiresConfirmation ? "confirmation required" : "no confirmation"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {tool.description}
                    </p>
                    {!tool.enabled && tool.reason ? (
                      <p className="mt-1 text-[10.5px] text-amber-600 dark:text-amber-400">{tool.reason}</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="storage" className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-medium">
                <HardDrive className="size-3.5" />
                {t("settings.storage")}
              </h2>
              {estimate ? (
                <div className="space-y-1 text-[12px]">
                  <p>
                    {t("settings.storageUsed")}: <strong>{formatBytes(estimate.usage)}</strong>
                  </p>
                  <p className="text-muted-foreground">
                    {t("settings.storageQuota")}: {formatBytes(estimate.quota)}
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${Math.min(100, Math.round((estimate.usage / Math.max(estimate.quota, 1)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  This browser does not expose a storage estimate.
                </p>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Clearing browser data or losing this device deletes everything below unless you have a
                backup. Large files are stored in OPFS when the browser supports it, other records in
                IndexedDB.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-8 gap-1.5 text-[12px]"
                onClick={() => void storageEstimate().then(setEstimate)}
              >
                {t("common.refresh")}
              </Button>
            </section>

            <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <h2 className="text-[13px] font-medium text-destructive">{t("settings.deleteAll")}</h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                {t("settings.deleteAllWarning")}
              </p>
              <Button
                variant="destructive"
                size="sm"
                className="mt-3 h-8 gap-1.5 text-[12px]"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="size-3.5" />
                {t("settings.deleteAll")}
              </Button>
            </section>
          </TabsContent>

          <TabsContent value="backup" className="space-y-4">
            <section className="rounded-lg border bg-card p-4">
              <h2 className="mb-2 text-[13px] font-medium">{t("settings.export")}</h2>
              <div className="space-y-2.5">
                <label className="flex items-center justify-between gap-4 text-[12px]">
                  <span>
                    {t("settings.includeKeys")}
                    <span className="block text-[10.5px] text-muted-foreground">
                      {t("settings.includeKeysWarning")}
                    </span>
                  </span>
                  <Switch checked={includeKeys} onCheckedChange={setIncludeKeys} />
                </label>
                <label className="flex items-center justify-between gap-4 text-[12px]">
                  <span>Include library files (base64)</span>
                  <Switch checked={includeFiles} onCheckedChange={setIncludeFiles} />
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" className="h-8 gap-1.5" disabled={busy} onClick={() => void exportBackup()}>
                    <Download className="size-3.5" />
                    {t("settings.export")}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json"
                    className="sr-only"
                    onChange={(event) => void importFromFile(event.target.files?.[0])}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="size-3.5" />
                    {t("settings.import")}
                  </Button>
                </div>
              </div>
            </section>
            <p className="text-[11px] text-muted-foreground">
              Backups are plain JSON. Import merges into the signed-in profile and keeps other profiles
              untouched.
            </p>
          </TabsContent>
        </Tabs>
      </PageBody>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.deleteAll")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px]">
              {t("settings.deleteAllWarning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void wipeUserData(user.uid).then(async () => {
                  await load(user.uid)
                  toast.success(t("settings.resetDone"))
                  navigate("/")
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
