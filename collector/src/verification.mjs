import { leadBucket } from './calibration.mjs'
import { modelBalancedProbability, quantile, round } from './fusion.mjs'
import { evidenceDistribution, weightedCRPS } from './evidence-engine.mjs'

function paired(forecasts, observations) {
  const count = Math.min(forecasts.length, observations.length)
  return Array.from({ length: count }, (_, index) => ({
    forecast: forecasts[index],
    observation: observations[index],
  })).filter(({ forecast, observation }) => (
    Number.isFinite(forecast) && Number.isFinite(observation)
  ))
}

export function meanAbsoluteError(forecasts, observations) {
  const samples = paired(forecasts, observations)
  if (!samples.length) return null
  return samples.reduce((sum, sample) => (
    sum + Math.abs(sample.forecast - sample.observation)
  ), 0) / samples.length
}

export function brierScore(probabilities, outcomes) {
  const samples = paired(probabilities, outcomes)
    .filter(({ forecast, observation }) => (
      forecast >= 0 && forecast <= 1 && (observation === 0 || observation === 1)
    ))
  if (!samples.length) return null
  return samples.reduce((sum, sample) => (
    sum + (sample.forecast - sample.observation) ** 2
  ), 0) / samples.length
}

export function ensembleCRPS(members, observation) {
  const values = members.filter(Number.isFinite)
  if (!values.length || !Number.isFinite(observation)) return null
  const observationDistance = values.reduce((sum, value) => (
    sum + Math.abs(value - observation)
  ), 0) / values.length

  let pairDistance = 0
  for (const left of values) {
    for (const right of values) pairDistance += Math.abs(left - right)
  }
  pairDistance /= values.length ** 2
  return observationDistance - 0.5 * pairDistance
}

