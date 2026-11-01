import {
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldAlert,
  TriangleAlert,
  XCircle,
} from "lucide-react"
import * as React from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { PageBody, PageHeader } from "@/components/platform/PageHeader"
import { ProviderLogo } from "@/components/platform/ProviderLogo"
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
import { PROVIDERS, type ProviderDefinition } from "@/platform/providers"
import { usePlatform } from "@/store/platform"
import { useT } from "@/i18n"
import { cn } from "@/lib/utils"

export default function ProvidersPage() {
  const { t } = useT()
  const keys = usePlatform((state) => state.keys)
  const saveProviderKey = usePlatform((state) => state.saveProviderKey)
  const removeProviderKey = usePlatform((state) => state.removeProviderKey)
  const refreshModels = usePlatform((state) => state.refreshModels)
  const [selected, setSelected] = React.useState<ProviderDefinition | null>(null)
  const [apiKey, setApiKey] = React.useState("")
  const [endpoint, setEndpoint] = React.useState("")
  const [apiVersion, setApiVersion] = React.useState("")
  const [manualModel, setManualModel] = React.useState("")
  const [reveal, setReveal] = React.useState(false)
  const [testing, setTesting] = React.useState(false)
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [removeTarget, setRemoveTarget] = React.useState<ProviderDefinition | null>(null)

  const openProvider = (provider: ProviderDefinition) => {
    const record = keys.find((key) => key.providerId === provider.id)
    setSelected(provider)
    setApiKey(record?.apiKey ?? "")
    setEndpoint(record?.endpoint ?? "")
    setApiVersion(record?.apiVersion ?? "2024-10-21")
    setManualModel(record?.modelId ?? "")
    setResult(null)
    setReveal(false)
  }

  const close = () => {
    setSelected(null)
    setApiKey("")
    setResult(null)
  }

  const submit = async () => {
    if (!selected) return
    setTesting(true)
    setResult(null)
    try {
      const outcome = await saveProviderKey(selected.id, apiKey.trim(), {
        endpoint: endpoint.trim() || undefined,
        apiVersion: apiVersion.trim() || undefined,
        model: manualModel.trim() || undefined,
      })
      setResult({ ok: outcome.ok, message: outcome.message })
      if (outcome.ok) {
        toast.success(outcome.message)
        await refreshModels(selected.id, { quiet: true })
      } else {
        toast.error(outcome.message)
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("providers.title")}
        description={t("providers.subtitle")}
        actions={
          <Button asChild variant="outline" size="sm" className="h-8 gap-1 text-[12px]">
            <Link to="/models">
              {t("nav.models")}
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        }
      />
      <PageBody>
        <Alert className="mb-4 border-amber-500/40 bg-amber-500/5">
          <ShieldAlert className="size-4" />
          <AlertTitle className="text-[12.5px]">{t("providers.key")}</AlertTitle>
          <AlertDescription className="text-[12px] leading-relaxed">
            {t("providers.keyWarning")}
          </AlertDescription>
        </Alert>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PROVIDERS.map((provider) => {
            const record = keys.find((key) => key.providerId === provider.id)
            const status = record?.status
            return (
              <div
                key={provider.id}
                className="flex flex-col gap-3 rounded-lg border bg-card p-3.5 shadow-xs"
              >
                <div className="flex items-start gap-3">
                  <ProviderLogo name={provider.name} slug={provider.logSlug} accent={provider.accent} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate text-[13.5px] font-medium">{provider.name}</h3>
                      {status === "verified" ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />
                      ) : status === "failed" ? (
                        <XCircle className="size-3.5 shrink-0 text-destructive" />
                      ) : null}
                    </div>
                    <p className="truncate text-[11.5px] text-muted-foreground">{provider.tagline}</p>
                  </div>
                  <Badge
                    variant={status === "verified" ? "secondary" : "outline"}
                    className={cn(
                      "h-5 shrink-0 text-[10px]",
                      status === "failed" && "border-destructive/40 text-destructive"
                    )}
                  >
                    {provider.requiresProxy
                      ? t("integration.requiresBackend")
                      : status === "verified"
                        ? t("providers.connected")
                        : status === "failed"
                          ? t("providers.failed")
                          : t("providers.notConnected")}
                  </Badge>
                </div>

                <p className="line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                  {provider.description}
                </p>

                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                  <span>
                    {record?.modelsCount !== undefined
                      ? `${record.modelsCount} ${t("providers.models")}`
                      : provider.supportsModelDiscovery
                        ? "—"
                        : t("models.manual")}
                  </span>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11.5px]"
                      onClick={() => openProvider(provider)}
                      disabled={provider.requiresProxy}
                    >
                      {provider.requiresProxy
                        ? t("integration.requiresBackend")
                        : record
                          ? t("common.manage")
                          : t("common.connect")}
                    </Button>
                    {record ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-[11.5px] text-destructive hover:text-destructive"
                        onClick={() => setRemoveTarget(provider)}
                      >
                        {t("providers.remove")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </PageBody>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => (!open ? close() : undefined)}>
        <DialogContent className="max-w-lg">
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-[15px]">
                  <ProviderLogo
                    name={selected.name}
                    slug={selected.logSlug}
                    accent={selected.accent}
                    className="size-7"
                  />
                  {selected.name}
                </DialogTitle>
                <DialogDescription className="text-[12px] leading-relaxed">
                  {selected.description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="provider-key" className="text-[12px]">
                    {t("providers.key")}
                  </Label>
                  <div className="flex gap-1.5">
                    <Input
                      id="provider-key"
                      type={reveal ? "text" : "password"}
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      placeholder={selected.apiKeyHint ?? "sk-…"}
                      autoComplete="off"
                      spellCheck={false}
                      className="font-mono text-[12px]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-9 shrink-0"
                      aria-label={reveal ? t("providers.hide") : t("providers.show")}
                      onClick={() => setReveal((value) => !value)}
                    >
                      {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                  {selected.keyUrl ? (
                    <a
                      href={selected.keyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                    >
                      {t("providers.addKey")}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>

                {selected.extraFields?.includes("endpoint") ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="provider-endpoint" className="text-[12px]">
                      {t("providers.endpoint")}
                    </Label>
                    <Input
                      id="provider-endpoint"
                      value={endpoint}
                      onChange={(event) => setEndpoint(event.target.value)}
                      placeholder="https://resource.openai.azure.com/openai/deployments/my-deployment"
                      className="font-mono text-[12px]"
                    />
                  </div>
                ) : null}

                {selected.extraFields?.includes("apiVersion") ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="provider-version" className="text-[12px]">
                      {t("providers.apiVersion")}
                    </Label>
                    <Input
                      id="provider-version"
                      value={apiVersion}
                      onChange={(event) => setApiVersion(event.target.value)}
                      placeholder="2024-10-21"
                      className="font-mono text-[12px]"
                    />
                  </div>
                ) : null}

                {!selected.supportsModelDiscovery ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="provider-model" className="text-[12px]">
                      {t("models.manual")}
                    </Label>
                    <Input
                      id="provider-model"
                      value={manualModel}
                      onChange={(event) => setManualModel(event.target.value)}
                      placeholder="model-id"
                      className="font-mono text-[12px]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {t("providers.test")} uses this id for a one-token request.
                    </p>
                  </div>
                ) : null}

                {selected.notes?.length ? (
                  <ul className="space-y-1 rounded-md border bg-muted/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
                    {selected.notes.map((note) => (
                      <li key={note}>• {note}</li>
                    ))}
                  </ul>
                ) : null}

                {result ? (
                  <div
                    className={cn(
                      "flex items-start gap-2 rounded-md border px-2.5 py-2 text-[11.5px] leading-relaxed",
                      result.ok
                        ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                        : "border-destructive/40 bg-destructive/5 text-destructive"
                    )}
                  >
                    {result.ok ? (
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                    ) : (
                      <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    )}
                    <span>{result.message}</span>
                  </div>
                ) : null}

                <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                  {t("providers.keyWarning")}
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={close} disabled={testing}>
                  {t("common.cancel")}
                </Button>
                <Button size="sm" className="gap-1.5" onClick={() => void submit()} disabled={testing || !apiKey.trim()}>
                  {testing ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
                  {testing ? t("providers.testing") : t("providers.test")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => (!open ? setRemoveTarget(null) : undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("providers.remove")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[12.5px]">
              {removeTarget?.name} — this deletes the key from this browser and clears its cached
              model list. Conversations are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!removeTarget) return
                void removeProviderKey(removeTarget.id).then(() => {
                  toast.success("API key removed")
                  setRemoveTarget(null)
                  close()
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
