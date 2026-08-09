import { nearestMonitoredLocation } from './monitored-locations'

function coordinateToken(value: number) {
  return value.toFixed(4).replace('-', 'm').replace('.', 'p')
}

export function firebaseLocationId(latitude: number, longitude: number) {
  const monitored = nearestMonitoredLocation(latitude, longitude)
  if (monitored) return monitored.id
  return `geo_${coordinateToken(latitude)}_${coordinateToken(longitude)}`
}
