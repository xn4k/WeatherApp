import { gunzipSync } from 'node:zlib'
import { round } from './fusion.mjs'

const RECENT_BASE = 'https://opendata.dwd.de/climate_environment/CDC/grids_germany/daily/radolan/recent/bin'
export const RADOLAN_METHOD = 'dwd-radolan-sf-grid-v1.0.0'

function offsetHours(date, timezone) {
  const value = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(`${date}T12:00:00Z`))
    .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00'
  const match = value.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!match) return 0
  return (match[1] === '-' ? -1 : 1) * (Number(match[2]) + Number(match[3]) / 60)
}

function radolanTimestamp(date, timezone) {
  const localEnd = Date.parse(`${date}T23:50:00Z`)
  const utc = new Date(localEnd - offsetHours(date, timezone) * 3_600_000)
  const year = String(utc.getUTCFullYear()).slice(-2)
  const month = String(utc.getUTCMonth() + 1).padStart(2, '0')
  const day = String(utc.getUTCDate()).padStart(2, '0')
  const hour = String(utc.getUTCHours()).padStart(2, '0')
  const minute = String(utc.getUTCMinutes()).padStart(2, '0')
  return `${year}${month}${day}${hour}${minute}`
}

function gridPoint(latitude, longitude) {
  const radians = (value) => value * Math.PI / 180
  const radius = 6370.04
  const referenceLatitude = radians(60)
  const longitudeDifference = radians(longitude - 10)
  const scale = (1 + Math.sin(referenceLatitude)) / (1 + Math.sin(radians(latitude)))
  const x = radius * scale * Math.cos(radians(latitude)) * Math.sin(longitudeDifference)
  const y = -radius * scale * Math.cos(radians(latitude)) * Math.cos(longitudeDifference)
  return {
    column: Math.round(x - (-523.4621669218559)),
    row: Math.round(y - (-4658.644724265572)),
  }
}

export function decodeRadolan(buffer, latitude, longitude, radius = 1) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  const headerEnd = bytes.indexOf(3)
  if (headerEnd < 0) throw new Error('RADOLAN-Header endet nicht mit ETX.')
  const header = bytes.subarray(0, headerEnd).toString('latin1')
  const grid = header.match(/GP\s*(\d+)x(\d+)/)
  if (!grid) throw new Error('RADOLAN-Grid fehlt im Header.')
  const rows = Number(grid[1])
  const columns = Number(grid[2])
  const precisionToken = header.match(/PR\s*([^\s]+)/)?.[1] ?? 'E-01'
  const precision = Number(`1${precisionToken}`)
  const data = bytes.subarray(headerEnd + 1)
  if (data.length < rows * columns * 2) throw new Error('RADOLAN-Datenblock ist unvollstaendig.')
  const point = gridPoint(latitude, longitude)
  const values = []
  for (let row = point.row - radius; row <= point.row + radius; row += 1) {
    for (let column = point.column - radius; column <= point.column + radius; column += 1) {
      if (row < 0 || row >= rows || column < 0 || column >= columns) continue
      const raw = data.readUInt16LE(2 * (row * columns + column))
      if (raw & 0x2000) continue
      const sign = raw & 0x4000 ? -1 : 1
      const value = sign * (raw & 0x0fff) * precision
      if (Number.isFinite(value) && value >= 0) values.push(value)
    }
  }
  if (!values.length) throw new Error('RADOLAN-Pixel ist nicht verfuegbar.')
  return {
    precipitationSum: round(values.reduce((sum, value) => sum + value, 0) / values.length, 2),
    pixelCount: values.length,
    gridPoint: point,
    header: {
      product: header.slice(0, 2),
      rows,
      columns,
      precision,
      version: header.match(/VS\s*([^\s]+)/)?.[1] ?? null,
    },
  }
}

async function fetchBytes(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/gzip', 'User-Agent': 'ISOBAR-collector/0.4' },
    signal: AbortSignal.timeout(45_000),
  })
  if (!response.ok) throw new Error(`DWD RADOLAN HTTP ${response.status}`)
  return Buffer.from(await response.arrayBuffer())
}

export async function loadRadolanReferences(location, dates, fetchImpl = fetch) {
  if (!dates.length) return []
  const indexResponse = await fetchImpl(`${RECENT_BASE}/`, {
    headers: { Accept: 'text/html', 'User-Agent': 'ISOBAR-collector/0.4' },
    signal: AbortSignal.timeout(45_000),
  })
  if (!indexResponse.ok) throw new Error(`DWD RADOLAN Index HTTP ${indexResponse.status}`)
  const index = await indexResponse.text()
  const available = new Set([...index.matchAll(/raa01-sf_10000-(\d{10})-dwd---bin\.gz/g)].map((match) => match[1]))
  const references = []
  for (const date of dates) {
    const timestamp = radolanTimestamp(date, location.timezone)
    if (!available.has(timestamp)) continue
    const filename = `raa01-sf_10000-${timestamp}-dwd---bin.gz`
    const compressed = await fetchBytes(`${RECENT_BASE}/${filename}`, fetchImpl)
    const decoded = decodeRadolan(gunzipSync(compressed), location.latitude, location.longitude)
    references.push({
      method: RADOLAN_METHOD,
      date,
      source: 'dwd-radolan-sf',
      kind: 'radar-gauge-grid-observation',
      precipitationSum: decoded.precipitationSum,
      pixelCount: decoded.pixelCount,
      gridPoint: decoded.gridPoint,
      periodEndUtc: `20${timestamp.slice(0, 2)}-${timestamp.slice(2, 4)}-${timestamp.slice(4, 6)}T${timestamp.slice(6, 8)}:${timestamp.slice(8, 10)}:00Z`,
      product: 'SF',
      spatialResolutionKm: 1,
      license: 'CC BY 4.0',
      attribution: 'Deutscher Wetterdienst (DWD), RADOLAN SF',
      datasetUrl: `${RECENT_BASE}/${filename}`,
    })
  }
  return references
}
