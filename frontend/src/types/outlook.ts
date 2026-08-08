export type OutlookView = '16' | '30'

export interface OutlookModelDay {
  date: string
  temperatureMin: number
  temperatureMax: number
  precipitationProbability: number | null
  precipitation: number
}

export interface OutlookModel {
  id: string
  name: string
  short: string
  horizonDays: number
  daily: OutlookModelDay[]
}

export interface EnsembleDay {
  date: string
  temperatureMedian: number
  temperatureP10: number
  temperatureP90: number
  precipitationMedian: number
  precipitationP10: number
  precipitationP90: number
}

export interface EnsembleModel {
  id: string
  name: string
  short: string
  memberCount: number
  daily: EnsembleDay[]
}

export interface FusionDay {
  date: string
  temperatureP10: number
  temperatureP25: number
  temperatureP50: number
  temperatureP75: number
  temperatureP90: number
  precipitationP10: number
  precipitationP50: number
  precipitationP90: number
  rainProbability1mm: number
  rainProbability10mm: number
  modelCount: number
  memberCount: number
}

export interface RunStabilityDay {
  date: string
  temperatureP50Shift: number
  temperatureSpreadShift: number
  rainProbability1mmShift: number
}

export interface RunStability {
  method: 'run-stability-v1.0.0'
  previousCapturedAt: string
  comparedDays: number
  meanAbsoluteTemperatureShift: number
  maximumAbsoluteTemperatureShift: number
  meanAbsoluteRainShift: number
  meanTemperatureSpreadChange: number
  daily: RunStabilityDay[]
}

export interface OutlookFusion {
  method: 'equal-model-weighted-empirical'
  daily: FusionDay[]
  notice: string
}

export interface Outlook {
  runStability?: RunStability
  mode: 'models' | 'ensemble'
  horizonDays: number
  models?: OutlookModel[]
  ensembles?: EnsembleModel[]
  fusion?: OutlookFusion
  notice: string
  warnings?: string[]
  refreshedAt: string
  source: 'refresh' | 'firebase' | 'cache' | 'stale'
}
