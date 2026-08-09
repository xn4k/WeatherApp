import { doc, getDoc, getFirestore } from 'firebase/firestore/lite'
import { getFirebaseApp } from '../../lib/firebase'
import type { Outlook } from '../../types/outlook'
import { firebaseLocationId } from './location-id'

const FRESH_FOR_MS = 8 * 60 * 60_000


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
  const published = snapshot.data()
  const outlook = published?.latestOutlook
  if (!isOutlook(outlook)) return null
  const age = Date.now() - Date.parse(outlook.refreshedAt)
  return {
    outlook: {
      ...outlook,
      referenceProfile: published?.referenceProfile ?? null,
      climateToday: published?.climateToday ?? null,
      latestObservation: published?.latestObservation ?? null,
      radolanStatus: published?.radolanStatus ?? null,
      source: 'firebase',
    },
    fresh: Number.isFinite(age) && age >= 0 && age <= FRESH_FOR_MS,
  }
}
