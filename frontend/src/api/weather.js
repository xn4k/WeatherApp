async function request(url, signal) {
    const response = await fetch(url, { signal });
    const payload = (await response.json().catch(() => ({})));
    if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Die Daten konnten nicht geladen werden.');
    }
    return payload;
}
export function getForecast(latitude, longitude, name, signal) {
    const params = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        name,
    });
    return request(`/api/v1/weather?${params}`, signal);
}
export async function searchLocations(query, signal) {
    const payload = await request(`/api/v1/locations?q=${encodeURIComponent(query)}`, signal);
    return payload.results;
}
