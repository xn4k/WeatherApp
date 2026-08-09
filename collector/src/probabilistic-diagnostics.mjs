import { round } from './fusion.mjs'

export const DIAGNOSTICS_VERSION = 'probabilistic-diagnostics-v1.0.0'

function average(values) {
  const finite = values.filter(Number.isFinite)
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null
}

function quantile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) return null
  const position = Math.max(0, Math.min(1, probability)) * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function reliability(samples) {
  return Array.from({ length: 10 }, (_, index) => {
    const lower = index / 10
    const upper = (index + 1) / 10
    const entries = samples.filter((sample) => (
      sample.probability >= lower && (index === 9 ? sample.probability <= upper : sample.probability < upper)
    ))
    return {
      lower: round(lower, 1),
      upper: round(upper, 1),
      samples: entries.length,
      meanForecast: Number.isFinite(average(entries.map((entry) => entry.probability)))
        ? round(average(entries.map((entry) => entry.probability)), 3)
        : null,
      observedFrequency: Number.isFinite(average(entries.map((entry) => entry.outcome)))
        ? round(average(entries.map((entry) => entry.outcome)), 3)
        : null,
    }
  })
}

function rankHistogram(values) {
  const bins = Array.from({ length: 10 }, (_, index) => ({
    lower: index / 10,
    upper: (index + 1) / 10,
    count: 0,
  }))
  for (const value of values.filter(Number.isFinite)) {
    const index = Math.min(9, Math.max(0, Math.floor(value * 10)))
    bins[index].count += 1
  }
  return bins
}

function brierSkill(samples) {
  if (!samples.length) return null
  const eventRate = average(samples.map((sample) => sample.outcome))
  const score = average(samples.map((sample) => (sample.probability - sample.outcome) ** 2))
  const reference = average(samples.map((sample) => (eventRate - sample.outcome) ** 2))
  return {
    samples: samples.length,
    eventRate: round(eventRate, 3),
    brier: round(score, 4),
    climatologyBrier: round(reference, 4),
    skill: reference > 0 ? round(1 - score / reference, 3) : null,
    reliability: reliability(samples),
  }
}

function systemDiagnostics(documents, systemId) {
  const scored = documents.flatMap((document) => {
    const score = document.systemScores?.[systemId]
    return score ? [{ document, score }] : []
  })
  const eventSamples = (threshold, field) => scored.flatMap(({ document, score }) => {
    const probability = score[field]
    const observed = document.reference?.precipitationSum
    return Number.isFinite(probability) && Number.isFinite(observed)
      ? [{ probability, outcome: observed >= threshold ? 1 : 0 }]
      : []
  })
  const intervalHits = scored.map(({ score }) => score.temperatureIntervalHit).filter((value) => typeof value === 'boolean')
  return {
    samples: scored.length,
    temperature: {
      meanCrps: round(average(scored.map(({ score }) => score.temperatureCRPS)), 3),
      intervalCoverage80: intervalHits.length
        ? round(100 * intervalHits.filter(Boolean).length / intervalHits.length)
        : null,
      rankHistogram: rankHistogram(scored.map(({ score }) => score.temperatureRankFraction)),
    },
    rain1mm: brierSkill(eventSamples(1, 'rainProbability1mm')),
    rain10mm: brierSkill(eventSamples(10, 'rainProbability10mm')),
  }
}

function challengerParameters(documents) {
  const byBucket = {}
  for (const document of documents) {
    const score = document.systemScores?.baseline
    const observation = document.reference?.temperatureMean
    if (!score || !Number.isFinite(score.temperatureP50) || !Number.isFinite(observation)) continue
    const bucket = byBucket[document.leadBucket] ?? { dates: new Set(), residuals: [], spreadRatios: [] }
    bucket.dates.add(document.validDate)
    bucket.residuals.push(observation - score.temperatureP50)
    const spread = score.temperatureP90 - score.temperatureP10
    if (spread > 0) bucket.spreadRatios.push(Math.abs(observation - score.temperatureP50) / (spread / 2))
    byBucket[document.leadBucket] = bucket
  }
  return Object.fromEntries(Object.entries(byBucket).map(([bucket, values]) => {
    const distinctDays = values.dates.size
    return [bucket, {
      distinctDays,
      eligible: distinctDays >= 30,
      medianBiasCorrection: round(quantile(values.residuals, 0.5), 3),
      residualP10: round(quantile(values.residuals, 0.1), 3),
      residualP90: round(quantile(values.residuals, 0.9), 3),
      spreadScale: round(Math.max(0.75, Math.min(2.5, quantile(values.spreadRatios, 0.8) ?? 1)), 3),
    }]
  }))
}

export function buildProbabilisticDiagnostics(scoreDocuments) {
  const groups = {}
  for (const document of scoreDocuments) {
    groups[document.leadBucket] ??= []
    groups[document.leadBucket].push(document)
  }
  return {
    method: DIAGNOSTICS_VERSION,
    buckets: Object.fromEntries(Object.entries(groups).map(([bucket, documents]) => [bucket, {
      distinctDays: new Set(documents.map((document) => document.validDate)).size,
      baseline: systemDiagnostics(documents, 'baseline'),
      shadow: systemDiagnostics(documents, 'shadow'),
    }])),
    challengerParameters: challengerParameters(scoreDocuments),
    notice: 'Reliability, Rang und Skill bleiben deskriptiv, bis ausreichend unabhaengige Tage vorliegen. Brier Skill nutzt die beobachtete Ereignisrate im selben Diagnosefenster als Referenz.',
  }
}
