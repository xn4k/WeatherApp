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