function localISODate(value, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const valueOf = (type) => parts.find((part) => part.type === type)?.value
  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`
}

export function calendarLeadDays(capturedAt, validDate, timezone) {
  const issuedDate = localISODate(new Date(capturedAt), timezone)
  const issued = Date.parse(`${issuedDate}T12:00:00Z`)
  const valid = Date.parse(`${validDate}T12:00:00Z`)
  return Math.max(0, Math.round((valid - issued) / 86_400_000))
}

export function scoreModelDay(day, reference) {
  const temperatureMedian = quantile(day.temperatureMembers ?? [], 0.5)
  const precipitationMedian = quantile(day.precipitationMembers ?? [], 0.5)
  const rainProbability1mm = modelBalancedProbability([day.precipitationMembers ?? []], 1)
  const rainProbability10mm = modelBalancedProbability([day.precipitationMembers ?? []], 10)
  if (!Number.isFinite(temperatureMedian) || !Number.isFinite(reference.temperatureMean)) return null

  const hasPrecipitationReference = Number.isFinite(reference.precipitationSum)
  const rainOutcome1mm = hasPrecipitationReference && reference.precipitationSum >= 1 ? 1 : 0
  const rainOutcome10mm = hasPrecipitationReference && reference.precipitationSum >= 10 ? 1 : 0
  return {
    memberCount: day.temperatureMembers.filter(Number.isFinite).length,
    temperatureMedian: round(temperatureMedian, 2),
    temperatureAbsoluteError: round(Math.abs(temperatureMedian - reference.temperatureMean), 3),
    temperatureCRPS: round(ensembleCRPS(day.temperatureMembers, reference.temperatureMean), 3),
    precipitationMedian: Number.isFinite(precipitationMedian) ? round(precipitationMedian, 2) : null,
    precipitationAbsoluteError: hasPrecipitationReference && Number.isFinite(precipitationMedian)
      ? round(Math.abs(precipitationMedian - reference.precipitationSum), 3)
      : null,
    rainProbability1mm: Number.isFinite(rainProbability1mm) ? round(rainProbability1mm, 4) : null,
    rainProbability10mm: Number.isFinite(rainProbability10mm) ? round(rainProbability10mm, 4) : null,
    brier1mm: hasPrecipitationReference && Number.isFinite(rainProbability1mm)
      ? round(brierScore([rainProbability1mm], [rainOutcome1mm]), 4)
      : null,
    brier10mm: hasPrecipitationReference && Number.isFinite(rainProbability10mm)
      ? round(brierScore([rainProbability10mm], [rainOutcome10mm]), 4)
      : null,
  }
}

function roundedMetric(value, digits) {
  return Number.isFinite(value) ? round(value, digits) : null
}

function weightedProbability(points, threshold) {
  const valid = points.filter((point) => Number.isFinite(point.value) && point.weight > 0)
  const total = valid.reduce((sum, point) => sum + point.weight, 0)
  return total
    ? valid.filter((point) => point.value >= threshold).reduce((sum, point) => sum + point.weight, 0) / total
    : null
}

function weightedRank(points, observation) {
  const valid = points.filter((point) => Number.isFinite(point.value) && point.weight > 0)
  const total = valid.reduce((sum, point) => sum + point.weight, 0)
  return total
    ? valid.filter((point) => point.value <= observation).reduce((sum, point) => sum + point.weight, 0) / total
    : null
}

function scoreSystemDay(day, temperaturePoints, precipitationPoints, reference) {
  if (!day || !Number.isFinite(day.temperatureP50) || !Number.isFinite(reference.temperatureMean)) return null
  const probability1mm = Number.isFinite(day.rainProbability1mm)
    ? day.rainProbability1mm / 100
    : weightedProbability(precipitationPoints, 1)
  const probability10mm = Number.isFinite(day.rainProbability10mm)
    ? day.rainProbability10mm / 100
    : weightedProbability(precipitationPoints, 10)
  const hasPrecipitationReference = Number.isFinite(reference.precipitationSum)
  return {
    temperatureP10: day.temperatureP10,
    temperatureP50: day.temperatureP50,
    temperatureP90: day.temperatureP90,
    temperatureAbsoluteError: round(Math.abs(day.temperatureP50 - reference.temperatureMean), 3),
    temperatureCRPS: roundedMetric(weightedCRPS(temperaturePoints, reference.temperatureMean), 3),
    temperatureRankFraction: roundedMetric(weightedRank(temperaturePoints, reference.temperatureMean), 4),
    temperatureIntervalHit: reference.temperatureMean >= day.temperatureP10 && reference.temperatureMean <= day.temperatureP90,
    precipitationP50: day.precipitationP50 ?? null,
    precipitationAbsoluteError: hasPrecipitationReference && Number.isFinite(day.precipitationP50)
      ? round(Math.abs(day.precipitationP50 - reference.precipitationSum), 3)
      : null,
    precipitationCRPS: roundedMetric(weightedCRPS(precipitationPoints, reference.precipitationSum), 3),
    rainProbability1mm: Number.isFinite(probability1mm) ? round(probability1mm, 4) : null,
    rainProbability10mm: Number.isFinite(probability10mm) ? round(probability10mm, 4) : null,
    brier1mm: hasPrecipitationReference && Number.isFinite(probability1mm)
      ? round(brierScore([probability1mm], [reference.precipitationSum >= 1 ? 1 : 0]), 4)
      : null,
    brier10mm: hasPrecipitationReference && Number.isFinite(probability10mm)
      ? round(brierScore([probability10mm], [reference.precipitationSum >= 10 ? 1 : 0]), 4)
      : null,
  }
}

function scorePointChallenger(day, reference) {
  if (!day || !Number.isFinite(day.temperatureMean)) return null
  return {
    temperatureMean: day.temperatureMean,
    temperatureAbsoluteError: round(Math.abs(day.temperatureMean - reference.temperatureMean), 3),
    precipitationSum: day.precipitationSum,
    precipitationAbsoluteError: Number.isFinite(day.precipitationSum)
      ? round(Math.abs(day.precipitationSum - reference.precipitationSum), 3)
      : null,
  }
}

export function scoreForecastRun(run, models, reference, timezone) {
  const leadDays = calendarLeadDays(run.capturedAt, reference.date, timezone)
  const bucket = leadBucket(leadDays)
  const modelScores = Object.fromEntries(models.filter((model) => model.includeInFusion !== false).flatMap((model) => {
    const day = model.daily?.find((candidate) => candidate.date === reference.date)
    const score = day ? scoreModelDay(day, reference) : null
    return score ? [[model.id, score]] : []
  }))
  if (!Object.keys(modelScores).length) return null

  const baselineDay = run.outlook?.fusion?.daily?.find((day) => day.date === reference.date)
  const shadowDay = run.outlook?.evidence?.daily?.find((day) => day.date === reference.date)
  const mosmixDay = run.outlook?.challengers?.mosmix?.daily?.find((day) => day.date === reference.date)
  const baselineProfile = { weightsByBucket: run.outlook?.calibration?.weightsByBucket ?? {} }
  const baselineTemperature = evidenceDistribution(models, reference.date, bucket, baselineProfile, 'temperature').points
  const baselinePrecipitation = evidenceDistribution(models, reference.date, bucket, baselineProfile, 'precipitation').points
  const shadowProfile = run.outlook?.evidence?.profile ?? null
  const shadowTemperature = evidenceDistribution(models, reference.date, bucket, shadowProfile, 'temperature').points
  const shadowPrecipitation = evidenceDistribution(models, reference.date, bucket, shadowProfile, 'precipitation').points
  const systemScores = {
    baseline: scoreSystemDay(baselineDay, baselineTemperature, baselinePrecipitation, reference),
    shadow: scoreSystemDay(shadowDay, shadowTemperature, shadowPrecipitation, reference),
    mosmix: scorePointChallenger(mosmixDay, reference),
  }

  return {
    method: 'forecast-verification-v1.0.0',
    forecastRunId: run.id,
    capturedAt: run.capturedAt,
    validDate: reference.date,
    leadDays,
    leadBucket: bucket,
    reference: {
      source: reference.source,
      kind: reference.kind,
      temperatureMean: reference.temperatureMean,
      precipitationSum: reference.precipitationSum,
    },
    modelScores,
    systemScores,
  }
}
