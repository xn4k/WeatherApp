import { FieldValue } from '@google-cloud/firestore'
import { createHash } from 'node:crypto'
import { buildClimateCalendar, CLIMATE_METHOD } from './climate.mjs'
import { loadDwdObservations, stationReferences } from './dwd-observations.mjs'
import { loadReferenceDays } from './reference.mjs'

const CLIMATE_REFRESH_MS = 28 * 24 * 60 * 60_000
const WRITE_BATCH_LIMIT = 350

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => (
    values.slice(index * size, (index + 1) * size)
  ))
}

function localMonthDay(timezone, now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type) => parts.find((part) => part.type === type)?.value
  return `${value('month')}-${value('day')}`
}

function needsClimateRefresh(profile, now) {
  if (profile?.climateMethod !== CLIMATE_METHOD || !profile?.climateUpdatedAt) return true
  const age = now.getTime() - Date.parse(profile.climateUpdatedAt)
  return !Number.isFinite(age) || age < 0 || age >= CLIMATE_REFRESH_MS
}

function climateHash(calendar) {
  const payload = calendar.map((day) => [
    day.monthDay,
    day.sampleYears,
    day.lastYear,
    day.temperatureP50,
    day.maximumRecord,
    day.minimumRecord,
    day.wettestRecord,
  ])
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

async function publishCalendar(database, locationRef, calendar) {
  for (const group of chunks(calendar, WRITE_BATCH_LIMIT)) {
    const batch = database.batch()
    group.forEach((day) => batch.set(
      locationRef.collection('climateCalendar').doc(day.monthDay),
      { ...day, storedAt: FieldValue.serverTimestamp() },
    ))
    await batch.commit()
  }
}

export async function prepareReferenceLayer(
  database,
  location,
  { now = new Date(), fetchImpl = fetch } = {},
) {
  const locationRef = database?.collection('publicWeather').doc(location.id)
  const current = locationRef ? await locationRef.get() : null
  const includeHistorical = !database || needsClimateRefresh(current?.data()?.referenceProfile, now)
  try {
    const bundle = await loadDwdObservations(location, { fetchImpl, includeHistorical })
    const latestObservation = bundle.recent.at(-1) ?? null
    let calendar = []
    let today = current?.data()?.climateToday ?? null
    let hash = current?.data()?.referenceProfile?.climateHash ?? null
    if (includeHistorical) {
      calendar = buildClimateCalendar(bundle.observations, bundle.station)
      hash = climateHash(calendar)
      today = calendar.find((day) => day.monthDay === localMonthDay(location.timezone, now)) ?? null
    }

    const referenceProfile = {
      method: 'reference-layer-v1.0.0',
      primarySource: 'dwd-cdc',
      fallbackSource: 'open-meteo-analysis-proxy',
      status: 'active',
      station: bundle.station,
      latestObservationDate: latestObservation?.date ?? null,
      latestQualityStatus: latestObservation?.qualityStatus ?? null,
      climateMethod: CLIMATE_METHOD,
      climateHash: hash,
      climateUpdatedAt: includeHistorical ? now.toISOString() : current?.data()?.referenceProfile?.climateUpdatedAt,
      notice: 'Temperatur und Stationsniederschlag werden bevorzugt gegen DWD-Messungen geprueft; fehlende Tage fallen transparent auf den Analysis-Proxy zurueck.',
    }

    if (database) {
      if (calendar.length) await publishCalendar(database, locationRef, calendar)
      await locationRef.set({
        referenceProfile,
        climateToday: today,
        latestObservation,
        referenceUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    }
    return { bundle, referenceProfile, calendarDays: calendar.length, climateToday: today, warning: null }
  } catch (error) {
    const referenceProfile = {
      method: 'reference-layer-v1.0.0',
      primarySource: 'dwd-cdc',
      fallbackSource: 'open-meteo-analysis-proxy',
      status: 'fallback',
      station: current?.data()?.referenceProfile?.station ?? null,
      climateMethod: current?.data()?.referenceProfile?.climateMethod ?? null,
      climateUpdatedAt: current?.data()?.referenceProfile?.climateUpdatedAt ?? null,
      notice: `DWD-Referenz temporaer nicht verfuegbar; Analysis-Proxy aktiv (${error.message}).`,
    }
    if (database && locationRef) {
      await locationRef.set({ referenceProfile, referenceUpdatedAt: FieldValue.serverTimestamp() }, { merge: true })
    }
    return { bundle: null, referenceProfile, calendarDays: 0, climateToday: current?.data()?.climateToday ?? null, warning: error.message }
  }
}

export async function bestReferences(location, dates, referenceLayer, fetchImpl = fetch) {
  const station = referenceLayer?.bundle
    ? stationReferences(referenceLayer.bundle, dates)
    : []
  const stationByDate = new Map(station.map((entry) => [entry.date, entry]))
  const needsFallback = dates.filter((date) => {
    const entry = stationByDate.get(date)
    return !entry || !Number.isFinite(entry.temperatureMean) || !Number.isFinite(entry.precipitationSum)
  })
  const fallback = needsFallback.length
    ? await loadReferenceDays(location, needsFallback, fetchImpl)
    : []
  const fallbackByDate = new Map(fallback.map((entry) => [entry.date, entry]))

  return dates.flatMap((date) => {
    const measured = stationByDate.get(date)
    const proxy = fallbackByDate.get(date)
    if (!measured) return proxy ? [proxy] : []
    const temperatureFromStation = Number.isFinite(measured.temperatureMean)
    const precipitationFromStation = Number.isFinite(measured.precipitationSum)
    const temperatureMean = temperatureFromStation ? measured.temperatureMean : proxy?.temperatureMean
    const precipitationSum = precipitationFromStation ? measured.precipitationSum : proxy?.precipitationSum
    if (!Number.isFinite(temperatureMean) || !Number.isFinite(precipitationSum)) return []
    return [{
      ...proxy,
      ...measured,
      source: temperatureFromStation && precipitationFromStation
        ? measured.source
        : `${measured.source}+open-meteo-analysis-proxy`,
      kind: 'station-observation',
      temperatureMean,
      precipitationSum,
      variableSources: {
        temperature: temperatureFromStation ? measured.source : proxy?.source,
        precipitation: precipitationFromStation ? measured.source : proxy?.source,
      },
    }]
  })
}
