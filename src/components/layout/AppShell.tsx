import {
  Bot,
  Boxes,
  FolderKanban,
  Home,
  ImageIcon,
  Library,
  LogIn,
  Menu,
  Plus,
  Search,
  Settings,
  Sparkles,
  Globe,
  Plug,
} from "lucide-react"
import * as React from "react"
import { useLiveQuery } from "dexie-react-hooks"
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import {
  ChatSidebar,
  ChatSidebarDnd,
  ChatSidebarItemGhost,
  ChatSidebarItemList,
  SidebarCollapsibleSection,
  SidebarEmptyState,
  SideRow,
  type ChatSidebarItemData,
} from "@/components/ui/chat-sidebar"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Spinner } from "@/components/ui/spinner"
import { RenderErrorBoundary } from "@/components/ui/render-error-boundary"
import {
  deleteConversation,
  listConversations,
  putConversation,
} from "@/lib/db"
import type { ConversationRecord } from "@/lib/types"
import { useT } from "@/i18n"
import { usePlatform } from "@/store/platform"
import { useSession } from "@/store/session"
import { cn } from "@/lib/utils"

function initials(name: string | null | undefined, email: string | null | undefined) {
  const source = name?.trim() || email?.split("@")[0] || "You"
  return source.slice(0, 2).toUpperCase()
}

