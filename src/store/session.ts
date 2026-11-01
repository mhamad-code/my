import { create } from "zustand"
import {
  getGuestId,
  isFirebaseConfigured,
  watchAuth,
  type AuthUser,
} from "@/lib/firebase"

export type SessionUser = AuthUser & { mode: "firebase" | "guest" }

type SessionState = {
  status: "loading" | "ready"
  user: SessionUser | null
  firebaseConfigured: boolean
  init: () => void
}

let unsubscribe: (() => void) | null = null

export const useSession = create<SessionState>((set, get) => ({
  status: "loading",
  user: null,
  firebaseConfigured: isFirebaseConfigured,
  init: () => {
    if (unsubscribe) return
    if (!isFirebaseConfigured) {
      set({
        status: "ready",
        firebaseConfigured: false,
        user: {
          uid: getGuestId(),
          email: null,
          displayName: "Local profile",
          emailVerified: false,
          mode: "guest",
        },
      })
      return
    }
    unsubscribe = watchAuth((user) => {
      set({
        status: "ready",
        user: user ? { ...user, mode: "firebase" } : null,
      })
    })
    // If Firebase never answers (offline), stop showing a spinner forever.
    setTimeout(() => {
      if (get().status === "loading") set({ status: "ready" })
    }, 8000)
  },
}))

export const currentUserId = () => useSession.getState().user?.uid
