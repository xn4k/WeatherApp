import { describe, expect, it } from 'vitest'
import type { ClimateDay } from '../../types/evidence'
import type { Outlook, OutlookModel } from '../../types/outlook'
import { buildForecastBriefing } from './composer'
import { INTERPRETATION_METHOD } from './types'

const date = '2026-08-15'

function climateFixture(): ClimateDay {
  return {
    method: 'calendar-climatology-v1.0.0',
    monthDay: '08-15',
    source: 'dwd-cdc',
    referenceKind: 'station-observation',
    station: { id: '01048', name: 'Teststation' },
    referencePeriod: { start: 1991, end: 2020 },
    sampleYears: 40,
    referenceSampleYears: 30,
    firstYear: 1981,
    lastYear: 2025,
    temperatureP10: 14,
    temperatureP50: 19,
    temperatureP90: 26,
    maximumRecord: { value: 35, year: 2003 },
    minimumRecord: { value: 9, year: 1987 },
    wettestRecord: { value: 42, year: 2010 },
    rainFrequency1mm: 35,
    rainFrequency10mm: 8,
    history: [
      { date: '1991-08-15', temperatureMean: 17, temperatureMin: 12, temperatureMax: 22, precipitationSum: 0, sunshineHours: 8, qualityLevel: 1, qualityStatus: 'final' },
      { date: '2001-08-15', temperatureMean: 20, temperatureMin: 15, temperatureMax: 26, precipitationSum: 2, sunshineHours: 5, qualityLevel: 1, qualityStatus: 'final' },
      { date: '2011-08-15', temperatureMean: 23, temperatureMin: 17, temperatureMax: 29, precipitationSum: 0, sunshineHours: 10, qualityLevel: 1, qualityStatus: 'final' },
    ],
    notice: 'Test fixture',
  }
}

