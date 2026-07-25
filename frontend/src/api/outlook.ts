import type { Outlook, OutlookView } from '../types/outlook'

interface APIError {
  error?: {
    message?: string
  }
}

export async function getOutlook(
  view: OutlookView,
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<Outlook> {
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
