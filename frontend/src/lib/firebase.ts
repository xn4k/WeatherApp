import { getApp, getApps, initializeApp } from 'firebase/app'
import type { FirebaseApp } from 'firebase/app'
import type { Analytics } from 'firebase/analytics'

let app: FirebaseApp | null = null

export function getFirebaseApp(): FirebaseApp | null {
  if (app) return app
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
  const appId = import.meta.env.VITE_FIREBASE_APP_ID
  if (!apiKey || !projectId || !appId) return null

  const firebaseConfig = {
    apiKey,
    projectId,
    appId,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  }
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
  return app
}

export async function initializeFirebaseAnalytics(): Promise<Analytics | null> {
  if (
    typeof window === 'undefined' ||
    !import.meta.env.PROD ||
    import.meta.env.VITE_FIREBASE_ANALYTICS_ENABLED !== 'true'
  ) {
    return null
  }
  const firebaseApp = getFirebaseApp()
  if (!firebaseApp) return null
  const { getAnalytics, isSupported } = await import('firebase/analytics')
  if (!(await isSupported())) return null
  return getAnalytics(firebaseApp)
}
