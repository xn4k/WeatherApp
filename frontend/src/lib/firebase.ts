import { getApp, getApps, initializeApp } from 'firebase/app'
import type { Analytics } from 'firebase/analytics'

const firebaseConfig = {
  apiKey: 'AIzaSyBT-uxGFu3JlQI7CaUIWRddi0Cv-n7R1eg',
  authDomain: 'isobar-7d8eb.firebaseapp.com',
  projectId: 'isobar-7d8eb',
  storageBucket: 'isobar-7d8eb.firebasestorage.app',
  messagingSenderId: '622712416218',
  appId: '1:622712416218:web:3022919729850ccd2482e3',
  measurementId: 'G-BCGQ0QRSGF',
} as const

export const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)

export async function initializeFirebaseAnalytics(): Promise<Analytics | null> {
  if (
    typeof window === 'undefined' ||
    !import.meta.env.PROD ||
    import.meta.env.VITE_FIREBASE_ANALYTICS_ENABLED !== 'true'
  ) {
    return null
  }

  const { getAnalytics, isSupported } = await import('firebase/analytics')
  if (!(await isSupported())) return null
  return getAnalytics(firebaseApp)
}
