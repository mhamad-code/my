import { Bot, Loader2, LogIn, Mail } from "lucide-react"
import * as React from "react"
import { Link, Navigate, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  authErrorMessage,
  isFirebaseConfigured,
  requestPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "@/lib/firebase"
import { useSession } from "@/store/session"
import { useT } from "@/i18n"

export default function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { t, dir } = useT()
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const [tab, setTab] = React.useState(mode)
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState("")
  const [resetSent, setResetSent] = React.useState(false)

  if (user) return <Navigate to="/" replace />

  if (!isFirebaseConfigured) {
    return (
      <div className="grid min-h-svh place-items-center bg-background px-4" dir={dir}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
                <Bot className="size-4" />
              </span>
              <div>
                <CardTitle className="text-[15px]">{t("app.name")}</CardTitle>
                <CardDescription className="text-[11.5px]">{t("app.tagline")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Alert>
              <Mail className="size-4" />
              <AlertTitle className="text-[12.5px]">{t("account.guestTitle")}</AlertTitle>
              <AlertDescription className="text-[11.5px] leading-relaxed">
                {t("account.guestBody")}
              </AlertDescription>
            </Alert>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              To enable accounts, create a Firebase project, turn on Email/Password and Google sign-in,
              and set <code className="font-mono">VITE_FIREBASE_API_KEY</code>,{" "}
              <code className="font-mono">VITE_FIREBASE_AUTH_DOMAIN</code>,{" "}
              <code className="font-mono">VITE_FIREBASE_PROJECT_ID</code> and{" "}
              <code className="font-mono">VITE_FIREBASE_APP_ID</code>.
            </p>
            <Button className="w-full" onClick={() => navigate("/")}>
              {t("auth.localOnly")}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const submit = async () => {
    setError("")
    setBusy(true)
    try {
      if (tab === "login") {
        await signInWithEmail(email.trim(), password)
        navigate("/")
      } else {
        await signUpWithEmail(email.trim(), password, name.trim() || undefined)
        toast.success(t("account.verificationSent"))
        navigate("/")
      }
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center bg-[radial-gradient(100%_70%_at_50%_-10%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)] px-4" dir={dir}>
      <Card className="w-full max-w-md border-border/70 bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Bot className="size-4" />
            </span>
            <div>
              <CardTitle className="text-[15px]">{t("app.name")}</CardTitle>
              <CardDescription className="text-[11.5px]">{t("app.tagline")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as "login" | "register")}>
            <TabsList className="grid h-8 w-full grid-cols-2">
              <TabsTrigger value="login" className="text-[11.5px]">
                {t("auth.login")}
              </TabsTrigger>
              <TabsTrigger value="register" className="text-[11.5px]">
                {t("auth.register")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {tab === "register" ? (
            <div className="space-y-1.5">
              <Label className="text-[12px]">{t("auth.name")}</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} className="h-8 text-[12px]" />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label className="text-[12px]">{t("auth.email")}</Label>
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-8 text-[12px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[12px]">{t("auth.password")}</Label>
            <Input
              type="password"
              autoComplete={tab === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit()
              }}
              className="h-8 text-[12px]"
            />
          </div>

          {error ? <p className="text-[11.5px] text-destructive">{error}</p> : null}

          <Button className="w-full gap-1.5" disabled={busy} onClick={() => void submit()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <LogIn className="size-3.5" />}
            {tab === "login" ? t("auth.login") : t("auth.register")}
          </Button>

          <div className="flex items-center gap-2 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[10px] text-muted-foreground">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => {
              setError("")
              setBusy(true)
              void signInWithGoogle()
                .then(() => navigate("/"))
                .catch((caught) => setError(authErrorMessage(caught)))
                .finally(() => setBusy(false))
            }}
          >
            {t("auth.google")}
          </Button>

          <div className="flex flex-col gap-1.5 pt-1 text-center">
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => {
                if (!email.trim()) {
                  setError(t("auth.email"))
                  return
                }
                void requestPasswordReset(email.trim())
                  .then(() => {
                    setResetSent(true)
                    setError("")
                  })
                  .catch((caught) => setError(authErrorMessage(caught)))
              }}
            >
              {resetSent ? t("auth.resetSent") : t("auth.forgot")}
            </button>
            <Link to="/" className="text-[11px] text-muted-foreground hover:text-foreground">
              {t("auth.localOnly")}
            </Link>
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground">{t("account.firebaseNote")}</p>
        </CardContent>
      </Card>
    </div>
  )
}
