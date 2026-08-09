import { round } from './fusion.mjs'
import { leadBucket } from './calibration.mjs'

export const CHALLENGER_VERSION = 'emos-lite-quantile-mapping-shadow-v1.0.0'

function issuedDate(capturedAt, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(capturedAt))
}

function lead(date, capturedAt, timezone) {
  const issued = Date.parse(`${issuedDate(capturedAt, timezone)}T12:00:00Z`)
  return Math.max(0, Math.round((Date.parse(`${date}T12:00:00Z`) - issued) / 86_400_000))
}

export function buildCalibrationChallenger(fusion, diagnostics, capturedAt, timezone) {
  const parameters = diagnostics?.challengerParameters ?? {}
  const daily = fusion.daily.map((day) => {
    const bucket = leadBucket(lead(day.date, capturedAt, timezone))
    const parameter = parameters[bucket]
    if (!parameter) return { ...day, leadBucket: bucket, parameterStatus: 'unavailable' }
    const correction = parameter.medianBiasCorrection ?? 0
    const center = day.temperatureP50 + correction
    const lowerDistance = Math.max(0, day.temperatureP50 - day.temperatureP10) * parameter.spreadScale
    const upperDistance = Math.max(0, day.temperatureP90 - day.temperatureP50) * parameter.spreadScale
    return {
      ...day,
      leadBucket: bucket,
      parameterStatus: parameter.eligible ? 'eligible-shadow' : 'collecting',
      temperatureP10: round(center - lowerDistance),
      temperatureP25: round((center - lowerDistance + center) / 2),
      temperatureP50: round(center),
      temperatureP75: round((center + upperDistance + center) / 2),
      temperatureP90: round(center + upperDistance),
    }
  })
  const eligibleBuckets = Object.entries(parameters).filter(([, value]) => value.eligible).map(([bucket]) => bucket)
  return {
    method: CHALLENGER_VERSION,
    role: 'shadow-challenger',
    live: false,
    status: eligibleBuckets.length ? 'shadow-ready' : 'prepared',
    eligibleBuckets,
    parameters,
    daily,
    notice: 'Der EMOS-lite/Quantile-Mapping-Challenger bleibt inaktiv. Auch bei ausreichenden Parametern braucht er ein getrenntes Zukunfts-Gate und eine manuelle Promotion.',
  }
}
