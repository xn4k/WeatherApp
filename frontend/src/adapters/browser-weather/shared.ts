export const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
export const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
export const ENSEMBLE_URL = 'https://ensemble-api.open-meteo.com/v1/ensemble'
export const SEASONAL_URL = 'https://seasonal-api.open-meteo.com/v1/seasonal'

export async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Open-Meteo antwortet mit HTTP ${response.status}.`)
  return response.json() as Promise<T>
}

export async function cached<T>(
  key: string,
  lifetimeMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const storageKey = `isobar.weather.${key}`
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (raw) {
      const entry = JSON.parse(raw) as { expiresAt: number; value: T }
      if (Date.now() < entry.expiresAt) return entry.value
      sessionStorage.removeItem(storageKey)
    }
  } catch {
    // Private browsing or disabled storage must not break weather requests.
  }
  const value = await loader()
  try {
    sessionStorage.setItem(storageKey, JSON.stringify({
      expiresAt: Date.now() + lifetimeMs,
      value,
    }))
  } catch {
    // The live result remains usable without a browser cache.
  }
  return value
}

export function queryURL(endpoint: string, values: Record<string, string | number>) {
  const query = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => query.set(key, String(value)))
  return `${endpoint}?${query}`
}

export function round1(value: number) {
  return Math.round(value * 10) / 10
}

export function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return round1(
    sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2,
  )
}

export function quantile(values: number[], probability: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = Math.max(0, Math.min(1, probability)) * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  const weight = position - lower
  return sorted[lower] * (1 - weight) + sorted[upper] * weight
}

export function at<T>(values: T[] | undefined, index: number, fallback: T): T {
  return values?.[index] ?? fallback
}
