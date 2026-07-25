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

export interface Outlook {
  mode: 'models' | 'ensemble'
  horizonDays: number
  models?: OutlookModel[]
  ensembles?: EnsembleModel[]
  notice: string
  warnings?: string[]
  refreshedAt: string
  source: 'refresh' | 'cache' | 'stale'
}
