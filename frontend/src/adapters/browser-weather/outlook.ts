import type {
  EnsembleDay,
  EnsembleModel,
  Outlook,
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

async function ensembleModel(
  endpoint: string,
  model: string,
  id: string,
  name: string,
  short: string,
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<EnsembleModel> {
  const daily = await fetchDaily(endpoint, {
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    models: model,
    daily: 'temperature_2m_mean,precipitation_sum',
    forecast_days: 30,
    timezone: 'auto',
  }, signal)
  const temperatures = memberSeries(daily, 'temperature_2m_mean')
  const precipitation = memberSeries(daily, 'precipitation_sum')
  if (!temperatures.length) throw new Error(`${short} liefert keine Ensembleläufe.`)
  const points = dates(daily).flatMap<EnsembleDay>((date, index) => {
    const temperatureValues = valuesAt(temperatures, index)
    if (!temperatureValues.length) return []
    const rainValues = valuesAt(precipitation, index)
    return [{
      date,
      temperatureMedian: quantile(temperatureValues, 0.5),
      temperatureP10: quantile(temperatureValues, 0.1),
      temperatureP90: quantile(temperatureValues, 0.9),
      precipitationMedian: quantile(rainValues, 0.5),
      precipitationP10: quantile(rainValues, 0.1),
      precipitationP90: quantile(rainValues, 0.9),
    }]
  })
  return { id, name, short, memberCount: temperatures.length, daily: points }
}

async function ensembleOutlook(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<Outlook> {
  const definitions = [
    { endpoint: ENSEMBLE_URL, model: 'ncep_gefs05', id: 'gefs', name: 'NOAA GFS Ensemble', short: 'GEFS' },
    { endpoint: SEASONAL_URL, model: 'ecmwf_ec46', id: 'ec46', name: 'ECMWF EC46', short: 'EC46' },
  ]
  const outcomes = await Promise.allSettled(definitions.map((definition) =>
    ensembleModel(
      definition.endpoint,
      definition.model,
      definition.id,
      definition.name,
      definition.short,
      latitude,
      longitude,
      signal,
    ),
  ))
  const ensembles = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? [outcome.value] : [])
  const warnings = outcomes.flatMap((outcome, index) =>
    outcome.status === 'rejected' ? [`${definitions[index].short} nicht verfügbar`] : [],
  )
  if (!ensembles.length) throw new Error('Die Ensemblemodelle sind momentan nicht erreichbar.')
  return {
    mode: 'ensemble',
    horizonDays: 30,
    ensembles,
    notice: 'Das Band zeigt P10 bis P90 der Ensembleläufe. Es ist ein Wahrscheinlichkeitsraum, keine garantierte Tagesprognose.',
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
    `outlook:${view}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`,
    30 * 60_000,
    () => view === '16'
      ? modelOutlook(latitude, longitude, signal)
      : ensembleOutlook(latitude, longitude, signal),
  )
}
