import { publicCalibration } from './calibration.mjs'
import { summarizeModel } from './fusion.mjs'
import { buildSkillFusion } from './skill-fusion.mjs'
import { buildShadowEvidence } from './evidence-engine.mjs'
import { loadMosmix } from './mosmix.mjs'
import { buildForecastAnalysis } from './forecast-analysis.mjs'
import { assessDataQuality } from './data-quality.mjs'
import { buildCalibrationChallenger } from './calibration-challenger.mjs'

const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'
const SEASONAL_URL = 'https://seasonal-api.open-meteo.com/v1/seasonal'

export const MODEL_DEFINITIONS = Object.freeze([
  { endpoint: ENSEMBLE_URL, model: 'dwd_icon_eu_eps', id: 'icon-eu', name: 'DWD ICON-EU EPS', short: 'ICON-EU', forecastDays: 5, includeInFusion: true },
  { endpoint: ENSEMBLE_URL, model: 'ecmwf_ifs025_ensemble', id: 'ifs-ens', name: 'ECMWF IFS ENS', short: 'IFS ENS', forecastDays: 15, includeInFusion: true },
  { endpoint: ENSEMBLE_URL, model: 'ecmwf_aifs025_ensemble', id: 'aifs-ens', name: 'ECMWF AIFS ENS', short: 'AIFS ENS', forecastDays: 15, includeInFusion: true },
  { endpoint: ENSEMBLE_URL, model: 'ncep_gefs05', id: 'gefs', name: 'NOAA GEFS 0.5°', short: 'GEFS', forecastDays: 30, includeInFusion: true },
  { endpoint: ENSEMBLE_URL, model: 'google_weathernext2_ensemble', id: 'weathernext2', name: 'Google WeatherNext 2', short: 'WN2', forecastDays: 15, includeInFusion: true },
  { endpoint: SEASONAL_URL, model: 'ecmwf_ec46', id: 'ec46', name: 'ECMWF EC46', short: 'EC46', forecastDays: 30, includeInFusion: false },
])

function queryURL(endpoint, values) {
  const url = new URL(endpoint)
  Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, String(value)))
  return url
}

async function fetchJSON(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ISOBAR-collector/0.1' },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`Open-Meteo HTTP ${response.status}`)
  return response.json()
}

function numberSeries(daily, key) {
  const values = daily[key]
  return Array.isArray(values) ? values : []
}

function memberSeries(daily, prefix) {
  return Object.keys(daily)
    .filter((key) => key === prefix || key.startsWith(`${prefix}_member`))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))
    .map((key) => numberSeries(daily, key))
}

function valuesAt(series, index) {
  return series.flatMap((member) => Number.isFinite(member[index]) ? [member[index]] : [])
}

export function parseEnsembleDaily(definition, daily) {
  const dates = Array.isArray(daily.time) ? daily.time : []
  const temperatures = memberSeries(daily, 'temperature_2m_mean')
  const precipitation = memberSeries(daily, 'precipitation_sum')
  const apparentTemperatures = memberSeries(daily, 'apparent_temperature_mean')
  const apparentTemperatureMaximums = memberSeries(daily, 'apparent_temperature_max')
  const relativeHumidity = memberSeries(daily, 'relative_humidity_2m_mean')
  const dewPoints = memberSeries(daily, 'dew_point_2m_mean')
  const windSpeeds = memberSeries(daily, 'wind_speed_10m_mean')
  if (!temperatures.length) throw new Error(`${definition.short} liefert keine Ensembleläufe.`)

  const parsedDays = dates.flatMap((date, index) => {
    const temperatureMembers = valuesAt(temperatures, index)
    if (!temperatureMembers.length) return []
    return [{
      date,
      temperatureMembers,
      precipitationMembers: valuesAt(precipitation, index),
      apparentTemperatureMembers: valuesAt(apparentTemperatures, index),
      apparentTemperatureMaxMembers: valuesAt(apparentTemperatureMaximums, index),
      relativeHumidityMembers: valuesAt(relativeHumidity, index),
      dewPointMembers: valuesAt(dewPoints, index),
      windSpeedMembers: valuesAt(windSpeeds, index),
    }]
  })
  if (!parsedDays.length) throw new Error(`${definition.short} liefert keine nutzbaren Tage.`)

  return {
    id: definition.id,
    name: definition.name,
    short: definition.short,
    sourceModel: definition.model,
    includeInFusion: definition.includeInFusion,
    memberCount: temperatures.length,
    daily: parsedDays,
  }
}

