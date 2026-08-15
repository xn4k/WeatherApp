import type { Outlook, OutlookModelDay } from '../../types/outlook'
import type { ClimateDay } from '../../types/evidence'

export const INTERPRETATION_METHOD = 'forecast-interpretation-v2.0.0' as const

export type InterpretationDomain =
  | 'weather'
  | 'fusion'
  | 'scenario'
  | 'climate'
  | 'evidence'
  | 'quality'

export type InterpretationTone = 'neutral' | 'positive' | 'watch' | 'caution'
export type InterpretationAvailability = 'available' | 'partial' | 'unavailable'

export interface InterpretationEvidence {
  label: string
  value: string
  source: string
  explanation?: string
}

export interface InterpretationInsight {
  id: string
  domain: InterpretationDomain
  priority: number
  tone: InterpretationTone
  title: string
  simple?: string
  plain: string
  technical: string
  evidence: InterpretationEvidence[]
  limitation?: string
}

export interface InterpretationSection {
  id: InterpretationDomain
  method: string
  title: string
  kicker: string
  availability: InterpretationAvailability
  summary: string
  insights: InterpretationInsight[]
}

export interface InterpretationCoverage {
  available: InterpretationDomain[]
  partial: InterpretationDomain[]
  unavailable: InterpretationDomain[]
}

export interface ModelReading {
  id: string
  short: string
  temperatureMin: number
  temperatureMax: number
  precipitation: number
  apparentTemperatureMax: number | null
  relativeHumidityMean: number | null
}

export interface ForecastBriefing {
  method: typeof INTERPRETATION_METHOD
  date: string
  mode: Outlook['mode']
  status: 'robust' | 'mixed' | 'open' | 'unknown'
  statusLabel: string
  headline: string
  summary: string[]
  sections: InterpretationSection[]
  coverage: InterpretationCoverage
  modelRows: ModelReading[]
  globalLimit: string
}

export interface DeterministicContext {
  modelDays: Array<{ id: string; short: string; day: OutlookModelDay }>
  temperatureMin: number | null
  temperatureMax: number | null
  temperatureSpread: number | null
  precipitationMedian: number | null
  wetModelCount: number
  modelCount: number
  apparentTemperature: number | null
  relativeHumidity: number | null
  dewPoint: number | null
  windSpeed: number | null
}

export interface InterpretationContext {
  outlook: Outlook
  date: string
  leadIndex: number
  leadBucket: string
  deterministic: DeterministicContext | null
  fusionDay: NonNullable<Outlook['fusion']>['daily'][number] | null
  previousFusionDay: NonNullable<Outlook['fusion']>['daily'][number] | null
  uncertainty: NonNullable<NonNullable<Outlook['analysis']>['uncertainty']>['daily'][number] | null
  scenarioWindow: NonNullable<NonNullable<Outlook['analysis']>['scenarios']>['windows'][number] | null
  runMemoryDay: NonNullable<Outlook['runMemory']>['daily'][number] | null
  runStabilityDay: NonNullable<Outlook['runStability']>['daily'][number] | null
  fragilityDay: NonNullable<Outlook['fragility']>['daily'][number] | null
  evidenceDay: NonNullable<Outlook['evidence']>['daily'][number] | null
  mosmixDay: NonNullable<NonNullable<Outlook['challengers']>['mosmix']>['daily'][number] | null
  challengerDay: NonNullable<Outlook['calibrationChallenger']>['daily'][number] | null
  climate: ClimateDay | null
}

export interface InterpretationModule {
  id: InterpretationDomain
  version: string
  interpret(context: InterpretationContext): InterpretationSection
}
