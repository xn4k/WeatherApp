import { round } from './fusion.mjs'

export const EVIDENCE_METHOD = 'evidence-shadow-v1.0.0'
export const FRAGILITY_METHOD = 'forecast-fragility-v1.0.0'
export const OUT_OF_SAMPLE_MINIMUM_DAYS = 30

function leadBucket(leadDays) {
  if (leadDays <= 3) return 'days-0-3'
  if (leadDays <= 7) return 'days-4-7'
  if (leadDays <= 15) return 'days-8-15'
  return 'days-16-30'
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function average(values) {
  const finite = values.filter(Number.isFinite)
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null
}

function standardDeviation(values) {
  const mean = average(values)
  if (!Number.isFinite(mean) || values.length < 2) return null
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1))
}

function quantile(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right)
  if (!sorted.length) return null
  const position = (sorted.length - 1) * probability
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function weightedQuantile(points, probability) {
  const sorted = points.filter((point) => Number.isFinite(point.value) && point.weight > 0)
    .sort((left, right) => left.value - right.value)
  const total = sorted.reduce((sum, point) => sum + point.weight, 0)
  if (!total) return null
  const target = clamp(probability, 0, 1) * total
  let cumulative = 0
  for (const point of sorted) {
    cumulative += point.weight
    if (cumulative >= target) return point.value
  }
  return sorted.at(-1).value
}

export function weightedCRPS(points, observation) {
  const valid = points.filter((point) => Number.isFinite(point.value) && point.weight > 0)
  const total = valid.reduce((sum, point) => sum + point.weight, 0)
  if (!valid.length || !total || !Number.isFinite(observation)) return null
  const normalized = valid.map((point) => ({ ...point, weight: point.weight / total }))
  const observationDistance = normalized.reduce((sum, point) => (
    sum + point.weight * Math.abs(point.value - observation)
  ), 0)
  let pairDistance = 0
  for (const left of normalized) {
    for (const right of normalized) {
      pairDistance += left.weight * right.weight * Math.abs(left.value - right.value)
    }
  }
  return observationDistance - 0.5 * pairDistance
}

function pearson(left, right) {
  if (left.length !== right.length || left.length < 5) return null
  const leftMean = average(left)
  const rightMean = average(right)
  const numerator = left.reduce((sum, value, index) => sum + (value - leftMean) * (right[index] - rightMean), 0)
  const leftScale = Math.sqrt(left.reduce((sum, value) => sum + (value - leftMean) ** 2, 0))
  const rightScale = Math.sqrt(right.reduce((sum, value) => sum + (value - rightMean) ** 2, 0))
  return leftScale && rightScale ? numerator / (leftScale * rightScale) : null
}

function independentDailyValues(documents, valueOf) {
  const byDate = new Map()
  documents.forEach((document) => {
    const value = valueOf(document)
    if (!Number.isFinite(value)) return
    const values = byDate.get(document.validDate) ?? []
    values.push(value)
    byDate.set(document.validDate, values)
  })
  return [...byDate.values()].map(average)
}

function pairedErrors(documents, bucket, leftId, rightId) {
  const byDate = new Map()
  documents.forEach((document) => {
    if (document.leadBucket !== bucket) return
    const left = document.modelScores?.[leftId]
    const right = document.modelScores?.[rightId]
    if (!left || !right || !Number.isFinite(document.reference?.temperatureMean)) return
    const values = byDate.get(document.validDate) ?? []
    values.push([
      left.temperatureMedian - document.reference.temperatureMean,
      right.temperatureMedian - document.reference.temperatureMean,
    ])
    byDate.set(document.validDate, values)
  })
  return [...byDate.values()].map((values) => [
    average(values.map((value) => value[0])),
    average(values.map((value) => value[1])),
  ])
}

