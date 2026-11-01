import { BadgeCheck, LogOut, MailCheck, ShieldCheck, UserRound } from "lucide-react"
import * as React from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { PageBody, PageHeader } from "@/components/platform/PageHeader"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { listConversations, listFiles, listProjects } from "@/lib/db"
import { authErrorMessage, resendVerification, signOut } from "@/lib/firebase"
import { useSession } from "@/store/session"
import { usePlatform } from "@/store/platform"
import { useT } from "@/i18n"

export default function AccountPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const configured = useSession((state) => state.firebaseConfigured)
  const reset = usePlatform((state) => state.reset)
  const [sending, setSending] = React.useState(false)

  const conversations = useLiveQuery(
    () => (user ? listConversations(user.uid) : Promise.resolve([])),
    [user?.uid],
    []
  )
  const projects = useLiveQuery(
    () => (user ? listProjects(user.uid) : Promise.resolve([])),
    [user?.uid],
    []
  )
  const files = useLiveQuery(() => (user ? listFiles(user.uid) : Promise.resolve([])), [user?.uid], [])

  if (!user) return null

  const name = user.displayName || user.email?.split("@")[0] || t("account.guestTitle")
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader title={t("account.title")} description={t("account.firebaseNote")} />
      <PageBody>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px]">{t("account.profile")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Avatar className="size-11">
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium">{name}</p>
                  <p className="truncate text-[11.5px] text-muted-foreground">
                    {user.email ?? t("account.guestTitle")}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <Badge variant={configured ? "secondary" : "outline"} className="h-5 gap-1 text-[10px]">
                  {user.mode === "firebase" ? <BadgeCheck className="size-2.5" /> : <UserRound className="size-2.5" />}
                  {configured ? "Firebase Authentication" : t("account.guestTitle")}
                </Badge>
                {user.mode === "firebase" ? (
                  <Badge
                    variant="outline"
                    className="h-5 gap-1 text-[10px]"
                  >
                    <MailCheck className="size-2.5" />
                    {user.emailVerified ? "Email verified" : "Email not verified"}
                  </Badge>
                ) : null}
              </div>

              {configured && user.mode === "firebase" && !user.emailVerified ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[12px]"
                  disabled={sending}
                  onClick={() => {
                    setSending(true)
                    void resendVerification()
                      .then(() => toast.success(t("account.verificationSent")))
                      .catch((error) => toast.error(authErrorMessage(error)))
                      .finally(() => setSending(false))
                  }}
                >
                  {t("auth.resend")}
                </Button>
              ) : null}

              {user.mode === "firebase" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-[12px]"
                  onClick={() => {
                    void signOut().then(() => {
                      reset()
                      toast.success(t("account.signOut"))
                      navigate("/login")
                    })
                  }}
                >
                  <LogOut className="size-3.5" />
                  {t("account.signOut")}
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px]">Local data for this profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("nav.chats")}</span>
                <span>{conversations.filter((chat) => !chat.temporary).length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("nav.projects")}</span>
                <span>{projects.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("nav.library")}</span>
                <span>{files.length}</span>
              </div>
              <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground">
                Signing out never deletes this data. Signing in with a different account shows only that
                account&apos;s rows.
              </p>
            </CardContent>
          </Card>

          {!configured ? (
            <Alert className="lg:col-span-2">
              <ShieldCheck className="size-4" />
              <AlertTitle className="text-[12.5px]">{t("account.guestTitle")}</AlertTitle>
              <AlertDescription className="text-[11.5px] leading-relaxed">
                {t("account.guestBody")}
              </AlertDescription>
            </Alert>
          ) : null}

          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px]">Session</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={() => navigate("/settings")}>
                {t("nav.settings")}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={() => navigate("/providers")}>
                {t("nav.providers")}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-[12px]" onClick={() => navigate("/integrations")}>
                {t("nav.integrations")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </div>
  )
}