export async function loadModel(definition, location, fetchImpl = fetch) {
  const dailyVariables = [
    'temperature_2m_mean',
    'precipitation_sum',
    'apparent_temperature_mean',
    'apparent_temperature_max',
    'relative_humidity_2m_mean',
    'dew_point_2m_mean',
    'wind_speed_10m_mean',
  ].join(',')
  const url = queryURL(definition.endpoint, {
    latitude: location.latitude.toFixed(5),
    longitude: location.longitude.toFixed(5),
    models: definition.model,
    daily: dailyVariables,
    forecast_days: definition.forecastDays,
    timezone: location.timezone,
  })
  const payload = await fetchJSON(url, fetchImpl)
  if (!payload.daily) throw new Error(`${definition.short} liefert keine Tagesdaten.`)
  return parseEnsembleDaily(definition, payload.daily)
}

export async function collectOpenMeteo(location, fetchImpl = fetch, calibration = null) {
  const outcomes = await Promise.allSettled(MODEL_DEFINITIONS.map((definition) => (
    loadModel(definition, location, fetchImpl)
  )))

  // One deliberately sequential retry avoids a transient provider failure from
  // removing a whole model while keeping the initial request fan-out fast.
  for (let index = 0; index < outcomes.length; index += 1) {
    if (outcomes[index].status === 'fulfilled') continue
    try {
      outcomes[index] = { status: 'fulfilled', value: await loadModel(MODEL_DEFINITIONS[index], location, fetchImpl) }
    } catch (reason) {
      outcomes[index] = { status: 'rejected', reason }
    }
  }

  const models = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? [outcome.value] : [])
  const warnings = outcomes.flatMap((outcome, index) => (
    outcome.status === 'rejected' ? [`${MODEL_DEFINITIONS[index].short} nicht verfügbar`] : []
  ))
  const fusionModels = models.filter((model) => model.includeInFusion)
  if (fusionModels.length < 2) throw new Error('Zu wenige Ensemblemodelle für eine belastbare Fusion.')

  const fusion = buildSkillFusion(models, calibration)
  const evidence = buildShadowEvidence(models, fusion, calibration)
  let mosmix = null
  try {
    mosmix = await loadMosmix(location, fetchImpl)
  } catch (error) {
    warnings.push(`DWD MOSMIX nicht verfuegbar: ${error.message}`)
  }
  const analysis = buildForecastAnalysis(models)
  const dataQuality = assessDataQuality(models, MODEL_DEFINITIONS, warnings, new Date().toISOString())
  const calibrationChallenger = buildCalibrationChallenger(
    fusion,
    calibration?.diagnostics,
    new Date().toISOString(),
    location.timezone,
  )
  return {
    models,
    outlook: {
      mode: 'ensemble',
      horizonDays: fusion.daily.length,
      ensembles: models.map(summarizeModel),
      fusion,
      evidence,
      challengers: mosmix ? { mosmix } : {},
      analysis,
      dataQuality,
      calibration: calibration ? publicCalibration(calibration) : null,
      notice: 'P10 bis P90 markieren den modellierten Wahrscheinlichkeitsraum. Mit wachsendem Horizont sinken Modellzahl und räumliche Präzision.',
      calibrationChallenger,
      warnings,
      refreshedAt: new Date().toISOString(),
      source: 'firebase',
    },
  }
}
