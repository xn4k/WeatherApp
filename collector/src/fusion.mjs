const FUSION_METHOD = 'equal-model-weighted-empirical'
export const ALGORITHM_VERSION = 'fusion-v1.0.0'

function finiteValues(values) {
  return values.filter(Number.isFinite)
}

export function round(value, precision = 1) {
  const factor = 10 ** precision
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function quantile(values, probability) {
  const sorted = finiteValues(values).sort((left, right) => left - right)
  if (!sorted.length) return null
  const position = Math.max(0, Math.min(1, probability)) * (sorted.length - 1)
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

export function modelBalancedQuantile(groups, probability) {
  const usable = groups.map(finiteValues).filter((group) => group.length > 0)
  if (!usable.length) return null

  const modelWeight = 1 / usable.length
  const samples = usable.flatMap((group) => {
    const memberWeight = modelWeight / group.length
    return group.map((value) => ({ value, weight: memberWeight }))
  }).sort((left, right) => left.value - right.value)

  const target = Math.max(0, Math.min(1, probability))
  let cumulative = 0
  for (const sample of samples) {
    cumulative += sample.weight
    if (cumulative + Number.EPSILON >= target) return sample.value
  }
  return samples.at(-1)?.value ?? null
}

export function modelBalancedProbability(groups, threshold) {
  const usable = groups.map(finiteValues).filter((group) => group.length > 0)
  if (!usable.length) return null
  return usable.reduce((total, group) => (
    total + group.filter((value) => value >= threshold).length / group.length
  ), 0) / usable.length
}

export function summarizeModel(model) {
  return {
    id: model.id,
    name: model.name,
    short: model.short,
    memberCount: model.memberCount,
    daily: model.daily.map((day) => ({
      date: day.date,
      temperatureMedian: round(quantile(day.temperatureMembers, 0.5) ?? 0),
      temperatureP10: round(quantile(day.temperatureMembers, 0.1) ?? 0),
      temperatureP90: round(quantile(day.temperatureMembers, 0.9) ?? 0),
      precipitationMedian: round(quantile(day.precipitationMembers, 0.5) ?? 0, 2),
      precipitationP10: round(quantile(day.precipitationMembers, 0.1) ?? 0, 2),
      precipitationP90: round(quantile(day.precipitationMembers, 0.9) ?? 0, 2),
    })),
  }
}

export function buildFusion(models) {
  const eligible = models.filter((model) => model.includeInFusion)
  const dates = [...new Set(eligible.flatMap((model) => model.daily.map((day) => day.date)))].sort()
  const daily = dates.flatMap((date) => {
    const active = eligible.flatMap((model) => {
      const day = model.daily.find((candidate) => candidate.date === date)
      return day?.temperatureMembers.length ? [day] : []
    })
    if (!active.length) return []

    const temperatures = active.map((day) => day.temperatureMembers)
    const precipitation = active
      .map((day) => day.precipitationMembers)
      .filter((values) => values.length > 0)
    const precipitationQuantile = (probability) => (
      round(modelBalancedQuantile(precipitation, probability) ?? 0, 2)
    )
    return [{
      date,
      temperatureP10: round(modelBalancedQuantile(temperatures, 0.1) ?? 0),
      temperatureP25: round(modelBalancedQuantile(temperatures, 0.25) ?? 0),
      temperatureP50: round(modelBalancedQuantile(temperatures, 0.5) ?? 0),
      temperatureP75: round(modelBalancedQuantile(temperatures, 0.75) ?? 0),
      temperatureP90: round(modelBalancedQuantile(temperatures, 0.9) ?? 0),
      precipitationP10: precipitationQuantile(0.1),
      precipitationP50: precipitationQuantile(0.5),
      precipitationP90: precipitationQuantile(0.9),
      rainProbability1mm: round((modelBalancedProbability(precipitation, 1) ?? 0) * 100),
      rainProbability10mm: round((modelBalancedProbability(precipitation, 10) ?? 0) * 100),
      modelCount: active.length,
      memberCount: active.reduce((sum, day) => sum + day.temperatureMembers.length, 0),
    }]
  })

  return {
    method: FUSION_METHOD,
    algorithmVersion: ALGORITHM_VERSION,
    daily,
    notice: 'Rohfusion ohne historische Kalibrierung: Jedes verfügbare Kurz- oder Mittelfristmodell erhält pro Tag dasselbe Gesamtgewicht; seine Mitglieder teilen es gleichmäßig. EC46 bleibt eine separate Langfrist-Referenz.',
  }
}
