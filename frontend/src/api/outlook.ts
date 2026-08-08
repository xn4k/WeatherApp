import type { Outlook, OutlookView } from '../types/outlook'

interface APIError {
  error?: {
    message?: string
  }
}

const useBrowserAdapter = import.meta.env.VITE_WEATHER_SOURCE === 'direct'

export async function getOutlook(
  view: OutlookView,
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<Outlook> {
  if (useBrowserAdapter) {
    const published = view === '30'
      ? await import('../adapters/firebase-weather/outlook')
        .then(({ getPublishedOutlook }) => getPublishedOutlook(latitude, longitude))
        .catch(() => null)
      : null
    if (published?.fresh) return published.outlook

    const { getBrowserOutlook } = await import('../adapters/browser-weather/outlook')
    try {
      return await getBrowserOutlook(view, latitude, longitude, signal)
    } catch (error) {
      if (published) return { ...published.outlook, source: 'stale' }
      throw error
    }
  }
  const query = new URLSearchParams({
    view,
    lat: latitude.toString(),
    lon: longitude.toString(),
  })
  const response = await fetch(`/api/v1/weather/outlook?${query}`, { signal })
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as APIError
    throw new Error(body.error?.message ?? 'Langfristmodelle konnten nicht geladen werden.')
  }
  return response.json() as Promise<Outlook>
}
