import { initializeApp, type FirebaseApp } from "firebase/app"
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth"

/**
 * Firebase is used for authentication only. There is no Firestore, no Storage
 * and no Firebase database in this project: every conversation, message, file,
 * project and API key stays in the browser's local storage.
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
}

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId
)

let app: FirebaseApp | null = null
let auth: Auth | null = null

function getClientAuth(): Auth {
  if (!isFirebaseConfigured) {
    throw new Error(
      "Firebase Authentication is not configured. Add VITE_FIREBASE_* variables to use accounts."
    )
  }
  if (!app) {
    app = initializeApp({
      apiKey: config.apiKey,
      authDomain: config.authDomain,
      projectId: config.projectId,
      appId: config.appId,
      messagingSenderId: config.messagingSenderId,
    })
    auth = getAuth(app)
  }
  return auth!
}

export type AuthUser = {
  uid: string
  email: string | null
  displayName: string | null
  emailVerified: boolean
}

function mapUser(user: User): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
  }
}

export function watchAuth(callback: (user: AuthUser | null) => void): () => void {
  if (!isFirebaseConfigured) {
    callback(null)
    return () => {}
  }
  return onAuthStateChanged(getClientAuth(), (user) => callback(user ? mapUser(user) : null))
}

export async function signUpWithEmail(email: string, password: string, name?: string) {
  const credential = await createUserWithEmailAndPassword(getClientAuth(), email, password)
  if (name) await updateProfile(credential.user, { displayName: name })
  await sendEmailVerification(credential.user)
  return mapUser(credential.user)
}

export async function signInWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(getClientAuth(), email, password)
  return mapUser(credential.user)
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider()
  const credential = await signInWithPopup(getClientAuth(), provider)
  return mapUser(credential.user)
}

export async function signOut() {
  await firebaseSignOut(getClientAuth())
}

export async function resendVerification() {
  const user = getClientAuth().currentUser
  if (!user) throw new Error("Sign in first.")
  await sendEmailVerification(user)
}

export async function requestPasswordReset(email: string) {
  await sendPasswordResetEmail(getClientAuth(), email)
}

/** Stable local profile id used when Firebase Authentication is not configured. */
export function getGuestId(): string {
  const key = "ai-platform:guest-profile"
  let id = localStorage.getItem(key)
  if (!id) {
    id = `guest_${crypto.randomUUID()}`
    localStorage.setItem(key, id)
  }
  return id
}

export function authErrorMessage(error: unknown): string {
  const code = (error as { code?: string })?.code ?? ""
  switch (code) {
    case "auth/invalid-email":
      return "That email address is not valid."
    case "auth/missing-password":
      return "Enter a password."
    case "auth/weak-password":
      return "Use a password with at least 6 characters."
    case "auth/email-already-in-use":
      return "An account already exists for that email."
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect."
    case "auth/too-many-requests":
      return "Too many attempts. Try again in a few minutes."
    case "auth/popup-blocked":
      return "The browser blocked the sign-in popup. Allow popups and try again."
    case "auth/popup-closed-by-user":
      return "Sign-in was cancelled."
    case "auth/operation-not-allowed":
      return "This sign-in method is not enabled in your Firebase project."
    case "auth/network-request-failed":
      return "Network error while contacting Firebase."
    default:
      return error instanceof Error ? error.message : "Authentication failed."
  }
}