function outOfSampleGate(documents) {
  const rawPairs = documents.flatMap((document) => {
    const baseline = document.systemScores?.baseline
    const shadow = document.systemScores?.shadow
    if (!Number.isFinite(baseline?.temperatureCRPS) || !Number.isFinite(shadow?.temperatureCRPS)) return []
    return [{
      date: document.validDate,
      improvement: baseline.temperatureCRPS - shadow.temperatureCRPS,
      baseline: baseline.temperatureCRPS,
      shadow: shadow.temperatureCRPS,
    }]
  })
  const byDate = new Map()
  rawPairs.forEach((pair) => {
    const group = byDate.get(pair.date) ?? []
    group.push(pair)
    byDate.set(pair.date, group)
  })
  const pairs = [...byDate.entries()].map(([date, entries]) => ({
    date,
    improvement: average(entries.map((entry) => entry.improvement)),
    baseline: average(entries.map((entry) => entry.baseline)),
    shadow: average(entries.map((entry) => entry.shadow)),
  }))
  const days = pairs.length
  const improvements = pairs.map((pair) => pair.improvement)
  const meanImprovement = average(improvements)
  const deviation = standardDeviation(improvements)
  const lower95 = pairs.length > 1 && Number.isFinite(deviation)
    ? meanImprovement - 1.96 * deviation / Math.sqrt(pairs.length)
    : null
  const eligible = days >= OUT_OF_SAMPLE_MINIMUM_DAYS && Number.isFinite(lower95) && lower95 > 0
  return {
    method: 'paired-out-of-sample-gate-v1.0.0',
    status: days < OUT_OF_SAMPLE_MINIMUM_DAYS ? 'collecting' : eligible ? 'eligible' : 'baseline-retained',
    promotionEligible: eligible,
    distinctDays: days,
    minimumDays: OUT_OF_SAMPLE_MINIMUM_DAYS,
    samples: pairs.length,
    forecastComparisons: rawPairs.length,
    baselineCrps: Number.isFinite(average(pairs.map((pair) => pair.baseline))) ? round(average(pairs.map((pair) => pair.baseline)), 3) : null,
    shadowCrps: Number.isFinite(average(pairs.map((pair) => pair.shadow))) ? round(average(pairs.map((pair) => pair.shadow)), 3) : null,
    meanImprovement: Number.isFinite(meanImprovement) ? round(meanImprovement, 3) : null,
    lowerConfidence95: Number.isFinite(lower95) ? round(lower95, 3) : null,
    notice: eligible
      ? 'Der Shadow-Challenger ist im gepaarten Zukunftstest besser. Eine produktive Promotion bleibt eine explizite, versionierte Entscheidung.'
      : `Die Live-Fusion bleibt Champion, bis mindestens ${OUT_OF_SAMPLE_MINIMUM_DAYS} unabhaengige Tage und eine positive untere 95-%-Grenze vorliegen.`,
  }
}

export function aggregateEvidence(scoreDocuments) {
  const buckets = [...new Set(scoreDocuments.map((document) => document.leadBucket).filter(Boolean))]
  const parametersByBucket = {}
  for (const bucket of buckets) {
    const documents = scoreDocuments.filter((document) => document.leadBucket === bucket)
    const modelIds = [...new Set(documents.flatMap((document) => Object.keys(document.modelScores ?? {})))]
    const modelParameters = {}
    for (const modelId of modelIds) {
      const errors = independentDailyValues(documents, (document) => {
        const score = document.modelScores?.[modelId]
        return score && Number.isFinite(document.reference?.temperatureMean)
          ? score.temperatureMedian - document.reference.temperatureMean
          : null
      })
      const correlations = modelIds.filter((other) => other !== modelId).flatMap((other) => {
        const pairs = pairedErrors(documents, bucket, modelId, other)
        const correlation = pearson(pairs.map((pair) => pair[0]), pairs.map((pair) => pair[1]))
        return Number.isFinite(correlation) ? [Math.max(0, correlation)] : []
      })
      const dependence = average(correlations)
      modelParameters[modelId] = {
        samples: errors.length,
        temperatureBias: errors.length >= 14 ? round(average(errors), 3) : 0,
        averagePositiveErrorCorrelation: Number.isFinite(dependence) ? round(dependence, 3) : null,
        diversityPenalty: errors.length >= 14 && Number.isFinite(dependence)
          ? round(clamp(1 / (1 + 0.5 * dependence), 0.6, 1), 3)
          : 1,
      }
    }
    const conformity = independentDailyValues(documents, (document) => {
      const baseline = document.systemScores?.baseline
      const observation = document.reference?.temperatureMean
      if (!Number.isFinite(observation) || !Number.isFinite(baseline?.temperatureP10) || !Number.isFinite(baseline?.temperatureP90)) return null
      return Math.max(baseline.temperatureP10 - observation, observation - baseline.temperatureP90, 0)
    })
    const intervalHits = independentDailyValues(documents, (document) => (
      typeof document.systemScores?.baseline?.temperatureIntervalHit === 'boolean'
        ? document.systemScores.baseline.temperatureIntervalHit ? 1 : 0
        : null
    ))
    parametersByBucket[bucket] = {
      samples: new Set(documents.map((document) => document.validDate)).size,
      modelParameters,
      conformalExpansion: conformity.length >= 30 ? round(quantile(conformity, 0.8), 2) : 0,
      rawIntervalCoverage: intervalHits.length ? round(100 * average(intervalHits), 1) : null,
      calibrationActive: conformity.length >= 30,
    }
  }
  return {
    method: EVIDENCE_METHOD,
    status: Object.values(parametersByBucket).some((bucket) => bucket.calibrationActive) ? 'shadow-active' : 'collecting',
    parametersByBucket,
    gate: outOfSampleGate(scoreDocuments),
  }
}

function modelWeight(profile, bucket, modelId, variable) {
  const skill = profile?.weightsByBucket?.[bucket]?.[variable]?.[modelId] ?? 1
  const diversity = profile?.evidence?.parametersByBucket?.[bucket]?.modelParameters?.[modelId]?.diversityPenalty ?? 1
  return { skill, diversity, total: skill * diversity }
}

