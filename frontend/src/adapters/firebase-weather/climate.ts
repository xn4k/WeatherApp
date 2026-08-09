import { doc, getDoc, getFirestore } from 'firebase/firestore/lite'
import { getFirebaseApp } from '../../lib/firebase'
import type { ClimateDay } from '../../types/evidence'
import { firebaseLocationId } from './location-id'

export async function getClimateDay(
  latitude: number,
  longitude: number,
  monthDay: string,
): Promise<ClimateDay | null> {
  if (!/^\d{2}-\d{2}$/.test(monthDay)) return null
  const app = getFirebaseApp()
  if (!app) return null
  const reference = doc(
    getFirestore(app),
    'publicWeather',
    firebaseLocationId(latitude, longitude),
    'climateCalendar',
    monthDay,
  )
  const snapshot = await getDoc(reference)
  if (!snapshot.exists()) return null
  const value = snapshot.data()
  return value?.method === 'calendar-climatology-v1.0.0' && Array.isArray(value.history)
    ? value as ClimateDay
    : null
}
