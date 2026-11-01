import { Download, ImageIcon, Loader2, Trash2, Wand2 } from "lucide-react"
import * as React from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { PageBody, PageHeader } from "@/components/platform/PageHeader"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { deleteImage, listImages, putImage } from "@/lib/db"
import type { ImageRecord } from "@/lib/types"
import { downloadBlob } from "@/lib/files"
import { generateImages } from "@/platform/adapters"
import { getProvider } from "@/platform/providers"
import { usePlatform } from "@/store/platform"
import { useSession } from "@/store/session"
import { useT } from "@/i18n"

export default function ImageStudioPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const models = usePlatform((state) => state.models)
  const keys = usePlatform((state) => state.keys)
  const images = useLiveQuery(() => (user ? listImages(user.uid) : Promise.resolve([])), [user?.uid], [])

  const imageModels = models.filter(
    (model) =>
      model.capabilities["image-generation"] === "supported" &&
      keys.some((key) => key.providerId === model.providerId)
  )

  const [modelKey, setModelKey] = React.useState("")
  const [prompt, setPrompt] = React.useState("")
  const [size, setSize] = React.useState("1024x1024")
  const [quality, setQuality] = React.useState("standard")
  const [count, setCount] = React.useState("1")
  const [sourceImage, setSourceImage] = React.useState<{ dataUrl: string; name: string } | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (modelKey || !imageModels.length) return
    setModelKey(`${imageModels[0].providerId}:${imageModels[0].id}`)
  }, [modelKey, imageModels])

  const [providerId, ...modelRest] = modelKey.split(":")
  const modelId = modelRest.join(":")
  const model = imageModels.find(
    (item) => item.providerId === providerId && item.id === modelId
  )
  const provider = model ? getProvider(model.providerId) : undefined
  const key = keys.find((item) => item.providerId === providerId)
  const canEdit = model?.capabilities["image-editing"] === "supported"
  const supportsCount = Boolean(provider?.supportsImageApi)

  const generate = async () => {
    if (!provider || !model || !key) return
    if (!prompt.trim()) {
      toast.error(t("images.prompt"))
      return
    }
    setBusy(true)
    try {
      const results = await generateImages({
        provider,
        credentials: { apiKey: key.apiKey, endpoint: key.endpoint, apiVersion: key.apiVersion },
        model: model.id,
        prompt: prompt.trim(),
        size: provider.supportsImageApi ? size : undefined,
        quality: provider.kind === "openai-compatible" && provider.supportsImageApi ? quality : undefined,
        count: supportsCount ? Number(count) : 1,
        inputImage: sourceImage
          ? { mimeType: "image/png", dataUrl: sourceImage.dataUrl }
          : undefined,
      })
      if (!user) return
      for (const image of results) {
        const blob = await (await fetch(image.dataUrl)).blob()
        const record: ImageRecord = {
          id: crypto.randomUUID(),
          userId: user.uid,
          prompt: prompt.trim(),
          providerId: provider.id,
          modelId: model.id,
          mimeType: image.mimeType,
          blob,
          createdAt: Date.now(),
        }
        await putImage(record)
      }
      toast.success(`${results.length} image(s) ${t("images.notStored")}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image generation failed.")
    } finally {
      setBusy(false)
    }
  }

  const pickSource = async (file: File | undefined) => {
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Source image must be under 10 MB.")
      return
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    setSourceImage({ dataUrl, name: file.name })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title={t("images.title")}
        description={t("images.subtitle")}
        actions={
          <Badge variant="outline" className="h-6 text-[10.5px]">
            {imageModels.length} {t("providers.models")}
          </Badge>
        }
      />
      <PageBody>
        {imageModels.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <ImageIcon className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="text-[13px] text-muted-foreground">{t("images.noModels")}</p>
            <div className="mt-3 flex justify-center gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/providers")}>
                {t("providers.title")}
              </Button>
              <Button size="sm" onClick={() => navigate("/models")}>
                {t("nav.models")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
            <Card className="h-fit">
              <CardContent className="space-y-3 p-4">
                <div className="space-y-1.5">
                  <Label className="text-[12px]">{t("common.model")}</Label>
                  <Select value={modelKey} onValueChange={setModelKey}>
                    <SelectTrigger className="h-8 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {imageModels.map((item) => (
                        <SelectItem
                          key={`${item.providerId}:${item.id}`}
                          value={`${item.providerId}:${item.id}`}
                          className="text-[12px]"
                        >
                          {item.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[12px]">{t("images.prompt")}</Label>
                  <Textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    placeholder="A quiet stone studio, soft window light, 35mm…"
                    className="min-h-24 text-[12px]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {provider?.supportsImageApi ? (
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">{t("images.size")}</Label>
                      <Select value={size} onValueChange={setSize}>
                        <SelectTrigger className="h-8 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["1024x1024", "1024x1536", "1536x1024", "512x512"].map((value) => (
                            <SelectItem key={value} value={value} className="text-[12px]">
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {provider?.supportsImageApi ? (
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">{t("images.quality")}</Label>
                      <Select value={quality} onValueChange={setQuality}>
                        <SelectTrigger className="h-8 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["standard", "high", "low"].map((value) => (
                            <SelectItem key={value} value={value} className="text-[12px]">
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  {supportsCount ? (
                    <div className="space-y-1.5">
                      <Label className="text-[12px]">{t("images.count")}</Label>
                      <Select value={count} onValueChange={setCount}>
                        <SelectTrigger className="h-8 text-[12px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["1", "2", "3", "4"].map((value) => (
                            <SelectItem key={value} value={value} className="text-[12px]">
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>

                {canEdit ? (
                  <div className="space-y-1.5">
                    <Label className="text-[12px]">{t("images.source")}</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(event) => void pickSource(event.target.files?.[0])}
                        className="h-8 text-[11px] file:me-2"
                      />
                      {sourceImage ? (
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setSourceImage(null)}>
                          {t("common.cancel")}
                        </Button>
                      ) : null}
                    </div>
                    {sourceImage ? (
                      <img
                        src={sourceImage.dataUrl}
                        alt={sourceImage.name}
                        className="mt-1 h-20 rounded-md border object-cover"
                      />
                    ) : null}
                  </div>
                ) : null}

                <Button className="w-full gap-1.5" disabled={busy} onClick={() => void generate()}>
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
                  {busy
                    ? t("images.generating")
                    : sourceImage
                      ? t("images.edit")
                      : t("images.generate")}
                </Button>
                <p className="text-[10.5px] leading-relaxed text-muted-foreground">
                  {provider?.name} · {t("images.notStored")}
                </p>
              </CardContent>
            </Card>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[13px] font-medium">{t("images.history")}</h2>
                <span className="text-[11px] text-muted-foreground">{images.length}</span>
              </div>
              {busy ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="aspect-square w-full" />
                </div>
              ) : images.length === 0 ? (
                <div className="grid place-items-center rounded-lg border border-dashed p-10 text-[12px] text-muted-foreground">
                  {t("common.empty")}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {images.map((image) => (
                    <ImageCard key={image.id} image={image} userId={user?.uid} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </PageBody>
    </div>
  )
}

function ImageCard({ image, userId }: { image: ImageRecord; userId?: string }) {
  const { t } = useT()
  const [url, setUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    const objectUrl = URL.createObjectURL(image.blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [image.blob])

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {url ? (
        <img src={url} alt={image.prompt} className="aspect-square w-full object-cover" loading="lazy" />
      ) : (
        <div className="aspect-square w-full bg-muted" />
      )}
      <div className="space-y-2 p-2.5">
        <p className="line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">{image.prompt}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[10.5px] text-muted-foreground">
            {image.modelId}
          </span>
          <div className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              aria-label={t("images.download")}
              onClick={() => downloadBlob(image.blob, `ai-image-${image.id.slice(0, 8)}.png`)}
            >
              <Download className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-destructive hover:text-destructive"
              aria-label={t("images.delete")}
              onClick={() => {
                if (!userId) return
                void deleteImage(userId, image.id)
              }}
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
