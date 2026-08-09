function coordinateToken(value: number) {
  return value.toFixed(4).replace('-', 'm').replace('.', 'p')
}

export function firebaseLocationId(latitude: number, longitude: number) {
  return `geo_${coordinateToken(latitude)}_${coordinateToken(longitude)}`
}