function ensembleFixture(): Outlook {
  const gate = {
    method: 'paired-out-of-sample-gate-v1.0.0' as const,
    status: 'collecting' as const,
    promotionEligible: false,
    distinctDays: 12,
    minimumDays: 30,
    samples: 24,
    forecastComparisons: 24,
    baselineCrps: 1.2,
    shadowCrps: 1.1,
    meanImprovement: 0.1,
    lowerConfidence95: -0.05,
    notice: 'Test gate',
  }
  return {
    mode: 'ensemble',
    horizonDays: 30,
    refreshedAt: '2026-08-14T06:00:00.000Z',
    source: 'firebase',
    notice: 'Test outlook',
    warnings: [],
    fusion: {
      method: 'equal-model-weighted-empirical',
      notice: 'Transparent baseline',
      daily: [
        {
          date: '2026-08-14', temperatureP10: 17, temperatureP25: 19, temperatureP50: 21,
          temperatureP75: 23, temperatureP90: 25, precipitationP10: 0, precipitationP50: 0.3,
          precipitationP90: 6, rainProbability1mm: 35, rainProbability10mm: 8,
          apparentTemperatureP50: 22, relativeHumidityP50: 58, dewPointP50: 14,
          windSpeedP50: 12, modelCount: 5, memberCount: 180,
        },
        {
          date, temperatureP10: 18, temperatureP25: 21, temperatureP50: 24,
          temperatureP75: 27, temperatureP90: 30, precipitationP10: 0, precipitationP50: 1.2,
          precipitationP90: 12, rainProbability1mm: 72, rainProbability10mm: 24,
          apparentTemperatureP50: 27, relativeHumidityP50: 68, dewPointP50: 19,
          windSpeedP50: 15, modelCount: 5, memberCount: 180,
        },
      ],
    },
    analysis: {
      method: 'forecast-analysis-v1.0.0',
      uncertainty: {
        method: 'law-of-total-variance-v1.0.0',
        notice: 'Test variance',
        daily: [{
          date,
          modelCount: 5,
          temperature: { withinVariance: 2.4, betweenVariance: 1.6, totalVariance: 4, withinShare: 60, betweenShare: 40 },
          precipitation: null,
        }],
      },
      scenarios: {
        method: 'model-balanced-trajectory-clustering-v1.0.0',
        notice: 'Test scenarios',
        windows: [{
          id: 'days-0-7', label: 'Tag 1–7', dates: [date], trajectoryCount: 180,
          modelCount: 5, branchingScore: 66,
          scenarios: [{
            id: 'warm', modelBalancedShare: 58, rawMemberShare: 62,
            memberCount: 112, modelCount: 5, modelComposition: { icon: 20, ifs: 30 },
            daily: [{ date, temperature: 25, precipitation: 1 }],
          }],
        }],
      },
    },
    runMemory: {
      method: 'multi-run-memory-v1.0.0', runCount: 6,
      firstCapturedAt: '2026-08-12T00:00:00Z', latestCapturedAt: '2026-08-14T06:00:00Z',
      notice: 'Test memory',
      daily: [{ date, runCount: 6, latestShift: 0.4, meanAbsoluteShift: 0.7, flipFlopCount: 1, flipFlopRate: 20, convergence: 0.9, state: 'converging' }],
    },
    runStability: {
      method: 'run-stability-v1.0.0', previousCapturedAt: '2026-08-14T00:00:00Z', comparedDays: 25,
      meanAbsoluteTemperatureShift: 0.5, maximumAbsoluteTemperatureShift: 1.4,
      meanAbsoluteRainShift: 4, meanTemperatureSpreadChange: 0.2,
      daily: [{ date, temperatureP50Shift: 0.4, temperatureSpreadShift: 0.1, rainProbability1mmShift: 3 }],
    },
    fragility: {
      method: 'forecast-fragility-v1.0.0', status: 'transparent-index', calibratedProbability: false,
      notice: 'Test fragility',
      daily: [{ date, score: 68, level: 'high', factors: { modelSpread: 0.8, runShift: 0.4, horizon: 0.1, missingModels: 0 }, primaryDriver: 'modelSpread' }],
    },
    calibration: {
      method: 'skill-calibration-v1.0.0', status: 'collecting', referenceKind: 'dwd-station',
      distinctDays: 12, scoredForecasts: 60, minimumDays: 30, activeBuckets: [],
      evidence: { method: 'evidence-shadow-v1.0.0', status: 'collecting', parametersByBucket: {}, gate },
      notice: 'Test calibration',
    },
    evidence: {
      method: 'evidence-shadow-v1.0.0', role: 'shadow-challenger', status: 'collecting', live: false,
      gate, daily: [], notice: 'Test evidence',
    },
    referenceProfile: {
      method: 'reference-layer-v1.0.0', primarySource: 'dwd-cdc', fallbackSource: 'open-meteo-analysis-proxy',
      status: 'active', station: { id: '01048', name: 'Teststation', distanceKm: 8 },
      latestObservationDate: '2026-08-13', latestQualityStatus: 'final', notice: 'Test reference',
    },
    challengers: {
      mosmix: {
        method: 'dwd-mosmix-challenger-v1.0.0', id: 'dwd-mosmix', name: 'MOSMIX', role: 'challenger',
        source: 'dwd-open-data', station: { id: '01048', name: 'Teststation' }, issuedAt: '2026-08-14T06:00:00Z',
        referencedModels: ['ICON'], horizonDays: 10, notice: 'Test challenger',
        daily: [{ date, temperatureMean: 22, temperatureMin: 16, temperatureMax: 28, precipitationSum: 2 }],
      },
    },
    calibrationChallenger: {
      method: 'emos-lite-quantile-mapping-shadow-v1.0.0', role: 'shadow-challenger', live: false,
      status: 'prepared', eligibleBuckets: [], parameters: {}, notice: 'Test calibration challenger',
      daily: [{ date, leadBucket: 'days-0-3', parameterStatus: 'collecting', temperatureP10: 18, temperatureP50: 24, temperatureP90: 30 }],
    },
    dataQuality: {
      method: 'data-quality-v1.0.0', health: 'healthy', capturedAt: '2026-08-14T06:00:00Z', staleAfter: '2026-08-14T18:00:00Z',
      expectedFusionModels: 5, availableFusionModels: 5, missingModelIds: [], partialModelIds: [],
      providerWarningCount: 0, modelChecks: [], notice: 'Test quality',
    },
    forecastPassport: {
      method: 'forecast-passport-v1.0.0', id: 'passport-test', immutable: true,
      capturedAt: '2026-08-14T06:00:00Z', locationId: 'test', algorithmVersion: 'fusion-v1',
      modelIds: ['icon', 'ifs', 'gfs', 'gem', 'jma'], modelMembers: {}, fusionMethod: 'equal-model-weighted-empirical',
      evidenceMethod: 'evidence-shadow-v1.0.0', scenarioMethod: 'forecast-analysis-v1.0.0',
      dataQuality: 'healthy', payloadHash: '0123456789abcdef0123456789abcdef', source: 'collector', notice: 'Test passport',
    },
    radolanStatus: { status: 'active', references: 8 },
  }
}

