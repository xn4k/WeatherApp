import { FieldValue } from '@google-cloud/firestore'
import { round } from './fusion.mjs'

const ENDPOINT = 'https://previous-runs-api.open-meteo.com/v1/forecast'
const REFRESH_MS = 7 * 24 * 60 * 60_000
const PAST_DAYS = 90
const LEADS = Object.freeze([1, 2, 3, 4, 5, 6, 7])
const MODELS = Object.freeze([
  { id: 'icon-eu-deterministic', sourceModel: 'icon_eu', name: 'DWD ICON-EU' },
  { id: 'ifs-deterministic', sourceModel: 'ecmwf_ifs025', name: 'ECMWF IFS' },
  { id: 'gfs-deterministic', sourceModel: 'gfs_seamless', name: 'NOAA GFS' },
])

export const BACKFILL_VERSION = 'previous-runs-shadow-backfill-v1.0.0'

function queryUrl(location, model) {
  const url = new URL(ENDPOINT)
  const variables = LEADS.flatMap((lead) => [
    `temperature_2m_previous_day${lead}`,
    `precipitation_previous_day${lead}`,
  ])
  Object.entries({
    latitude: location.latitude.toFixed(5),
    longitude: location.longitude.toFixed(5),
    models: model.sourceModel,
    hourly: variables.join(','),
    timezone: location.timezone,
    past_days: PAST_DAYS,
    forecast_days: 1,
  }).forEach(([key, value]) => url.searchParams.set(key, String(value)))
  return url
}

function dailyRows(payload, lead) {
  const hourly = payload.hourly ?? {}
  const temperature = hourly[`temperature_2m_previous_day${lead}`] ?? []
  const precipitation = hourly[`precipitation_previous_day${lead}`] ?? []
  const grouped = new Map()
  ;(hourly.time ?? []).forEach((time, index) => {
    const date = String(time).slice(0, 10)
    const row = grouped.get(date) ?? { date, temperatures: [], precipitation: [] }
    if (Number.isFinite(temperature[index])) row.temperatures.push(temperature[index])
    if (Number.isFinite(precipitation[index])) row.precipitation.push(precipitation[index])
    grouped.set(date, row)
  })
  return [...grouped.values()].flatMap((row) => row.temperatures.length ? [{
    date: row.date,
    temperatureMean: round(row.temperatures.reduce((sum, value) => sum + value, 0) / row.temperatures.length, 2),
    precipitationSum: row.precipitation.length
      ? round(row.precipitation.reduce((sum, value) => sum + value, 0), 2)
      : null,
    hourlyTemperatureSamples: row.temperatures.length,
    hourlyPrecipitationSamples: row.precipitation.length,
  }] : [])
}

export async function loadHistoricalModel(location, model, fetchImpl = fetch) {
  const url = queryUrl(location, model)
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ISOBAR-collector/0.4' },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw new Error(`Open-Meteo Previous Runs ${model.name} HTTP ${response.status}`)
  const payload = await response.json()
  return {
    method: BACKFILL_VERSION,
    role: 'research-shadow',
    modelId: model.id,
    sourceModel: model.sourceModel,
    name: model.name,
    pastDays: PAST_DAYS,
    leads: Object.fromEntries(LEADS.map((lead) => [String(lead), dailyRows(payload, lead)])),
    source: 'open-meteo-previous-runs',
    datasetUrl: url.toString(),
    notice: 'Deterministische historische Laeufe dienen nur Research und Vortraining. Modellversionen koennen wechseln; sie ersetzen das Live-Out-of-Sample-Gate nicht.',
  }
}

function needsRefresh(status, now) {
  if (status?.method !== BACKFILL_VERSION || !status?.updatedAt) return true
  const age = now.getTime() - Date.parse(status.updatedAt)
  return !Number.isFinite(age) || age < 0 || age >= REFRESH_MS
}

export async function updateHistoricalBackfill(database, location, { now = new Date(), fetchImpl = fetch } = {}) {
  const locationRef = database.collection('publicWeather').doc(location.id)
  const statusRef = locationRef.collection('researchBackfill').doc('status')
  const current = await statusRef.get()
  if (!needsRefresh(current.data(), now)) return { status: 'current', models: current.data()?.modelCount ?? 0 }
  const outcomes = await Promise.allSettled(MODELS.map((model) => loadHistoricalModel(location, model, fetchImpl)))
  const successful = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? [outcome.value] : [])
  if (!successful.length) return {
    method: BACKFILL_VERSION,
    role: 'research-shadow',
    status: 'unavailable',
    modelCount: 0,
    warnings: outcomes.map((outcome) => outcome.reason?.message ?? 'nicht verfuegbar'),
  }
  const batch = database.batch()
  for (const model of successful) {
    batch.set(locationRef.collection('researchBackfill').doc(model.modelId), {
      ...model,
      storedAt: FieldValue.serverTimestamp(),
    })
  }
  const warnings = outcomes.flatMap((outcome, index) => outcome.status === 'rejected'
    ? [`${MODELS[index].name}: ${outcome.reason?.message ?? 'nicht verfuegbar'}`]
    : [])
  const status = {
    method: BACKFILL_VERSION,
    role: 'research-shadow',
    status: warnings.length ? 'partial' : 'ready',
    updatedAt: now.toISOString(),
    modelCount: successful.length,
    models: successful.map((model) => model.modelId),
    leads: LEADS,
    pastDays: PAST_DAYS,
    warnings,
    notice: successful[0].notice,
  }
  batch.set(statusRef, { ...status, storedAt: FieldValue.serverTimestamp() })
  batch.set(locationRef, { researchBackfill: status }, { merge: true })
  await batch.commit()
  return status
}
