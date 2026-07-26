import type {
  DailyPoint,
  Forecast,
  LocationResult,
  ModelForecast,
  ModelSummary,
} from '../../types/weather'
import {
  at,
  cached,
  fetchJSON,
  FORECAST_URL,
  GEOCODING_URL,
  median,
  queryURL,
  round1,
} from './shared'

interface RawForecast {
  timezone: string
  current: {
    time: string
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    precipitation: number
    weather_code: number
    surface_pressure: number
    wind_speed_10m: number
    wind_direction_10m: number
    wind_gusts_10m: number
  }
  hourly: {
    time: string[]
    temperature_2m: number[]
    precipitation_probability: number[]
    precipitation: number[]
    wind_speed_10m: number[]
    wind_gusts_10m: number[]
  }
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    precipitation_probability_max: number[]
    precipitation_sum: number[]
    wind_speed_10m_max: number[]
    wind_gusts_10m_max: number[]
    sunrise: string[]
    sunset: string[]
  }
}

const modelDefinitions = [
  { id: 'icon_seamless', label: 'ICON' },
  { id: 'ecmwf_ifs025', label: 'IFS' },
  { id: 'gfs_seamless', label: 'GFS' },
] as const

function modelURL(latitude: number, longitude: number, model: string) {
  return queryURL(FORECAST_URL, {
    latitude: latitude.toFixed(5),
    longitude: longitude.toFixed(5),
    models: model,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    hourly: 'temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset',
    timezone: 'auto',
    forecast_days: 10,
  })
}

function normalizeModel(raw: RawForecast, id: string, label: string): ModelForecast {
  return {
    id,
    label,
    current: {
      time: raw.current.time,
      temperature: raw.current.temperature_2m,
      apparentTemperature: raw.current.apparent_temperature,
      humidity: raw.current.relative_humidity_2m,
      pressure: raw.current.surface_pressure,
      precipitation: raw.current.precipitation,
      windSpeed: raw.current.wind_speed_10m,
      windGusts: raw.current.wind_gusts_10m,
      windDirection: raw.current.wind_direction_10m,
      weatherCode: raw.current.weather_code,
    },
    hourly: raw.hourly.time.map((time, index) => ({
      time,
      temperature: at(raw.hourly.temperature_2m, index, 0),
      precipitationProbability: at(raw.hourly.precipitation_probability, index, 0),
      precipitation: at(raw.hourly.precipitation, index, 0),
      windSpeed: at(raw.hourly.wind_speed_10m, index, 0),
      windGusts: at(raw.hourly.wind_gusts_10m, index, 0),
    })),
    daily: raw.daily.time.map((date, index) => ({
      date,
      weatherCode: at(raw.daily.weather_code, index, 0),
      temperatureMax: at(raw.daily.temperature_2m_max, index, 0),
      temperatureMin: at(raw.daily.temperature_2m_min, index, 0),
      precipitationProbability: at(raw.daily.precipitation_probability_max, index, 0),
      precipitation: at(raw.daily.precipitation_sum, index, 0),
      windSpeedMax: at(raw.daily.wind_speed_10m_max, index, 0),
      windGustsMax: at(raw.daily.wind_gusts_10m_max, index, 0),
      sunrise: at(raw.daily.sunrise, index, ''),
      sunset: at(raw.daily.sunset, index, ''),
    })),
  }
}

function summarize(models: ModelForecast[]): ModelSummary[] {
  return models.flatMap((model) => {
    const today = model.daily[0]
    if (!today) return []
    return [{
      id: model.id,
      label: model.label,
      todayMax: today.temperatureMax,
      todayMin: today.temperatureMin,
      nextSixHourRain: median(model.hourly.slice(0, 6).map((point) => point.precipitationProbability)),
    }]
  })
}

function mode(values: number[]) {
  const counts = new Map<number, number>()
  let selected = 0
  let best = 0
  values.forEach((value) => {
    const count = (counts.get(value) ?? 0) + 1
    counts.set(value, count)
    if (count > best) {
      selected = value
      best = count
    }
  })
  return selected
}

function consensusDays(models: ModelForecast[]): DailyPoint[] {
  const length = Math.max(...models.map((model) => model.daily.length))
  return Array.from({ length }, (_, index) => {
    const points = models.map((model) => model.daily[index]).filter(Boolean)
    const sample = points[0]
    return {
      ...sample,
      temperatureMax: median(points.map((point) => point.temperatureMax)),
      temperatureMin: median(points.map((point) => point.temperatureMin)),
      precipitationProbability: median(points.map((point) => point.precipitationProbability)),
      precipitation: median(points.map((point) => point.precipitation)),
      windSpeedMax: median(points.map((point) => point.windSpeedMax)),
      windGustsMax: median(points.map((point) => point.windGustsMax)),
      weatherCode: mode(points.map((point) => point.weatherCode)),
    }
  })
}

export async function getBrowserForecast(
  latitude: number,
  longitude: number,
  name: string,
  signal?: AbortSignal,
): Promise<Forecast> {
  return cached(`forecast:${latitude.toFixed(4)}:${longitude.toFixed(4)}:${name}`, 10 * 60_000, async () => {
    const outcomes = await Promise.allSettled(
      modelDefinitions.map(async (definition) => {
        const raw = await fetchJSON<RawForecast>(
          modelURL(latitude, longitude, definition.id),
          signal,
        )
        return { raw, model: normalizeModel(raw, definition.id, definition.label) }
      }),
    )
    const available = outcomes.flatMap((outcome) => outcome.status === 'fulfilled' ? [outcome.value] : [])
    if (!available.length) throw new Error('Die Wettermodelle sind momentan nicht erreichbar.')

    const models = available.map((item) => item.model)
    const summaries = summarize(models)
    const maxes = summaries.map((item) => item.todayMax)
    const mins = summaries.map((item) => item.todayMin)
    const spread = Math.max(...maxes) - Math.min(...maxes)
    return {
      location: name,
      coordinates: { latitude, longitude },
      timezone: available[0].raw.timezone,
      updatedAt: new Date().toISOString(),
      stale: false,
      current: models[0].current,
      models,
      daily: consensusDays(models),
      modelSummaries: summaries,
      consensus: {
        todayMax: median(maxes),
        todayMin: median(mins),
        maxSpread: round1(spread),
        agreement: spread > 4 ? 'niedrig' : spread > 2 ? 'mittel' : 'hoch',
        rainProbability: median(summaries.map((item) => item.nextSixHourRain)),
      },
    }
  })
}

interface GeocodingResponse {
  results?: Array<{
    id: number
    name: string
    admin1?: string
    country: string
    latitude: number
    longitude: number
    timezone: string
  }>
}

export async function searchBrowserLocations(query: string, signal?: AbortSignal): Promise<LocationResult[]> {
  if (query.trim().length < 2) throw new Error('Bitte mindestens zwei Zeichen eingeben.')
  const raw = await fetchJSON<GeocodingResponse>(
    queryURL(GEOCODING_URL, {
      name: query.trim(),
      count: 7,
      language: 'de',
      format: 'json',
    }),
    signal,
  )
  return (raw.results ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    region: item.admin1 ?? '',
    country: item.country,
    latitude: item.latitude,
    longitude: item.longitude,
    timezone: item.timezone,
  }))
}
