import { unzipSync } from 'fflate'
import { round } from './fusion.mjs'

const BASE = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/daily/kl'
const CATALOG_URL = `${BASE}/recent/KL_Tageswerte_Beschreibung_Stationen.txt`
const HISTORICAL_URL = `${BASE}/historical/`

export const DWD_REFERENCE_SOURCE = 'dwd-cdc'

function decode(bytes) {
  return new TextDecoder('windows-1252').decode(bytes)
}

async function fetchBytes(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: '*/*', 'User-Agent': 'ISOBAR-collector/0.3' },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`DWD HTTP ${response.status}: ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

async function fetchText(url, fetchImpl) {
  return decode(await fetchBytes(url, fetchImpl))
}

function numeric(value) {
  const parsed = Number(String(value ?? '').trim().replace(',', '.'))
  return Number.isFinite(parsed) && parsed > -900 ? parsed : null
}

function isoDate(value) {
  const digits = String(value ?? '').trim()
  return /^\d{8}$/.test(digits)
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    : null
}

export function parseStationCatalog(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*(\d{5})\s+(\d{8})\s+(\d{8})\s+(-?\d+)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(.+)$/)
    if (!match) return []
    const remainder = match[7].trim()
    const name = remainder.split(/\s{2,}/)[0]?.trim() || `DWD ${match[1]}`
    return [{
      id: match[1],
      startDate: isoDate(match[2]),
      endDate: isoDate(match[3]),
      elevation: Number(match[4]),
      latitude: Number(match[5]),
      longitude: Number(match[6]),
      name,
    }]
  })
}

function radians(value) {
  return value * Math.PI / 180
}

export function distanceKm(left, right) {
  const latitude = radians(right.latitude - left.latitude)
  const longitude = radians(right.longitude - left.longitude)
  const a = Math.sin(latitude / 2) ** 2 +
    Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitude / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function selectStation(location, stations) {
  const configured = location.dwdStationId
    ? stations.find((station) => station.id === String(location.dwdStationId).padStart(5, '0'))
    : null
  const candidates = configured ? [configured] : stations
  const ranked = candidates.map((station) => {
    const distance = distanceKm(location, station)
    const elevationDifference = Number.isFinite(location.elevation)
      ? Math.abs(location.elevation - station.elevation)
      : null
    return {
      ...station,
      distanceKm: round(distance, 1),
      elevationDifference: Number.isFinite(elevationDifference) ? round(elevationDifference, 0) : null,
      selectionScore: distance + (elevationDifference ?? 0) * 0.04,
    }
  }).sort((left, right) => left.selectionScore - right.selectionScore)
  if (!ranked.length) throw new Error('Keine geeignete DWD-Klimastation gefunden.')
  const { selectionScore: _selectionScore, ...station } = ranked[0]
  return station
}

function archiveText(bytes) {
  const files = unzipSync(bytes)
  const entry = Object.entries(files).find(([name]) => /produkt_.*\.txt$/i.test(name))
  if (!entry) throw new Error('DWD-Archiv enthaelt keine Produktdatei.')
  return decode(entry[1])
}

export function parseDailyObservations(text, qualityStatus = 'provisional') {
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const headers = lines[0].split(';').map((value) => value.trim())
  return lines.slice(1).flatMap((line) => {
    const cells = line.split(';')
    const row = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim()]))
    const date = isoDate(row.MESS_DATUM)
    const temperatureMean = numeric(row.TMK)
    const precipitationSum = numeric(row.RSK)
    if (!date || (!Number.isFinite(temperatureMean) && !Number.isFinite(precipitationSum))) return []
    return [{
      date,
      source: DWD_REFERENCE_SOURCE,
      kind: 'station-observation',
      qualityStatus,
      qualityLevel: numeric(row.QN_4),
      temperatureMean,
      temperatureMin: numeric(row.TNK),
      temperatureMax: numeric(row.TXK),
      precipitationSum,
      sunshineHours: numeric(row.SDK),
    }]
  })
}

async function historicalArchiveName(stationId, fetchImpl) {
  const listing = await fetchText(HISTORICAL_URL, fetchImpl)
  const expression = new RegExp(`tageswerte_KL_${stationId}_[0-9]{8}_[0-9]{8}_hist\\.zip`, 'g')
  const names = [...new Set(listing.match(expression) ?? [])].sort()
  if (!names.length) throw new Error(`Kein historisches DWD-Archiv fuer Station ${stationId}.`)
  return names.at(-1)
}

function mergeObservations(historical, recent) {
  const byDate = new Map()
  historical.forEach((entry) => byDate.set(entry.date, entry))
  recent.forEach((entry) => byDate.set(entry.date, entry))
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date))
}

export async function loadDwdObservations(
  location,
  { fetchImpl = fetch, includeHistorical = false } = {},
) {
  const stations = parseStationCatalog(await fetchText(CATALOG_URL, fetchImpl))
  const recentListing = await fetchText(`${BASE}/recent/`, fetchImpl)
  const availableStationIds = new Set(
    [...recentListing.matchAll(/tageswerte_KL_(\d{5})_akt\.zip/g)].map((match) => match[1]),
  )
  for (let index = stations.length - 1; index >= 0; index -= 1) {
    if (!availableStationIds.has(stations[index].id)) stations.splice(index, 1)
  }
  const station = selectStation(location, stations)
  const recentName = `tageswerte_KL_${station.id}_akt.zip`
  const recentBytes = await fetchBytes(`${BASE}/recent/${recentName}`, fetchImpl)
  const recent = parseDailyObservations(archiveText(recentBytes), 'provisional')
  let historical = []
  if (includeHistorical) {
    const name = await historicalArchiveName(station.id, fetchImpl)
    const bytes = await fetchBytes(`${HISTORICAL_URL}${name}`, fetchImpl)
    historical = parseDailyObservations(archiveText(bytes), 'final')
  }
  return {
    source: DWD_REFERENCE_SOURCE,
    station: {
      ...station,
      attribution: 'Deutscher Wetterdienst (DWD), Climate Data Center',
      license: 'CC BY 4.0',
      datasetUrl: BASE,
    },
    recent,
    historical,
    observations: mergeObservations(historical, recent),
  }
}

export function stationReferences(bundle, dates) {
  const wanted = new Set(dates)
  return bundle.recent.filter((entry) => wanted.has(entry.date)).map((entry) => ({
    date: entry.date,
    source: entry.source,
    kind: entry.kind,
    temperatureMean: entry.temperatureMean,
    precipitationSum: entry.precipitationSum,
    temperatureMin: entry.temperatureMin,
    temperatureMax: entry.temperatureMax,
    sunshineHours: entry.sunshineHours,
    qualityLevel: entry.qualityLevel,
    qualityStatus: entry.qualityStatus,
    station: bundle.station,
  }))
}
