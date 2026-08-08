import { leadBucket } from './calibration.mjs'
import { modelBalancedProbability, quantile, round } from './fusion.mjs'

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
  if (!Number.isFinite(temperatureMedian)) return null

  const rainOutcome1mm = reference.precipitationSum >= 1 ? 1 : 0
  const rainOutcome10mm = reference.precipitationSum >= 10 ? 1 : 0
  return {
    memberCount: day.temperatureMembers.filter(Number.isFinite).length,
    temperatureMedian: round(temperatureMedian, 2),
    temperatureAbsoluteError: round(Math.abs(temperatureMedian - reference.temperatureMean), 3),
    temperatureCRPS: round(ensembleCRPS(day.temperatureMembers, reference.temperatureMean), 3),
    precipitationMedian: Number.isFinite(precipitationMedian) ? round(precipitationMedian, 2) : null,
    precipitationAbsoluteError: Number.isFinite(precipitationMedian)
      ? round(Math.abs(precipitationMedian - reference.precipitationSum), 3)
      : null,
    rainProbability1mm: Number.isFinite(rainProbability1mm) ? round(rainProbability1mm, 4) : null,
    rainProbability10mm: Number.isFinite(rainProbability10mm) ? round(rainProbability10mm, 4) : null,
    brier1mm: Number.isFinite(rainProbability1mm)
      ? round(brierScore([rainProbability1mm], [rainOutcome1mm]), 4)
      : null,
    brier10mm: Number.isFinite(rainProbability10mm)
      ? round(brierScore([rainProbability10mm], [rainOutcome10mm]), 4)
      : null,
  }
}

export function scoreForecastRun(run, models, reference, timezone) {
  const leadDays = calendarLeadDays(run.capturedAt, reference.date, timezone)
  const modelScores = Object.fromEntries(models.filter((model) => model.includeInFusion !== false).flatMap((model) => {
    const day = model.daily?.find((candidate) => candidate.date === reference.date)
    const score = day ? scoreModelDay(day, reference) : null
    return score ? [[model.id, score]] : []
  }))
  if (!Object.keys(modelScores).length) return null

  return {
    method: 'forecast-verification-v1.0.0',
    forecastRunId: run.id,
    capturedAt: run.capturedAt,
    validDate: reference.date,
    leadDays,
    leadBucket: leadBucket(leadDays),
    reference: {
      source: reference.source,
      kind: reference.kind,
      temperatureMean: reference.temperatureMean,
      precipitationSum: reference.precipitationSum,
    },
    modelScores,
  }
}