function deterministicFixture(modelCount = 3): Outlook {
  const models: OutlookModel[] = Array.from({ length: modelCount }, (_, index) => ({
    id: `model-${index + 1}`,
    name: `Model ${index + 1}`,
    short: `M${index + 1}`,
    horizonDays: 16,
    daily: [{
      date,
      temperatureMin: 12 + index,
      temperatureMax: 20 + index * 2,
      apparentTemperatureMax: 21 + index,
      relativeHumidityMean: 55 + index,
      dewPointMean: 13 + index,
      windSpeedMean: 10 + index,
      precipitationProbability: null,
      precipitation: index,
    }],
  }))
  return {
    mode: 'models', horizonDays: 16, models,
    refreshedAt: '2026-08-14T06:00:00.000Z', source: 'refresh', notice: 'Test models', warnings: [],
  }
}

describe('forecast interpretation engine', () => {
  it('composes all six domains with traceable methods', () => {
    const briefing = buildForecastBriefing(ensembleFixture(), date, climateFixture())

    expect(briefing?.method).toBe(INTERPRETATION_METHOD)
    expect(briefing?.sections.map((section) => section.id)).toEqual([
      'weather', 'fusion', 'scenario', 'climate', 'evidence', 'quality',
    ])
    expect(briefing?.coverage.available).toEqual([
      'weather', 'fusion', 'scenario', 'climate', 'evidence', 'quality',
    ])
    expect(briefing?.sections.every((section) => section.method.includes('-v1.0.0'))).toBe(true)
  })

  it('never labels an ensemble day robust when the fragility signal is missing', () => {
    const outlook = { ...ensembleFixture(), fragility: undefined }
    const briefing = buildForecastBriefing(outlook, date, climateFixture())

    expect(briefing?.status).toBe('unknown')
    expect(briefing?.statusLabel).toBe('Einschätzung sammelt')
  })

  it('lets critical data quality override an otherwise robust-looking signal', () => {
    const outlook = ensembleFixture()
    outlook.dataQuality = { ...outlook.dataQuality!, health: 'critical' }

    expect(buildForecastBriefing(outlook, date, climateFixture())?.status).toBe('unknown')
  })

  it('marks raw rain and scenario shares as uncalibrated', () => {
    const briefing = buildForecastBriefing(ensembleFixture(), date, climateFixture())!
    const rain = briefing.sections.flatMap((section) => section.insights).find((item) => item.id === 'weather-rain')
    const scenarios = briefing.sections.flatMap((section) => section.insights).find((item) => item.id === 'scenario-paths')

    expect(rain?.limitation).toMatch(/roher Ensembleanteil/i)
    expect(rain?.limitation).toMatch(/kalibriert/i)
    expect(scenarios?.limitation).toMatch(/keine kalibrierten Eintrittswahrscheinlichkeiten/i)
  })

  it('still explains the visible model corridor when central research data is absent', () => {
    const outlook = {
      ...ensembleFixture(),
      analysis: undefined,
      runMemory: undefined,
      runStability: undefined,
      fragility: undefined,
      evidence: undefined,
      calibration: undefined,
      referenceProfile: undefined,
    }
    const briefing = buildForecastBriefing(outlook, date)!
    const fusion = briefing.sections.find((section) => section.id === 'fusion')!

    expect(fusion.insights[0].id).toBe('fusion-corridor')
    expect(fusion.summary).toContain('Modellkorridor')
    expect(fusion.summary).not.toMatch(/fehlt|nicht veröffentlicht/i)
  })

  it('uses the actual deterministic model count instead of a fixed assumption', () => {
    const briefing = buildForecastBriefing(deterministicFixture(3), date)!
    const weather = briefing.sections.flatMap((section) => section.insights).find((item) => item.id === 'weather-deterministic')

    expect(briefing.modelRows).toHaveLength(3)
    expect(weather?.technical).toContain('3 Einzelläufen')
    expect(JSON.stringify(briefing)).not.toContain('vier gleichwertig')
  })

  it('produces no accidental NaN or undefined prose when optional evidence is absent', () => {
    const briefing = buildForecastBriefing(deterministicFixture(), date)!
    const rendered = JSON.stringify(briefing)

    expect(rendered).not.toMatch(/NaN|undefined/)
    expect(briefing.coverage.unavailable).toContain('climate')
  })

  it('is reproducible for the same frozen input', () => {
    const outlook = ensembleFixture()
    const climate = climateFixture()

    expect(buildForecastBriefing(outlook, date, climate)).toEqual(buildForecastBriefing(outlook, date, climate))
  })

  it('adds the climate anomaly without presenting one day as a trend', () => {
    const briefing = buildForecastBriefing(ensembleFixture(), date, climateFixture())!
    const climate = briefing.sections.find((section) => section.id === 'climate')!

    expect(climate.summary).toContain('über der historischen Mitte')
    expect(climate.insights[0].limitation).toMatch(/kein(en)? Klimatrend/i)
  })
})