export function AppShell() {
  const { t, language } = useT()
  const location = useLocation()
  const navigate = useNavigate()
  const user = useSession((state) => state.user)
  const status = useSession((state) => state.status)
  const settings = usePlatform((state) => state.settings)
  const patchSettings = usePlatform((state) => state.patchSettings)
  const userId = user?.uid

  /**
   * Closed on every load and on every navigation: the drawer is a place you go
   * to, not a column that permanently reserves width. Nothing is persisted, so
   * a reload never brings the icon rail back.
   */
  const [sidebarOpen, setSidebarOpen] = React.useState(false)
  const closeSidebar = React.useCallback(() => setSidebarOpen(false), [])

  React.useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  React.useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false)
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [sidebarOpen])

  const conversations = useLiveQuery(
    () => (userId ? listConversations(userId) : Promise.resolve([])),
    [userId],
    [] as ConversationRecord[]
  )

  const permanent = conversations.filter((conversation) => !conversation.temporary)
  const pinned = permanent.filter((conversation) => conversation.pinned)
  const recent = permanent.filter((conversation) => !conversation.pinned)
  const activeId = location.pathname.startsWith("/chat/")
    ? location.pathname.slice("/chat/".length)
    : undefined

  const toggleLanguage = () => {
    void patchSettings({ language: language === "ar" ? "en" : "ar" })
  }

  const toItem = (conversation: ConversationRecord): ChatSidebarItemData => ({
    id: conversation.id,
    title: conversation.title,
    pinned: conversation.pinned,
    subtitle:
      conversation.projectId && conversation.projectId !== ""
        ? t("nav.projects")
        : undefined,
    meta: new Date(conversation.updatedAt).toLocaleDateString(
      language === "ar" ? "ar" : "en",
      { month: "short", day: "numeric" }
    ),
  })

  const rename = async (id: string, title: string) => {
    const conversation = conversations.find((item) => item.id === id)
    if (!conversation) return
    await putConversation({ ...conversation, title: title.trim() || conversation.title })
  }

  const togglePin = async (id: string, pinnedValue: boolean) => {
    const conversation = conversations.find((item) => item.id === id)
    if (!conversation) return
    await putConversation({ ...conversation, pinned: pinnedValue })
  }

  const remove = async (id: string) => {
    if (!userId) return
    await deleteConversation(userId, id)
    if (activeId === id) navigate("/chat")
    toast.success("Chat deleted")
  }

  const reorder = async (fromId: string, toIndex: number) => {
    if (!userId) return
    const ordered = [...pinned, ...recent]
    const fromIndex = ordered.findIndex((item) => item.id === fromId)
    if (fromIndex < 0) return
    const [moved] = ordered.splice(fromIndex, 1)
    ordered.splice(Math.max(0, Math.min(toIndex, ordered.length)), 0, moved)
    await Promise.all(
      ordered.map((item, index) =>
        putConversation({
          ...item,
          sortIndex: (ordered.length - index) * 1000,
          pinned: item.pinned,
        })
      )
    )
  }

  const navItems = [
    { to: "/", label: t("nav.home"), icon: <Home className="size-4" /> },
    { to: "/models", label: t("nav.models"), icon: <Boxes className="size-4" /> },
    { to: "/providers", label: t("nav.providers"), icon: <Plug className="size-4" /> },
    { to: "/projects", label: t("nav.projects"), icon: <FolderKanban className="size-4" /> },
    { to: "/library", label: t("nav.library"), icon: <Library className="size-4" /> },
    { to: "/images", label: t("nav.imageStudio"), icon: <ImageIcon className="size-4" /> },
    { to: "/search", label: t("nav.search"), icon: <Search className="size-4" /> },
    { to: "/integrations", label: t("nav.integrations"), icon: <Sparkles className="size-4" /> },
  ]

  const isActive = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)

  if (status === "loading") {
    return (
      <div className="grid h-svh place-items-center bg-background">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    )
  }

  const nav = (
    <>
      <SideRow
        icon={<Plus className="size-4" />}
        onClick={() => navigate("/chat")}
        hint="⌘K"
      >
        {t("nav.newChat")}
      </SideRow>
      {navItems.map((item) => (
        <SideRow
          key={item.to}
          icon={item.icon}
          onClick={() => navigate(item.to)}
          className={cn(isActive(item.to) && "bg-sidebar-accent text-sidebar-accent-foreground")}
        >
          {item.label}
        </SideRow>
      ))}
    </>
  )

  const footer = (
    <div className="flex flex-col gap-1">
      <SideRow
        icon={<Settings className="size-4" />}
        onClick={() => navigate("/settings")}
        className={cn(isActive("/settings") && "bg-sidebar-accent text-sidebar-accent-foreground")}
      >
        {t("nav.settings")}
      </SideRow>
      <Divider />
      <button
        type="button"
        onClick={() => navigate("/account")}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start transition-colors hover:bg-sidebar-accent"
      >
        <Avatar className="size-6">
          <AvatarFallback className="text-[10px]">
            {initials(user?.displayName, user?.email)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 truncate text-[12.5px]">
          {user?.displayName || user?.email || t("account.guestTitle")}
        </span>
        {user?.mode === "guest" ? (
          <span className="text-[10px] text-muted-foreground">local</span>
        ) : null}
      </button>
      <div className="flex items-center gap-1 px-1 pt-1">
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={toggleLanguage}>
          <Globe className="size-3.5" />
          <span className="text-[11px]">{language === "ar" ? "EN" : "ع"}</span>
        </Button>
        {settings ? (
          <ThemeToggle
            floating={false}
            className="size-8"
            onClick={() => {
              if (!settings) return
              const next =
                settings.theme === "dark" ? "light" : settings.theme === "light" ? "system" : "dark"
              void patchSettings({ theme: next })
            }}
          />
        ) : null}
      </div>
    </div>
  )

  const list = (items: ConversationRecord[], listId: string) => (
    <ChatSidebarItemList
      items={items.map(toItem)}
      listId={listId}
      activeId={activeId}
      draggable
      sortable
      groupPinned={false}
      onSelect={(id) => navigate(`/chat/${id}`)}
      onRename={rename}
      onTogglePin={(id) => {
        const item = conversations.find((conversation) => conversation.id === id)
        if (item) void togglePin(id, !item.pinned)
      }}
      onDelete={remove}
      emptyState={
        listId === "recent" ? (
          <SidebarEmptyState>{t("nav.noChats")}</SidebarEmptyState>
        ) : undefined
      }
    />
  )

  return (
    <div className="flex h-svh w-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-background/95 px-1.5 pt-[env(safe-area-inset-top)] backdrop-blur sm:h-12 sm:px-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={() => setSidebarOpen(true)}
          aria-label={t("nav.menu")}
          aria-controls="app-sidebar"
          aria-expanded={sidebarOpen}
        >
          <Menu className="size-[18px]" />
        </Button>
        <Link to="/" className="flex min-w-0 items-center gap-2 rounded-md px-1">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
            <Bot className="size-3.5" />
          </span>
          <span className="truncate text-[13px] font-semibold">{t("app.name")}</span>
        </Link>
        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-[11.5px]"
            onClick={() => navigate("/chat")}
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">{t("nav.newChat")}</span>
          </Button>
          {settings ? (
            <ThemeToggle
              floating={false}
              className="size-8"
              onClick={() => {
                if (!settings) return
                const next =
                  settings.theme === "dark"
                    ? "light"
                    : settings.theme === "light"
                      ? "system"
                      : "dark"
                void patchSettings({ theme: next })
              }}
            />
          ) : null}
        </div>
      </header>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <RenderErrorBoundary
          key={location.pathname}
          resetKeys={[location.pathname]}
          fallback={<PageCrash />}
        >
          <Outlet />
        </RenderErrorBoundary>
      </main>

      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/45"
          onClick={closeSidebar}
          role="presentation"
          aria-hidden
        />
      ) : null}

      <div
        id="app-sidebar"
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.chats")}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex h-dvh w-[min(86vw,320px)] max-w-full flex-col overflow-hidden border-e border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none",
          sidebarOpen ? "translate-x-0" : "-translate-x-full rtl:translate-x-full"
        )}
      >
        <ChatSidebarDnd
          onDrop={(drop) => {
            if (drop.kind === "reorder") {
              void reorder(drop.itemId, drop.to)
            } else if (drop.action === "pin") {
              void togglePin(drop.itemId, true)
            } else if (drop.action === "delete") {
              void remove(drop.itemId)
            }
          }}
          renderOverlay={(id) => {
            const item = conversations.find((conversation) => conversation.id === id)
            return item ? (
              <ChatSidebarItemGhost item={toItem(item)} active={id === activeId} />
            ) : null
          }}
        >
          <div className="flex h-full min-h-0 w-full">
            <ChatSidebar
              collapsed={false}
              onCollapsedChange={closeSidebar}
              width="100%"
              animateWidth={false}
              brand={
                <Link to="/" className="flex min-w-0 items-center gap-2 px-1">
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
                    <Bot className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold leading-4">
                      {t("app.name")}
                    </span>
                    <span className="block truncate text-[10.5px] leading-4 text-muted-foreground">
                      {t("app.tagline")}
                    </span>
                  </span>
                </Link>
              }
              nav={nav}
              footer={footer}
              edgeZones
              dividers
              showJumpHints
              collapseLabel={t("nav.closeMenu")}
              expandLabel={t("nav.expand")}
            >
              {pinned.length ? (
                <ChatSection title={t("nav.pinned")} count={pinned.length}>
                  {list(pinned, "pinned")}
                </ChatSection>
              ) : null}
              <ChatSection title={t("nav.recent")}>
                {list(recent, "recent")}
              </ChatSection>
            </ChatSidebar>
          </div>
        </ChatSidebarDnd>
      </div>
    </div>
  )
}

function ChatSection({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(true)
  return (
    <SidebarCollapsibleSection
      title={title}
      open={open}
      onToggle={() => setOpen((value) => !value)}
      count={count}
    >
      {children}
    </SidebarCollapsibleSection>
  )
}

function Divider() {
  return <div className="my-1 h-px bg-sidebar-border" />
}

export function GuestNotice() {
  const { t } = useT()
  const configured = useSession((state) => state.firebaseConfigured)
  if (configured) return null
  return (
    <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5 text-[11.5px] text-muted-foreground">
      <LogIn className="size-3.5" />
      <span>{t("account.guestBody")}</span>
    </div>
  )
}

/** A page that throws must not take the shell (and the user's navigation) with it. */
function PageCrash() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-sm space-y-3 rounded-lg border border-dashed p-6 text-center">
        <p className="text-[13px] font-medium">This page could not be rendered.</p>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          تعذّر عرض هذه الصفحة. Your data is safe; reload to try again.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md border px-3 py-1.5 text-[12px] hover:bg-muted"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
