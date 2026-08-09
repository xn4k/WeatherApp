import { round } from './fusion.mjs'
import { aggregateEvidence } from './evidence-engine.mjs'

export const CALIBRATION_VERSION = 'skill-calibration-v1.0.0'
export const MINIMUM_VERIFICATION_DAYS = 14

export function leadBucket(leadDays) {
  if (leadDays <= 3) return 'days-0-3'
  if (leadDays <= 7) return 'days-4-7'
  if (leadDays <= 15) return 'days-8-15'
  return 'days-16-30'
}

function average(values) {
  const finite = values.filter(Number.isFinite)
  return finite.length
    ? finite.reduce((sum, value) => sum + value, 0) / finite.length
    : null
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function roundedOrNull(value, precision) {
  return Number.isFinite(value) ? round(value, precision) : null
}

function metricWeights(modelMetrics, metric, options) {
  const eligible = Object.entries(modelMetrics).filter(([, value]) => (
    value.distinctDays >= options.minimumDays && Number.isFinite(value[metric])
  ))
  const baseline = median(eligible.map(([, value]) => value[metric]))
  const weights = Object.fromEntries(Object.keys(modelMetrics).map((modelId) => [modelId, 1]))
  if (eligible.length < 2 || !Number.isFinite(baseline)) return { active: false, weights }

  for (const [modelId, value] of eligible) {
    const reliability = value.distinctDays / (value.distinctDays + options.priorDays)
    const floor = metric === 'temperatureLoss' ? 0.2 : 0.02
    const relativeSkill = (baseline + floor) / (value[metric] + floor)
    weights[modelId] = round(clamp(
      1 + reliability * (relativeSkill - 1),
      options.minimumWeight,
      options.maximumWeight,
    ), 3)
  }
  return { active: true, weights }
}

export function aggregateSkill(scoreDocuments, configuration = {}) {
  const options = {
    minimumDays: configuration.minimumDays ?? MINIMUM_VERIFICATION_DAYS,
    priorDays: configuration.priorDays ?? 30,
    minimumWeight: configuration.minimumWeight ?? 0.5,
    maximumWeight: configuration.maximumWeight ?? 2,
  }
  const groups = new Map()
  const allDates = new Set()
  let scoredForecasts = 0

  for (const document of scoreDocuments) {
    allDates.add(document.validDate)
    for (const [modelId, score] of Object.entries(document.modelScores ?? {})) {
      const key = `${document.leadBucket}:${modelId}`
      const group = groups.get(key) ?? {
        bucket: document.leadBucket,
        modelId,
        dates: new Set(),
        temperatureAbsoluteErrors: [],
        temperatureCRPS: [],
        precipitationAbsoluteErrors: [],
        brier1mm: [],
        brier10mm: [],
      }
      group.dates.add(document.validDate)
      group.temperatureAbsoluteErrors.push(score.temperatureAbsoluteError)
      group.temperatureCRPS.push(score.temperatureCRPS)
      group.precipitationAbsoluteErrors.push(score.precipitationAbsoluteError)
      group.brier1mm.push(score.brier1mm)
      group.brier10mm.push(score.brier10mm)
      groups.set(key, group)
      scoredForecasts += 1
    }
  }

  const metricsByBucket = {}
  for (const group of groups.values()) {
    const temperatureMae = average(group.temperatureAbsoluteErrors)
    const temperatureCrps = average(group.temperatureCRPS)
    const brier1mm = average(group.brier1mm)
    const brier10mm = average(group.brier10mm)
    metricsByBucket[group.bucket] ??= {}
    metricsByBucket[group.bucket][group.modelId] = {
      distinctDays: group.dates.size,
      samples: group.temperatureAbsoluteErrors.filter(Number.isFinite).length,
      temperatureMae: roundedOrNull(temperatureMae, 3),
      temperatureCrps: roundedOrNull(temperatureCrps, 3),
      temperatureLoss: roundedOrNull(average([temperatureMae, temperatureCrps]), 3),
      precipitationMae: roundedOrNull(average(group.precipitationAbsoluteErrors), 3),
      brier1mm: roundedOrNull(brier1mm, 4),
      brier10mm: roundedOrNull(brier10mm, 4),
      precipitationLoss: roundedOrNull(average([brier1mm, brier10mm]), 4),
    }
  }

  const weightsByBucket = {}
  for (const [bucket, metrics] of Object.entries(metricsByBucket)) {
    const temperature = metricWeights(metrics, 'temperatureLoss', options)
    const precipitation = metricWeights(metrics, 'precipitationLoss', options)
    weightsByBucket[bucket] = {
      active: temperature.active || precipitation.active,
      temperature: temperature.weights,
      precipitation: precipitation.weights,
    }
  }

  const activeBuckets = Object.entries(weightsByBucket)
    .filter(([, value]) => value.active)
    .map(([bucket]) => bucket)

  const evidence = aggregateEvidence(scoreDocuments)
  const referenceKinds = new Set(scoreDocuments.map((document) => document.reference?.kind).filter(Boolean))
  const referenceKind = referenceKinds.has('station-observation')
    ? 'dwd-station'
    : 'analysis-proxy'

  return {
    method: CALIBRATION_VERSION,
    status: activeBuckets.length ? 'active' : 'collecting',
    referenceKind,
    distinctDays: allDates.size,
    scoredForecasts,
    minimumDays: options.minimumDays,
    activeBuckets,
    metricsByBucket,
    weightsByBucket,
    evidence,
    notice: activeBuckets.length
      ? 'Skill-Gewichte sind nach Vorhersagehorizont getrennt, zur Gleichgewichtung hin geschrumpft und auf 0,5 bis 2,0 begrenzt.'
      : `ISOBAR sammelt Verifikationstage. Bis mindestens ${options.minimumDays} verschiedene Tage pro Modell und Horizont vorliegen, bleibt die Fusion gleichgewichtet.`,
  }
}

export function publicCalibration(profile) {
  if (!profile) return null
  return {
    method: profile.method,
    status: profile.status,
    referenceKind: profile.referenceKind,
    distinctDays: profile.distinctDays,
    scoredForecasts: profile.scoredForecasts,
    minimumDays: profile.minimumDays,
    activeBuckets: profile.activeBuckets,
    metricsByBucket: profile.metricsByBucket ?? {},
    weightsByBucket: profile.weightsByBucket ?? {},
    evidence: profile.evidence ?? null,
    notice: profile.notice,
  }
}
