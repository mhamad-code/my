import * as React from "react"
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom"
import { ThemeProvider, useTheme } from "next-themes"
import { Direction } from "radix-ui"

import { AppShell } from "@/components/layout/AppShell"
import { Spinner } from "@/components/ui/spinner"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useSession } from "@/store/session"
import { usePlatform } from "@/store/platform"
import { useLanguageDirection } from "@/i18n"

const ChatPage = React.lazy(() => import("@/pages/ChatPage"))
const HomePage = React.lazy(() => import("@/pages/HomePage"))
const ModelsPage = React.lazy(() => import("@/pages/ModelsPage"))
const ProvidersPage = React.lazy(() => import("@/pages/ProvidersPage"))
const ProjectsPage = React.lazy(() => import("@/pages/ProjectsPage"))
const LibraryPage = React.lazy(() => import("@/pages/LibraryPage"))
const ImageStudioPage = React.lazy(() => import("@/pages/ImageStudioPage"))
const SearchPage = React.lazy(() => import("@/pages/SearchPage"))
const IntegrationsPage = React.lazy(() => import("@/pages/IntegrationsPage"))
const SettingsPage = React.lazy(() => import("@/pages/SettingsPage"))
const AccountPage = React.lazy(() => import("@/pages/AccountPage"))
const AuthPage = React.lazy(() => import("@/pages/AuthPage"))

function FullScreenSpinner() {
  return (
    <div className="grid h-svh place-items-center bg-background">
      <Spinner className="size-5 text-muted-foreground" />
    </div>
  )
}

/** Applies the stored theme + language, loads the local profile, gates routes. */
function ProtectedShell() {
  const status = useSession((state) => state.status)
  const user = useSession((state) => state.user)
  const firebaseConfigured = useSession((state) => state.firebaseConfigured)
  const settings = usePlatform((state) => state.settings)
  const load = usePlatform((state) => state.load)
  const reset = usePlatform((state) => state.reset)
  const { setTheme } = useTheme()
  const navigate = useNavigate()
  useLanguageDirection()

  React.useEffect(() => {
    if (!user) {
      reset()
      return
    }
    void load(user.uid)
  }, [user, load, reset])

  React.useEffect(() => {
    if (settings?.theme) setTheme(settings.theme)
  }, [settings?.theme, setTheme])

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault()
        navigate("/chat")
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [navigate])

  if (status === "loading") return <FullScreenSpinner />
  if (firebaseConfigured && !user) return <Navigate to="/login" replace />

  return <AppShell />
}

// Vite injects BASE_URL with a trailing slash ("/my/"); React Router wants
// "/my", and an empty string for a root deployment.
const routerBasename = import.meta.env.BASE_URL.replace(/\/$/, "")

export default function App() {
  const init = useSession((state) => state.init)
  // Radix positions submenus from this provider's direction. Without it every
  // menu assumes LTR and opens past the inline-start edge once the UI is RTL.
  const direction = usePlatform((state) => (state.settings?.language === "ar" ? "rtl" : "ltr")) as
    | "rtl"
    | "ltr"
  React.useEffect(() => init(), [init])

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <Direction.Provider dir={direction}>
      <TooltipProvider delayDuration={200}>
      <BrowserRouter basename={routerBasename}>
        <React.Suspense fallback={<FullScreenSpinner />}>
          <Routes>
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route element={<ProtectedShell />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:id" element={<ChatPage />} />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/providers" element={<ProvidersPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/images" element={<ImageStudioPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/account" element={<AccountPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </React.Suspense>
      </BrowserRouter>
      </TooltipProvider>
      <Toaster position="top-center" />
      </Direction.Provider>
    </ThemeProvider>
  )
}
