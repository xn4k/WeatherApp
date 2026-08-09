import { unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import { round } from './fusion.mjs'

const BASE = 'https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations'

function array(value) {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function values(value) {
  return String(value ?? '').trim().split(/\s+/).map((entry) => {
    if (!entry || entry === '-') return null
    const parsed = Number(entry)
    return Number.isFinite(parsed) ? parsed : null
  })
}

function localDate(value, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

function average(entries) {
  const finite = entries.filter(Number.isFinite)
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null
}

function rounded(value) {
  return Number.isFinite(value) ? round(value, 2) : null
}

export function parseMosmixKml(xml, station, timezone) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: false,
  })
  const document = parser.parse(xml)?.kml?.Document
  const definition = document?.ExtendedData?.ProductDefinition
  const placemark = array(document?.Placemark)[0]
  if (!definition || !placemark) throw new Error('MOSMIX-KML hat kein erwartetes Produktformat.')
  const timeSteps = array(definition.ForecastTimeSteps?.TimeStep).map(String)
  const forecasts = Object.fromEntries(array(placemark.ExtendedData?.Forecast).map((forecast) => [
    forecast['@_elementName'],
    values(forecast.value),
  ]))
  const temperatures = forecasts.TTT ?? []
  const precipitation = forecasts.RR1c ?? []
  if (!timeSteps.length || !temperatures.length) throw new Error('MOSMIX liefert keine Temperatur-Zeitreihe.')

  const grouped = new Map()
  timeSteps.forEach((time, index) => {
    const date = localDate(time, timezone)
    const day = grouped.get(date) ?? { date, temperatures: [], precipitation: [] }
    const kelvin = temperatures[index]
    if (Number.isFinite(kelvin)) day.temperatures.push(kelvin - 273.15)
    const rain = precipitation[index]
    if (Number.isFinite(rain) && rain >= 0) day.precipitation.push(rain)
    grouped.set(date, day)
  })

  const daily = [...grouped.values()].flatMap((day) => {
    if (!day.temperatures.length) return []
    return [{
      date: day.date,
      temperatureMean: rounded(average(day.temperatures)),
      temperatureMin: rounded(Math.min(...day.temperatures)),
      temperatureMax: rounded(Math.max(...day.temperatures)),
      precipitationSum: rounded(day.precipitation.reduce((sum, value) => sum + value, 0)),
    }]
  })
  const referencedModels = array(definition.ReferencedModel?.Model).map((model) => model['@_name']).filter(Boolean)
  return {
    method: 'dwd-mosmix-challenger-v1.0.0',
    id: 'dwd-mosmix',
    name: 'DWD MOSMIX',
    role: 'challenger',
    source: 'dwd-open-data',
    station,
    issuedAt: String(definition.IssueTime),
    referencedModels,
    horizonDays: daily.length,
    daily,
    notice: 'MOSMIX ist eine stationsbezogene, statistisch optimierte DWD-Punktprognose aus ICON und IFS und bleibt ausserhalb der ISOBAR-Fusion.',
  }
}

export async function loadMosmix(location, fetchImpl = fetch) {
  const stationId = location.mosmixStationId
  if (!stationId) return null
  const url = `${BASE}/${stationId}/kml/MOSMIX_L_LATEST_${stationId}.kmz`
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/zip', 'User-Agent': 'ISOBAR-collector/0.3' },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`DWD MOSMIX HTTP ${response.status}`)
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const entry = Object.entries(archive).find(([name]) => name.toLowerCase().endsWith('.kml'))
  if (!entry) throw new Error('MOSMIX-KMZ enthaelt keine KML-Datei.')
  // The product declares ISO-8859-1. Decode explicitly so station metadata is not corrupted.
  const xml = new TextDecoder('windows-1252').decode(entry[1])
  return parseMosmixKml(xml, {
    id: String(stationId),
    name: location.mosmixStationName ?? `MOSMIX ${stationId}`,
    attribution: 'Deutscher Wetterdienst (DWD), MOSMIX',
    license: 'CC BY 4.0',
    datasetUrl: url,
  }, location.timezone)
}
