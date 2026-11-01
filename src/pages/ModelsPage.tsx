import {
  Check,
  Minus,
  Plus,
  RefreshCw,
  Settings2,
  Star,
  StarOff,
  Wand2,
} from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

import { PageBody, PageHeader } from "@/components/platform/PageHeader"
import { ProviderLogo } from "@/components/platform/ProviderLogo"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  CAPABILITY_LABELS,
  MODEL_CAPABILITIES,
  getProvider,
  type CapabilityState,
  type ModelCapability,
  type ModelInfo,
} from "@/platform/providers"
import type { ModelSettings } from "@/lib/types"
import { usePlatform } from "@/store/platform"
import { useT } from "@/i18n"
import { cn } from "@/lib/utils"

type SortKey = "newest" | "cheapest" | "context" | "name"

const capabilityStateStyles: Record<CapabilityState, string> = {
  supported: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  unsupported: "border-border bg-muted/60 text-muted-foreground line-through",
  unknown: "border-dashed text-muted-foreground",
}

export default function ModelsPage() {
  const { t } = useT()
  const models = usePlatform((state) => state.models)
  const keys = usePlatform((state) => state.keys)
  const loading = usePlatform((state) => state.loading)
  const refreshing = usePlatform((state) => state.refreshingProvider)
  const settings = usePlatform((state) => state.settings)
  const refreshModels = usePlatform((state) => state.refreshModels)
  const favoriteModel = usePlatform((state) => state.favoriteModel)
  const addManualModel = usePlatform((state) => state.addManualModel)
  const patchSettings = usePlatform((state) => state.patchSettings)

  const [search, setSearch] = React.useState("")
  const [providerFilter, setProviderFilter] = React.useState("all")
  const [capabilityFilter, setCapabilityFilter] = React.useState("all")
  const [freeOnly, setFreeOnly] = React.useState(false)
  const [sort, setSort] = React.useState<SortKey>("name")
  const [manualOpen, setManualOpen] = React.useState(false)
  const [manualProvider, setManualProvider] = React.useState("")
  const [manualId, setManualId] = React.useState("")
  const [settingsTarget, setSettingsTarget] = React.useState<ModelInfo | null>(null)

  const connectedProviderIds = Array.from(new Set(keys.map((key) => key.providerId)))

  const filtered = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = models.filter((model) => {
      if (providerFilter !== "all" && model.providerId !== providerFilter) return false
      if (freeOnly && !model.free) return false
      if (capabilityFilter !== "all") {
        const state = model.capabilities?.[capabilityFilter as ModelCapability] ?? "unknown"
        if (state !== "supported") return false
      }
      if (!term) return true
      return (
        model.name.toLowerCase().includes(term) ||
        model.id.toLowerCase().includes(term) ||
        (model.description ?? "").toLowerCase().includes(term)
      )
    })
    return [...list].sort((a, b) => {
      switch (sort) {
        case "newest":
          return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
        case "cheapest":
          return (
            (a.pricing?.inputPerMTokens ?? Number.POSITIVE_INFINITY) -
            (b.pricing?.inputPerMTokens ?? Number.POSITIVE_INFINITY)
          )
        case "context":
          return (b.contextLength ?? 0) - (a.contextLength ?? 0)
        default:
          return a.name.localeCompare(b.name)
      }
    })
  }, [models, search, providerFilter, capabilityFilter, freeOnly, sort])

  const manualProviders = connectedProviderIds
    .map((id) => getProvider(id))
    .filter((provider) => provider && !provider.supportsModelDiscovery && !provider.requiresProxy)

  const modelKeyOf = (model: ModelInfo) => `${model.providerId}:${model.id}`
  const favorites = settings?.favoriteModels ?? []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("models.title")}
        description={t("models.subtitle")}
        actions={
          <>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="h-8 w-full text-[12px] sm:w-[170px]">
                <SelectValue placeholder={t("common.provider")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[12px]">
                  {t("common.all")}
                </SelectItem>
                {connectedProviderIds.map((id) => (
                  <SelectItem key={id} value={id} className="text-[12px]">
                    {getProvider(id)?.name ?? id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={capabilityFilter} onValueChange={setCapabilityFilter}>
              <SelectTrigger className="h-8 w-full text-[12px] sm:w-[170px]">
                <SelectValue placeholder={t("common.capabilities")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[12px]">
                  {t("common.all")}
                </SelectItem>
                {MODEL_CAPABILITIES.map((capability) => (
                  <SelectItem key={capability} value={capability} className="text-[12px]">
                    {CAPABILITY_LABELS[capability]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
              <SelectTrigger className="h-8 w-full text-[12px] sm:w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name" className="text-[12px]">
                  Name
                </SelectItem>
                <SelectItem value="newest" className="text-[12px]">
                  {t("common.updated")}
                </SelectItem>
                <SelectItem value="cheapest" className="text-[12px]">
                  {t("common.price")}
                </SelectItem>
                <SelectItem value="context" className="text-[12px]">
                  {t("common.context")}
                </SelectItem>
              </SelectContent>
            </Select>
            {manualProviders.length ? (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 text-[12px]"
                onClick={() => {
                  setManualProvider(manualProviders[0]?.id ?? "")
                  setManualOpen(true)
                }}
              >
                <Plus className="size-3.5" />
                {t("models.manual")}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2 sm:px-6">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("models.searchPlaceholder")}
          className="h-8 w-full max-w-xs text-[12px]"
        />
        <label className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <Switch checked={freeOnly} onCheckedChange={setFreeOnly} className="scale-90" />
          {t("models.free")}
        </label>
        <div className="ms-auto flex flex-wrap items-center gap-1.5">
          {connectedProviderIds.map((id) => {
            const provider = getProvider(id)
            if (!provider) return null
            return (
              <Button
                key={id}
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11.5px]"
                disabled={refreshing === id}
                onClick={() =>
                  void refreshModels(id).then((outcome) =>
                    outcome.ok ? toast.success(outcome.message) : toast.error(outcome.message)
                  )
                }
              >
                {refreshing === id ? (
                  <RefreshCw className="size-3.5 animate-spin" />
                ) : (
                  <ProviderLogo
                    name={provider.name}
                    slug={provider.logSlug}
                    accent={provider.accent}
                    className="size-4 border-0"
                  />
                )}
                {provider.name}
              </Button>
            )
          })}
        </div>
      </div>

      <PageBody>
        {loading && !models.length ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-[12.5px] text-muted-foreground">
            {models.length === 0 ? t("models.noModels") : t("searchPage.noResults")}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((model) => {
              const provider = getProvider(model.providerId)
              const key = modelKeyOf(model)
              const isFavorite = favorites.includes(key)
              const supported = MODEL_CAPABILITIES.filter(
                (capability) => model.capabilities?.[capability] === "supported"
              )
              const unsupported = MODEL_CAPABILITIES.filter(
                (capability) => model.capabilities?.[capability] === "unsupported"
              )
              const unknown = MODEL_CAPABILITIES.filter(
                (capability) => !model.capabilities?.[capability]
              )
              return (
                <div key={key} className="flex flex-col gap-2.5 rounded-lg border bg-card p-3.5 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    {provider ? (
                      <ProviderLogo
                        name={provider.name}
                        slug={provider.logSlug}
                        accent={provider.accent}
                        className="size-8"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[13px] font-medium" title={model.name}>
                        {model.name}
                      </h3>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {provider?.name ?? model.providerId}
                        {model.contextLength
                          ? ` · ${model.contextLength.toLocaleString()} ${t("common.context")}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={isFavorite ? t("common.unfavorite") : t("common.favorite")}
                            onClick={() => void favoriteModel(key)}
                          >
                            {isFavorite ? (
                              <Star className="size-3.5 fill-current text-amber-500" />
                            ) : (
                              <StarOff className="size-3.5" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("common.favorite")}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            aria-label={t("settings.chat")}
                            onClick={() => setSettingsTarget(model)}
                          >
                            <Settings2 className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("settings.chat")}</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>

                  {model.description ? (
                    <p className="line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                      {model.description}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-1">
                    {supported.map((capability) => (
                      <Badge
                        key={capability}
                        variant="outline"
                        className={cn("h-5 gap-1 text-[10px]", capabilityStateStyles.supported)}
                      >
                        <Check className="size-2.5" />
                        {CAPABILITY_LABELS[capability]}
                      </Badge>
                    ))}
                    {unsupported.map((capability) => (
                      <Badge
                        key={capability}
                        variant="outline"
                        className={cn("h-5 gap-1 text-[10px]", capabilityStateStyles.unsupported)}
                      >
                        <Minus className="size-2.5" />
                        {CAPABILITY_LABELS[capability]}
                      </Badge>
                    ))}
                    {unknown.map((capability) => (
                      <Tooltip key={capability}>
                        <TooltipTrigger asChild>
                          <Badge
                            variant="outline"
                            className={cn("h-5 text-[10px]", capabilityStateStyles.unknown)}
                          >
                            {CAPABILITY_LABELS[capability]} ?
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>{t("models.capabilityUnknown")}</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-2 pt-1">
                    <span className="text-[10.5px] text-muted-foreground">
                      {model.pricing?.inputPerMTokens !== undefined
                        ? `$${model.pricing.inputPerMTokens.toFixed(2)} / M in · $${(model.pricing.outputPerMTokens ?? 0).toFixed(2)} / M out`
                        : model.free
                          ? t("models.free")
                          : t("common.unknown")}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-[11.5px]"
                      onClick={() => {
                        void patchSettings({
                          defaultProviderId: model.providerId,
                          defaultModelId: model.id,
                        })
                        toast.success(`${model.name} — ${t("models.useInChat")}`)
                      }}
                    >
                      <Wand2 className="size-3" />
                      {t("models.useInChat")}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </PageBody>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">{t("models.manual")}</DialogTitle>
            <DialogDescription className="text-[12px]">
              Add a model id for a provider whose catalog is not readable from the browser. The id is
              stored locally and used exactly as typed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-[12px]">{t("common.provider")}</Label>
              <Select value={manualProvider} onValueChange={setManualProvider}>
                <SelectTrigger className="h-9 text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {manualProviders.map((provider) =>
                    provider ? (
                      <SelectItem key={provider.id} value={provider.id} className="text-[12px]">
                        {provider.name}
                      </SelectItem>
                    ) : null
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">{t("models.manual")}</Label>
              <Input
                value={manualId}
                onChange={(event) => setManualId(event.target.value)}
                placeholder="llama-3.3-70b"
                className="font-mono text-[12px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setManualOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!manualProvider || !manualId.trim()}
              onClick={() => {
                void addManualModel(manualProvider, manualId.trim()).then(() => {
                  toast.success("Model added")
                  setManualOpen(false)
                  setManualId("")
                })
              }}
            >
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ModelSettingsDialog
        model={settingsTarget}
        onClose={() => setSettingsTarget(null)}
        modelSettings={settings?.modelSettings ?? {}}
        onSave={(key, value) => {
          void patchSettings({
            modelSettings: { ...(settings?.modelSettings ?? {}), [key]: value },
          })
          toast.success(t("settings.saved"))
        }}
      />
    </div>
  )
}

function ModelSettingsDialog({
  model,
  modelSettings,
  onClose,
  onSave,
}: {
  model: ModelInfo | null
  modelSettings: Record<string, ModelSettings>
  onClose: () => void
  onSave: (key: string, value: ModelSettings) => void
}) {
  const { t } = useT()
  const key = model ? `${model.providerId}:${model.id}` : ""
  const [draft, setDraft] = React.useState<ModelSettings>({})

  React.useEffect(() => {
    if (model) setDraft(modelSettings[`${model.providerId}:${model.id}`] ?? {})
  }, [model, modelSettings])

  if (!model) return null
  const capability = (name: ModelCapability) => model.capabilities?.[name]
  const numberField = (
    label: string,
    field: keyof ModelSettings,
    step: number,
    min?: number,
    max?: number
  ) => (
    <div className="space-y-1.5">
      <Label className="text-[12px]">{label}</Label>
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft[field] === undefined ? "" : String(draft[field])}
        onChange={(event) => {
          const value = event.target.value === "" ? undefined : Number(event.target.value)
          setDraft((current) => ({ ...current, [field]: value }))
        }}
        className="h-8 text-[12px]"
      />
    </div>
  )

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[15px]">{model.name}</DialogTitle>
          <DialogDescription className="text-[12px]">
            Only the settings the provider reports as supported are enabled. Values are stored locally
            per model.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto pe-1">
          {numberField("Temperature", "temperature", 0.1, 0, 2)}
          {numberField("Top P", "topP", 0.05, 0, 1)}
          {numberField("Max tokens", "maxTokens", 64, 1)}
          {numberField("Frequency penalty", "frequencyPenalty", 0.1, -2, 2)}
          {numberField("Presence penalty", "presencePenalty", 0.1, -2, 2)}
          {numberField("Seed", "seed", 1)}

          <div className="space-y-1.5">
            <Label className="text-[12px]">Stop sequences</Label>
            <Input
              value={(draft.stop ?? []).join(", ")}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  stop: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                }))
              }
              placeholder="stop, end"
              className="h-8 text-[12px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">Reasoning effort</Label>
            <Select
              value={draft.reasoningEffort ?? "medium"}
              onValueChange={(value) =>
                setDraft((current) => ({
                  ...current,
                  reasoningEffort: value as ModelSettings["reasoningEffort"],
                }))
              }
              disabled={capability("reasoning") !== "supported"}
            >
              <SelectTrigger className="h-8 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low" className="text-[12px]">
                  Low
                </SelectItem>
                <SelectItem value="medium" className="text-[12px]">
                  Medium
                </SelectItem>
                <SelectItem value="high" className="text-[12px]">
                  High
                </SelectItem>
              </SelectContent>
            </Select>
            {capability("reasoning") !== "supported" ? (
              <p className="text-[10.5px] text-muted-foreground">{t("models.capabilityUnknown")}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">Response format</Label>
            <Select
              value={draft.responseFormat ?? "text"}
              onValueChange={(value) =>
                setDraft((current) => ({ ...current, responseFormat: value as "text" | "json" }))
              }
              disabled={capability("structured-output") !== "supported"}
            >
              <SelectTrigger className="h-8 text-[12px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text" className="text-[12px]">
                  Text
                </SelectItem>
                <SelectItem value="json" className="text-[12px]">
                  JSON
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">{t("projects.instructions")}</Label>
            <Input
              value={draft.systemInstructions ?? ""}
              onChange={(event) =>
                setDraft((current) => ({ ...current, systemInstructions: event.target.value }))
              }
              placeholder="You are…"
              className="h-8 text-[12px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(key, draft)
              onClose()
            }}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
