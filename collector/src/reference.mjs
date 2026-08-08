const HISTORICAL_FORECAST_URL = 'https://historical-forecast-api.open-meteo.com/v1/forecast'

export const REFERENCE_SOURCE = 'open-meteo-historical-forecast-best-match'
export const REFERENCE_KIND = 'analysis-proxy'

function localISODate(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const valueOf = (type) => parts.find((part) => part.type === type)?.value
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`
}

export function completedReferenceDates(timezone, now = new Date(), days = 7) {
  return Array.from({ length: days }, (_, index) => (
    localISODate(new Date(now.getTime() - (index + 1) * 86_400_000), timezone)
  )).reverse()
}

function queryURL(location, startDate, endDate) {
  const url = new URL(HISTORICAL_FORECAST_URL)
  const parameters = {
    latitude: location.latitude.toFixed(5),
    longitude: location.longitude.toFixed(5),
    start_date: startDate,
    end_date: endDate,
    daily: 'temperature_2m_mean,precipitation_sum',
    timezone: location.timezone,
  }
  Object.entries(parameters).forEach(([key, value]) => url.searchParams.set(key, value))
  return url
}

function finiteAt(values, index) {
  const value = values?.[index]
  return Number.isFinite(value) ? value : null
}

export function parseReferenceDays(payload, fetchedAt = new Date().toISOString()) {
  const dates = payload?.daily?.time
  if (!Array.isArray(dates)) throw new Error('Referenzanalyse liefert keine Tagesdaten.')

  return dates.flatMap((date, index) => {
    const temperatureMean = finiteAt(payload.daily.temperature_2m_mean, index)
    const precipitationSum = finiteAt(payload.daily.precipitation_sum, index)
    if (temperatureMean === null || precipitationSum === null) return []
    return [{
      date,
      temperatureMean,
      precipitationSum,
      source: REFERENCE_SOURCE,
      kind: REFERENCE_KIND,
      fetchedAt,
    }]
  })
}

export async function loadReferenceDays(
  location,
  dates = completedReferenceDates(location.timezone),
  fetchImpl = fetch,
) {
  if (!dates.length) return []
  const response = await fetchImpl(queryURL(location, dates[0], dates.at(-1)), {
    headers: { Accept: 'application/json', 'User-Agent': 'ISOBAR-collector/0.2' },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`Open-Meteo Referenzanalyse HTTP ${response.status}`)
  const requested = new Set(dates)
  return parseReferenceDays(await response.json())
    .filter((day) => requested.has(day.date))
}
