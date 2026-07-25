export interface Coordinates {
  latitude: number
  longitude: number
}

export interface CurrentWeather {
  time: string
  temperature: number
  apparentTemperature: number
  humidity: number
  pressure: number
  precipitation: number
  windSpeed: number
  windGusts: number
  windDirection: number
  weatherCode: number
}

export interface HourlyPoint {
  time: string
  temperature: number
  precipitationProbability: number
  precipitation: number
  windSpeed: number
  windGusts: number
}

export interface DailyPoint {
  date: string
  weatherCode: number
  temperatureMax: number
  temperatureMin: number
  precipitationProbability: number
  precipitation: number
  windSpeedMax: number
  windGustsMax: number
  sunrise: string
  sunset: string
}

export interface ModelForecast {
  id: string
  label: string
  current: CurrentWeather
  hourly: HourlyPoint[]
  daily: DailyPoint[]
}

export interface ModelSummary {
  id: string
  label: string
  todayMax: number
  todayMin: number
  nextSixHourRain: number
}

export interface Forecast {
  location: string
  coordinates: Coordinates
  timezone: string
  updatedAt: string
  stale: boolean
  current: CurrentWeather
  models: ModelForecast[]
  daily: DailyPoint[]
  modelSummaries: ModelSummary[]
  consensus: {
    todayMax: number
    todayMin: number
    maxSpread: number
    agreement: 'hoch' | 'mittel' | 'niedrig'
    rainProbability: number
  }
}

export interface LocationResult extends Coordinates {
  id: number
  name: string
  region: string
  country: string
  timezone: string
}

