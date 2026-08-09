export interface CalibrationModelMetrics {
  distinctDays: number
  samples: number
  temperatureMae: number | null
  temperatureCrps: number | null
  precipitationMae: number | null
  brier1mm: number | null
  brier10mm: number | null
}

export interface CalibrationWeights {
  active: boolean
  temperature: Record<string, number>
  precipitation: Record<string, number>
}

export interface OutOfSampleGate {
  method: 'paired-out-of-sample-gate-v1.0.0'
  status: 'collecting' | 'eligible' | 'baseline-retained'
  promotionEligible: boolean
  distinctDays: number
  minimumDays: number
  samples: number
  forecastComparisons: number
  baselineCrps: number | null
  shadowCrps: number | null
  meanImprovement: number | null
  lowerConfidence95: number | null
  notice: string
}

export interface EvidenceModelParameters {
  samples: number
  temperatureBias: number
  averagePositiveErrorCorrelation: number | null
  diversityPenalty: number
}

export interface EvidenceProfile {
  method: 'evidence-shadow-v1.0.0'
  status: 'collecting' | 'shadow-active'
  parametersByBucket: Record<string, {
    samples: number
    modelParameters: Record<string, EvidenceModelParameters>
    conformalExpansion: number
    rawIntervalCoverage: number | null
    calibrationActive: boolean
  }>
  gate: OutOfSampleGate
}

export interface EvidenceDay {
  date: string
  leadBucket: string
  temperatureP10: number
  temperatureP50: number
  temperatureP90: number
  precipitationP50: number
  rainProbability1mm: number
  rainProbability10mm: number
  conformalExpansion: number
  modelParameters: Array<{
    modelId: string
    skillWeight: number
    diversityPenalty: number
    totalWeight: number
    temperatureBias: number
  }>
}

export interface EvidenceShadow {
  method: 'evidence-shadow-v1.0.0'
  role: 'shadow-challenger'
  status: 'collecting' | 'shadow-active'
  live: false
  gate: OutOfSampleGate
  daily: EvidenceDay[]
  notice: string
}

export interface WeatherStation {
  id: string
  name: string
  latitude?: number
  longitude?: number
  elevation?: number
  distanceKm?: number
  elevationDifference?: number | null
  attribution?: string
  license?: string
  datasetUrl?: string
}

export interface MosmixChallenger {
  method: 'dwd-mosmix-challenger-v1.0.0'
  id: 'dwd-mosmix'
  name: string
  role: 'challenger'
  source: 'dwd-open-data'
  station: WeatherStation
  issuedAt: string
  referencedModels: string[]
  horizonDays: number
  daily: Array<{
    date: string
    temperatureMean: number
    temperatureMin: number
    temperatureMax: number
    precipitationSum: number | null
  }>
  notice: string
}

export interface FragilityDay {
  date: string
  score: number
  level: 'low' | 'medium' | 'high'
  factors: Record<'modelSpread' | 'runShift' | 'horizon' | 'missingModels', number>
  primaryDriver: 'modelSpread' | 'runShift' | 'horizon' | 'missingModels'
}

export interface ClimateHistoryDay {
  date: string
  temperatureMean: number | null
  temperatureMin: number | null
  temperatureMax: number | null
  precipitationSum: number | null
  sunshineHours: number | null
  qualityLevel: number | null
  qualityStatus: 'final' | 'provisional'
}

export interface ClimateDay {
  method: 'calendar-climatology-v1.0.0'
  monthDay: string
  source: 'dwd-cdc'
  referenceKind: 'station-observation'
  station: WeatherStation
  referencePeriod: { start: number; end: number }
  sampleYears: number
  referenceSampleYears: number
  firstYear: number
  lastYear: number
  temperatureP10: number | null
  temperatureP50: number | null
  temperatureP90: number | null
  maximumRecord: { value: number; year: number } | null
  minimumRecord: { value: number; year: number } | null
  wettestRecord: { value: number; year: number } | null
  rainFrequency1mm: number | null
  rainFrequency10mm: number | null
  history: ClimateHistoryDay[]
  notice: string
}

export interface ReferenceProfile {
  method: 'reference-layer-v1.0.0'
  primarySource: 'dwd-cdc'
  fallbackSource: 'open-meteo-analysis-proxy'
  status: 'active' | 'fallback'
  station: WeatherStation | null
  latestObservationDate?: string | null
  latestQualityStatus?: 'final' | 'provisional' | null
  climateMethod?: string | null
  climateUpdatedAt?: string | null
  notice: string
}
