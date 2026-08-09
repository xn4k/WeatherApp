export interface MonitoredLocation {
  id: string
  name: string
  latitude: number
  longitude: number
}

export const monitoredLocations: MonitoredLocation[] = [
  { id: 'geo_50p9991_7p0387', name: 'Koeln', latitude: 50.9991, longitude: 7.0387 },
  { id: 'geo_52p5200_13p4050', name: 'Berlin', latitude: 52.52, longitude: 13.405 },
  { id: 'geo_53p5511_9p9937', name: 'Hamburg', latitude: 53.5511, longitude: 9.9937 },
  { id: 'geo_48p1374_11p5755', name: 'Muenchen', latitude: 48.1374, longitude: 11.5755 },
  { id: 'geo_50p1109_8p6821', name: 'Frankfurt', latitude: 50.1109, longitude: 8.6821 },
  { id: 'geo_48p7758_9p1829', name: 'Stuttgart', latitude: 48.7758, longitude: 9.1829 },
]

function radians(value: number) { return value * Math.PI / 180 }

function distanceKm(latitude: number, longitude: number, location: MonitoredLocation) {
  const latitudeDelta = radians(location.latitude - latitude)
  const longitudeDelta = radians(location.longitude - longitude)
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitude)) * Math.cos(radians(location.latitude)) * Math.sin(longitudeDelta / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function nearestMonitoredLocation(latitude: number, longitude: number, maximumKm = 35) {
  const candidates = monitoredLocations.map((location) => ({
    location,
    distance: distanceKm(latitude, longitude, location),
  })).sort((left, right) => left.distance - right.distance)
  return candidates[0]?.distance <= maximumKm ? candidates[0].location : null
}
