export interface VarianceComponent {
  withinVariance: number
  betweenVariance: number
  totalVariance: number
  withinShare: number
  betweenShare: number
}

export interface UncertaintyDay {
  date: string
  modelCount: number
  temperature: VarianceComponent
  precipitation: VarianceComponent | null
}

export interface ForecastScenario {
  id: string
  modelBalancedShare: number
  rawMemberShare: number
  memberCount: number
  modelCount: number
  modelComposition: Record<string, number>
  daily: Array<{ date: string; temperature: number; precipitation: number }>
}

export interface ScenarioWindow {
  id: string
  label: string
  dates: string[]
  trajectoryCount: number
  modelCount: number
  branchingScore: number
  scenarios: ForecastScenario[]
}

export interface ForecastAnalysis {
  method: 'forecast-analysis-v1.0.0'
  uncertainty: {
    method: 'law-of-total-variance-v1.0.0'
    daily: UncertaintyDay[]
    notice: string
  }
  scenarios: {
    method: 'model-balanced-trajectory-clustering-v1.0.0'
    windows: ScenarioWindow[]
    notice: string
  }
}

export interface DataQuality {
  method: 'data-quality-v1.0.0'
  health: 'healthy' | 'degraded' | 'critical'
  capturedAt: string
  staleAfter: string
  expectedFusionModels: number
  availableFusionModels: number
  missingModelIds: string[]
  partialModelIds: string[]
  providerWarningCount: number
  modelChecks: Array<{
    modelId: string
    status: 'healthy' | 'partial' | 'missing'
    expectedDays: number
    availableDays: number
    memberCount: number
    completeDayShare: number
  }>
  notice: string
}

export interface RunMemoryDay {
  date: string
  runCount: number
  latestShift: number
  meanAbsoluteShift: number
  flipFlopCount: number
  flipFlopRate: number
  convergence: number
  state: 'converging' | 'stable' | 'diverging'
}

export interface RunMemory {
  method: 'multi-run-memory-v1.0.0'
  runCount: number
  firstCapturedAt: string
  latestCapturedAt: string
  daily: RunMemoryDay[]
  notice: string
}

export interface ForecastPassport {
  method: 'forecast-passport-v1.0.0'
  id: string
  immutable: true
  capturedAt: string
  locationId: string
  algorithmVersion: string
  modelIds: string[]
  modelMembers: Record<string, number>
  fusionMethod: string | null
  evidenceMethod: string | null
  scenarioMethod: string | null
  dataQuality: string
  payloadHash: string
  source: string
  notice: string
}

export interface ReliabilityBin {
  lower: number
  upper: number
  samples: number
  meanForecast: number | null
  observedFrequency: number | null
}

export interface TemperatureDiagnostics {
  meanCrps: number | null
  climatologyCrps: number | null
  persistenceCrps: number | null
  crpsSkillClimatology: number | null
  crpsSkillPersistence: number | null
  intervalCoverage80: number | null
  rankHistogram: Array<{ lower: number; upper: number; count: number }>
}

export interface ProbabilisticDiagnostics {
  method: 'probabilistic-diagnostics-v1.0.0'
  buckets: Record<string, {
    distinctDays: number
    baseline: {
      samples: number
      temperature: TemperatureDiagnostics
      rain1mm: { samples: number; eventRate: number; brier: number; climatologyBrier: number; skill: number | null; reliability: ReliabilityBin[] } | null
      rain10mm: { samples: number; eventRate: number; brier: number; climatologyBrier: number; skill: number | null; reliability: ReliabilityBin[] } | null
    }
    shadow: Record<string, unknown>
  }>
  challengerParameters: Record<string, { distinctDays: number; eligible: boolean; medianBiasCorrection: number; residualP10: number; residualP90: number; spreadScale: number }>
  notice: string
}

export interface CalibrationChallenger {
  method: 'emos-lite-quantile-mapping-shadow-v1.0.0'
  role: 'shadow-challenger'
  live: false
  status: 'prepared' | 'shadow-ready'
  eligibleBuckets: string[]
  parameters: ProbabilisticDiagnostics['challengerParameters']
  daily: Array<{ date: string; leadBucket: string; parameterStatus: string; temperatureP10: number; temperatureP50: number; temperatureP90: number }>
  notice: string
}

export interface RadolanStatus {
  status: 'empty' | 'active' | 'unavailable'
  references: number
  warning?: string
}