export function evidenceDistribution(models, date, bucket, profile, variable = 'temperature') {
  const points = []
  const parameters = []
  for (const model of models.filter((candidate) => candidate.includeInFusion !== false)) {
    const day = model.daily?.find((candidate) => candidate.date === date)
    if (!day) continue
    const members = variable === 'temperature' ? day.temperatureMembers : day.precipitationMembers
    if (!members?.length) continue
    const weight = modelWeight(profile, bucket, model.id, variable)
    const bias = variable === 'temperature'
      ? profile?.evidence?.parametersByBucket?.[bucket]?.modelParameters?.[model.id]?.temperatureBias ?? 0
      : 0
    const memberWeight = weight.total / members.length
    members.filter(Number.isFinite).forEach((value) => points.push({
      value: variable === 'temperature' ? value - bias : value,
      weight: memberWeight,
      modelId: model.id,
    }))
    parameters.push({
      modelId: model.id,
      skillWeight: round(weight.skill, 3),
      diversityPenalty: round(weight.diversity, 3),
      totalWeight: round(weight.total, 3),
      temperatureBias: round(bias, 3),
    })
  }
  return { points, parameters }
}

export function buildShadowEvidence(models, fusion, profile) {
  const daily = fusion.daily.map((raw, index) => {
    const bucket = leadBucket(index)
    const temperature = evidenceDistribution(models, raw.date, bucket, profile, 'temperature')
    const precipitation = evidenceDistribution(models, raw.date, bucket, profile, 'precipitation')
    const expansion = profile?.evidence?.parametersByBucket?.[bucket]?.conformalExpansion ?? 0
    const temperatureP10 = weightedQuantile(temperature.points, 0.1)
    const temperatureP90 = weightedQuantile(temperature.points, 0.9)
    const rainProbability = (threshold) => {
      const total = precipitation.points.reduce((sum, point) => sum + point.weight, 0)
      return total ? 100 * precipitation.points.filter((point) => point.value >= threshold)
        .reduce((sum, point) => sum + point.weight, 0) / total : null
    }
    return {
      date: raw.date,
      leadBucket: bucket,
      temperatureP10: round((temperatureP10 ?? raw.temperatureP10) - expansion, 2),
      temperatureP50: round(weightedQuantile(temperature.points, 0.5) ?? raw.temperatureP50, 2),
      temperatureP90: round((temperatureP90 ?? raw.temperatureP90) + expansion, 2),
      precipitationP50: round(weightedQuantile(precipitation.points, 0.5) ?? raw.precipitationP50, 2),
      rainProbability1mm: round(rainProbability(1) ?? raw.rainProbability1mm, 1),
      rainProbability10mm: round(rainProbability(10) ?? raw.rainProbability10mm, 1),
      conformalExpansion: expansion,
      modelParameters: temperature.parameters,
    }
  })
  return {
    method: EVIDENCE_METHOD,
    role: 'shadow-challenger',
    status: profile?.evidence?.status ?? 'collecting',
    live: false,
    gate: profile?.evidence?.gate ?? outOfSampleGate([]),
    profile: {
      weightsByBucket: profile?.weightsByBucket ?? {},
      evidence: { parametersByBucket: profile?.evidence?.parametersByBucket ?? {} },
    },
    daily,
    notice: 'Der Evidence-Challenger korrigiert lokale Temperatur-Biases, begrenzt historisch korrelierte Modelle und erweitert Intervalle erst nach ausreichender Coverage-Historie. Er veraendert die Live-Fusion nicht.',
  }
}

export function attachFragility(outlook, runStability, expectedModels = 5) {
  if (!outlook?.fusion?.daily?.length) return outlook
  const stabilityByDate = new Map(runStability?.daily?.map((day) => [day.date, day]) ?? [])
  const daily = outlook.fusion.daily.map((day, index) => {
    const width = Math.max(0, day.temperatureP90 - day.temperatureP10)
    const stability = Math.abs(stabilityByDate.get(day.date)?.temperatureP50Shift ?? 0)
    const factors = {
      modelSpread: round(clamp(width / 12, 0, 1), 3),
      runShift: round(clamp(stability / 3, 0, 1), 3),
      horizon: round(clamp(index / 30, 0, 1), 3),
      missingModels: round(clamp((expectedModels - day.modelCount) / expectedModels, 0, 1), 3),
    }
    const score = Math.round(100 * (
      0.38 * factors.modelSpread +
      0.27 * factors.runShift +
      0.2 * factors.horizon +
      0.15 * factors.missingModels
    ))
    return {
      date: day.date,
      score,
      level: score >= 67 ? 'high' : score >= 34 ? 'medium' : 'low',
      factors,
      primaryDriver: Object.entries(factors).sort((left, right) => right[1] - left[1])[0][0],
    }
  })
  return {
    ...outlook,
    fragility: {
      method: FRAGILITY_METHOD,
      status: 'transparent-index',
      calibratedProbability: false,
      daily,
      notice: 'Der Index beschreibt Aenderungsanfaelligkeit aus Modellstreuung, Run-to-run-Shift, Horizont und Modellabdeckung. Er ist noch keine kalibrierte Fehlerwahrscheinlichkeit.',
    },
  }
}
