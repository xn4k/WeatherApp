import { leadBucket } from './calibration.mjs'
import { round } from './fusion.mjs'

export const SKILL_ALGORITHM_VERSION = 'fusion-v1.1.0'

function finiteValues(values) {
  return values.filter(Number.isFinite)
}

function weightedSamples(groups, weights = {}) {
  const usable = groups
    .map((group) => ({ ...group, values: finiteValues(group.values) }))
    .filter((group) => group.values.length > 0)
  if (!usable.length) return []
  const totalWeight = usable.reduce((sum, group) => (
    sum + Math.max(0, weights[group.modelId] ?? 1)
  ), 0)
  if (totalWeight <= 0) return []

  return usable.flatMap((group) => {
    const modelWeight = Math.max(0, weights[group.modelId] ?? 1) / totalWeight
    return group.values.map((value) => ({
      value,
      weight: modelWeight / group.values.length,
    }))
  }).sort((left, right) => left.value - right.value)
}

export function skillWeightedQuantile(groups, probability, weights = {}) {
  const samples = weightedSamples(groups, weights)
  if (!samples.length) return null
  const target = Math.max(0, Math.min(1, probability))
  let cumulative = 0
  for (const sample of samples) {
    cumulative += sample.weight
    if (cumulative + Number.EPSILON >= target) return sample.value
  }
  return samples.at(-1)?.value ?? null
}

export function skillWeightedProbability(groups, threshold, weights = {}) {
  const samples = weightedSamples(groups, weights)
  if (!samples.length) return null
  return samples.reduce((sum, sample) => (
    sum + (sample.value >= threshold ? sample.weight : 0)
  ), 0)
}

function bucketWeights(profile, bucket, metric) {
  const configured = profile?.weightsByBucket?.[bucket]
  return configured?.active ? configured[metric] ?? {} : {}
}

export function buildSkillFusion(models, profile = null) {
  const eligible = models.filter((model) => model.includeInFusion)
  const dates = [...new Set(eligible.flatMap((model) => model.daily.map((day) => day.date)))].sort()
  let usesSkillWeights = false
  const daily = dates.flatMap((date, index) => {
    const active = eligible.flatMap((model) => {
      const day = model.daily.find((candidate) => candidate.date === date)
      return day?.temperatureMembers.length ? [{ model, day }] : []
    })
    if (!active.length) return []

    const bucket = leadBucket(index)
    const temperatureWeights = bucketWeights(profile, bucket, 'temperature')
    const precipitationWeights = bucketWeights(profile, bucket, 'precipitation')
    if (Object.keys(temperatureWeights).length || Object.keys(precipitationWeights).length) {
      usesSkillWeights = true
    }
    const temperatures = active.map(({ model, day }) => ({
      modelId: model.id,
      values: day.temperatureMembers,
    }))
    const precipitation = active
      .filter(({ day }) => day.precipitationMembers.length > 0)
      .map(({ model, day }) => ({ modelId: model.id, values: day.precipitationMembers }))
    const temperatureQuantile = (probability) => round(
      skillWeightedQuantile(temperatures, probability, temperatureWeights) ?? 0,
    )
    const precipitationQuantile = (probability) => round(
      skillWeightedQuantile(precipitation, probability, precipitationWeights) ?? 0,
      2,
    )
    return [{
      date,
      temperatureP10: temperatureQuantile(0.1),
      temperatureP25: temperatureQuantile(0.25),
      temperatureP50: temperatureQuantile(0.5),
      temperatureP75: temperatureQuantile(0.75),
      temperatureP90: temperatureQuantile(0.9),
      precipitationP10: precipitationQuantile(0.1),
      precipitationP50: precipitationQuantile(0.5),
      precipitationP90: precipitationQuantile(0.9),
      rainProbability1mm: round(
        (skillWeightedProbability(precipitation, 1, precipitationWeights) ?? 0) * 100,
      ),
      rainProbability10mm: round(
        (skillWeightedProbability(precipitation, 10, precipitationWeights) ?? 0) * 100,
      ),
      modelCount: active.length,
      memberCount: active.reduce((sum, entry) => sum + entry.day.temperatureMembers.length, 0),
    }]
  })

  return {
    method: usesSkillWeights
      ? 'skill-weighted-empirical'
      : 'equal-model-weighted-empirical',
    algorithmVersion: SKILL_ALGORITHM_VERSION,
    daily,
    notice: usesSkillWeights
      ? 'Historisch verifizierte Modellgewichte werden je Prognosehorizont und Messgröße getrennt angewendet. Sie sind zur Gleichgewichtung hin geschrumpft und begrenzt; EC46 bleibt separat.'
      : 'Rohfusion ohne aktive historische Kalibrierung: Jedes verfügbare Kurz- oder Mittelfristmodell erhält pro Tag dasselbe Gesamtgewicht. EC46 bleibt separat.',
  }
}
