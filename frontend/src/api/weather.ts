import type { Forecast, LocationResult } from '../types/weather'

interface APIError {
  error?: { message?: string }
}

const useBrowserAdapter = import.meta.env.VITE_WEATHER_SOURCE === 'direct'

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  const payload = (await response.json().catch(() => ({}))) as T & APIError
  if (!response.ok) {
    throw new Error(payload.error?.message ?? 'Die Daten konnten nicht geladen werden.')
  }
  return payload
}

export async function getForecast(
  latitude: number,
  longitude: number,
  name: string,
  signal?: AbortSignal,
): Promise<Forecast> {
  if (useBrowserAdapter) {
    const { getBrowserForecast } = await import('../adapters/browser-weather/forecast')
    return getBrowserForecast(latitude, longitude, name, signal)
  }
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    name,
  })
  return request<Forecast>(`/api/v1/weather?${params}`, signal)
}

export async function searchLocations(query: string, signal?: AbortSignal): Promise<LocationResult[]> {
  if (useBrowserAdapter) {
    const { searchBrowserLocations } = await import('../adapters/browser-weather/forecast')
    return searchBrowserLocations(query, signal)
  }
  const payload = await request<{ results: LocationResult[] }>(
    `/api/v1/locations?q=${encodeURIComponent(query)}`,
    signal,
  )
  return payload.results
}
