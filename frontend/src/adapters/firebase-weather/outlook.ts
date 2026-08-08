import { doc, getDoc, getFirestore } from 'firebase/firestore/lite'
import { getFirebaseApp } from '../../lib/firebase'
import type { Outlook } from '../../types/outlook'

const FRESH_FOR_MS = 8 * 60 * 60_000

function coordinateToken(value: number) {
  return value.toFixed(4).replace('-', 'm').replace('.', 'p')
}

export function firebaseLocationId(latitude: number, longitude: number) {
  return `geo_${coordinateToken(latitude)}_${coordinateToken(longitude)}`
}

function isOutlook(value: unknown): value is Outlook {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Outlook>
  return candidate.mode === 'ensemble' &&
    typeof candidate.refreshedAt === 'string' &&
    Array.isArray(candidate.fusion?.daily)
}

export interface PublishedOutlook {
  outlook: Outlook
  fresh: boolean
}

export async function getPublishedOutlook(
  latitude: number,
  longitude: number,
): Promise<PublishedOutlook | null> {
  const app = getFirebaseApp()
  if (!app) return null
  const reference = doc(
    getFirestore(app),
    'publicWeather',
    firebaseLocationId(latitude, longitude),
  )
  const snapshot = await getDoc(reference)
  const outlook = snapshot.data()?.latestOutlook
  if (!isOutlook(outlook)) return null
  const age = Date.now() - Date.parse(outlook.refreshedAt)
  return {
    outlook: { ...outlook, source: 'firebase' },
    fresh: Number.isFinite(age) && age >= 0 && age <= FRESH_FOR_MS,
  }
}
