import type {
  EnsembleDay,
  EnsembleModel,
  FusionDay,
  Outlook,
  OutlookFusion,
  OutlookModel,
  OutlookView,
} from '../../types/outlook'
import {
  cached,
  ENSEMBLE_URL,
  fetchJSON,
  FORECAST_URL,
  quantile,
  queryURL,
  round1,
  SEASONAL_URL,
} from './shared'

type NullableSeries = Array<number | null>
type DailyPayload = Record<string, string[] | NullableSeries>

interface DynamicResponse {
  daily: DailyPayload
}

async function fetchDaily(
  endpoint: string,
  values: Record<string, string | number>,
  signal?: AbortSignal,
) {
  const response = await fetchJSON<DynamicResponse>(queryURL(endpoint, values), signal)
  if (!response.daily) throw new Error('Open-Meteo liefert keine Tagesdaten.')
  return response.daily
}

function numberSeries(daily: DailyPayload, key: string): NullableSeries {
  const values = daily[key]
  return Array.isArray(values) ? values as NullableSeries : []
}

function dates(daily: DailyPayload) {
  return daily.time as string[] ?? []
}

async function modelOutlook(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<Outlook> {
  const daily = await fetchDaily(FORECAST_URL, {
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    models: 'icon_seamless,ecmwf_ifs025,ecmwf_aifs025_single,gfs_seamless',
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    forecast_days: 16,
    timezone: 'auto',
  }, signal)
  const definitions = [
    { id: 'icon', name: 'DWD ICON', short: 'ICON', suffix: 'icon_seamless' },
    { id: 'ifs', name: 'ECMWF IFS', short: 'IFS', suffix: 'ecmwf_ifs025' },
    { id: 'aifs', name: 'ECMWF AIFS', short: 'AIFS', suffix: 'ecmwf_aifs025_single' },
    { id: 'gfs', name: 'NOAA GFS', short: 'GFS', suffix: 'gfs_seamless' },
  ]
  const warnings: string[] = []
  const models = definitions.flatMap<OutlookModel>((definition) => {
    const minimums = numberSeries(daily, `temperature_2m_min_${definition.suffix}`)
    const maximums = numberSeries(daily, `temperature_2m_max_${definition.suffix}`)
    if (!minimums.length || !maximums.length) {
      warnings.push(`${definition.short} nicht verfügbar`)
      return []
    }
    const probabilities = numberSeries(daily, `precipitation_probability_max_${definition.suffix}`)
    const precipitation = numberSeries(daily, `precipitation_sum_${definition.suffix}`)
    const points = dates(daily).flatMap((date, index) => {
      const temperatureMin = minimums[index]
      const temperatureMax = maximums[index]
      if (temperatureMin === null || temperatureMax === null || temperatureMin === undefined || temperatureMax === undefined) return []
      return [{
        date,
        temperatureMin,
        temperatureMax,
        precipitationProbability: probabilities[index] ?? null,
        precipitation: precipitation[index] ?? 0,
      }]
    })
    return [{
      id: definition.id,
      name: definition.name,
      short: definition.short,
      horizonDays: points.length,
      daily: points,
    }]
  })
  if (models.length < 2) throw new Error('Zu wenige Langfristmodelle sind erreichbar.')
  return {
    mode: 'models',
    horizonDays: 16,
    models,
    notice: 'Die Linien enden an der nativen Reichweite des jeweiligen Modells. Ab Tag 8 sinkt die räumliche Präzision deutlich.',
    warnings,
    refreshedAt: new Date().toISOString(),
    source: 'refresh',
  }
}

function memberSeries(daily: DailyPayload, prefix: string) {
  return Object.keys(daily)
    .filter((key) => key === prefix || key.startsWith(`${prefix}_member`))
    .sort()
    .map((key) => numberSeries(daily, key))
}

function valuesAt(series: NullableSeries[], index: number) {
  return series.flatMap((member) => {
    const value = member[index]
    return value === null || value === undefined ? [] : [value]
  })
}

interface EnsembleDefinition {
  endpoint: string
  model: string
  id: string
  name: string
  short: string
  forecastDays: number
  includeInFusion: boolean
}

interface EnsembleMemberDay {
  date: string
  temperature: number[]
  precipitation: number[]
}

interface EnsembleResult {
  model: EnsembleModel
  members: EnsembleMemberDay[]
  includeInFusion: boolean
}

function weightedQuantile(groups: number[][], probability: number) {
  const usable = groups.filter((group) => group.length > 0)
  if (!usable.length) return 0
  const modelWeight = 1 / usable.length
  const samples = usable.flatMap((group) => {
    const memberWeight = modelWeight / group.length
    return group.map((value) => ({ value, weight: memberWeight }))
  }).sort((a, b) => a.value - b.value)
  const target = Math.max(0, Math.min(1, probability))
  let cumulative = 0
  for (const sample of samples) {
    cumulative += sample.weight
    if (cumulative + Number.EPSILON >= target) return round1(sample.value)
  }
  return round1(samples.at(-1)?.value ?? 0)
}

function balancedProbability(groups: number[][], threshold: number) {
  const usable = groups.filter((group) => group.length > 0)
  if (!usable.length) return 0
  const probability = usable.reduce((sum, group) =>
    sum + group.filter((value) => value >= threshold).length / group.length, 0) / usable.length
  return round1(probability * 100)
}

function buildFusion(results: EnsembleResult[]): OutlookFusion {
  const eligible = results.filter((result) => result.includeInFusion)
  const allDates = [...new Set(eligible.flatMap((result) =>
    result.members.map((day) => day.date),
  ))].sort()
  const daily = allDates.flatMap<FusionDay>((date) => {
    const activeDays = eligible.flatMap((result) => {
      const day = result.members.find((candidate) => candidate.date === date)
      return day?.temperature.length ? [day] : []
    })
    if (!activeDays.length) return []
    const temperatureGroups = activeDays.map((day) => day.temperature)
    const precipitationGroups = activeDays
      .map((day) => day.precipitation)
      .filter((values) => values.length > 0)
    return [{
      date,
      temperatureP10: weightedQuantile(temperatureGroups, 0.1),
      temperatureP25: weightedQuantile(temperatureGroups, 0.25),
      temperatureP50: weightedQuantile(temperatureGroups, 0.5),
      temperatureP75: weightedQuantile(temperatureGroups, 0.75),
      temperatureP90: weightedQuantile(temperatureGroups, 0.9),
      precipitationP10: weightedQuantile(precipitationGroups, 0.1),
      precipitationP50: weightedQuantile(precipitationGroups, 0.5),
      precipitationP90: weightedQuantile(precipitationGroups, 0.9),
      rainProbability1mm: balancedProbability(precipitationGroups, 1),
      rainProbability10mm: balancedProbability(precipitationGroups, 10),
      modelCount: activeDays.length,
      memberCount: temperatureGroups.reduce((sum, values) => sum + values.length, 0),
    }]
  })
  return {
    method: 'equal-model-weighted-empirical',
    daily,
    notice: 'Jedes verfügbare Kurz- und Mittelfristmodell erhält pro Tag dasselbe Gewicht; seine Mitglieder teilen sich dieses Gewicht. Die Ereigniswerte sind rohe, modellbalancierte Ensemble-Wahrscheinlichkeiten und noch nicht historisch kalibriert. EC46 bleibt wegen seiner gröberen Skala eine separate Langfrist-Referenz.',
  }
}

async function ensembleModel(
  definition: EnsembleDefinition,
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<EnsembleResult> {
  const daily = await fetchDaily(definition.endpoint, {
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    models: definition.model,
    daily: 'temperature_2m_mean,precipitation_sum',
    forecast_days: definition.forecastDays,
    timezone: 'auto',
  }, signal)
  const temperatures = memberSeries(daily, 'temperature_2m_mean')
  const precipitation = memberSeries(daily, 'precipitation_sum')
  if (!temperatures.length) throw new Error(`${definition.short} liefert keine Ensembleläufe.`)
  const members = dates(daily).flatMap<EnsembleMemberDay>((date, index) => {
    const temperatureValues = valuesAt(temperatures, index)
    if (!temperatureValues.length) return []
    return [{
      date,
      temperature: temperatureValues,
      precipitation: valuesAt(precipitation, index),
    }]
  })
  const points = members.map<EnsembleDay>((day) => ({
    date: day.date,
    temperatureMedian: round1(quantile(day.temperature, 0.5)),
    temperatureP10: round1(quantile(day.temperature, 0.1)),
    temperatureP90: round1(quantile(day.temperature, 0.9)),
    precipitationMedian: round1(quantile(day.precipitation, 0.5)),
    precipitationP10: round1(quantile(day.precipitation, 0.1)),
    precipitationP90: round1(quantile(day.precipitation, 0.9)),
  }))
  return {
    model: {
      id: definition.id,
      name: definition.name,
      short: definition.short,
      memberCount: temperatures.length,
      daily: points,
    },
    members,
    includeInFusion: definition.includeInFusion,
  }
}

async function ensembleOutlook(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<Outlook> {
  const definitions: EnsembleDefinition[] = [
    { endpoint: ENSEMBLE_URL, model: 'dwd_icon_eu_eps', id: 'icon-eu', name: 'DWD ICON-EU EPS', short: 'ICON-EU', forecastDays: 5, includeInFusion: true },
    { endpoint: ENSEMBLE_URL, model: 'ecmwf_ifs025_ensemble', id: 'ifs-ens', name: 'ECMWF IFS ENS', short: 'IFS ENS', forecastDays: 15, includeInFusion: true },
    { endpoint: ENSEMBLE_URL, model: 'ecmwf_aifs025_ensemble', id: 'aifs-ens', name: 'ECMWF AIFS ENS', short: 'AIFS ENS', forecastDays: 15, includeInFusion: true },
    { endpoint: ENSEMBLE_URL, model: 'ncep_gefs05', id: 'gefs', name: 'NOAA GEFS 0.5°', short: 'GEFS', forecastDays: 30, includeInFusion: true },
    { endpoint: ENSEMBLE_URL, model: 'google_weathernext2_ensemble', id: 'weathernext2', name: 'Google WeatherNext 2', short: 'WN2', forecastDays: 15, includeInFusion: true },
    { endpoint: SEASONAL_URL, model: 'ecmwf_ec46', id: 'ec46', name: 'ECMWF EC46', short: 'EC46', forecastDays: 30, includeInFusion: false },
  ]
  const outcomes = await Promise.allSettled(definitions.map((definition) =>
    ensembleModel(
      definition,
      latitude,
      longitude,
      signal,
    ),
  ))
  const successful = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? [outcome.value] : [])
  const warnings = outcomes.flatMap((outcome, index) =>
    outcome.status === 'rejected' ? [`${definitions[index].short} nicht verfügbar`] : [],
  )
  if (!successful.length) throw new Error('Die Ensemblemodelle sind momentan nicht erreichbar.')
  const fusion = buildFusion(successful)
  return {
    mode: 'ensemble',
    horizonDays: fusion.daily.length,
    ensembles: successful.map((result) => result.model),
    fusion,
    notice: 'P10 bis P90 markieren den modellierten Wahrscheinlichkeitsraum. Mit wachsendem Horizont sinken Modellzahl und räumliche Präzision.',
    warnings,
    refreshedAt: new Date().toISOString(),
    source: 'refresh',
  }
}

export function getBrowserOutlook(
  view: OutlookView,
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
) {
  return cached(
    `outlook:v2:${view}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
    30 * 60_000,
    () => view === '16'
      ? modelOutlook(latitude, longitude, signal)
      : ensembleOutlook(latitude, longitude, signal),
  )
}
