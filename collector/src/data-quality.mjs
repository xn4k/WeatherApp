import { round } from './fusion.mjs'

export const DATA_QUALITY_VERSION = 'data-quality-v1.0.0'
export const MAXIMUM_PUBLISHED_AGE_MS = 8 * 60 * 60_000

function expectedDays(definition) {
  return Math.max(1, Number(definition.forecastDays) || 1)
}

export function assessDataQuality(models, definitions, warnings = [], capturedAt = new Date().toISOString()) {
  const available = new Map(models.map((model) => [model.id, model]))
  const fusionDefinitions = definitions.filter((definition) => definition.includeInFusion)
  const missingModelIds = fusionDefinitions.filter((definition) => !available.has(definition.id))
    .map((definition) => definition.id)
  const modelChecks = definitions.flatMap((definition) => {
    const model = available.get(definition.id)
    if (!model) return [{
      modelId: definition.id,
      status: 'missing',
      expectedDays: expectedDays(definition),
      availableDays: 0,
      memberCount: 0,
      completeDayShare: 0,
    }]
    const usableDays = model.daily.filter((day) => (
      Array.isArray(day.temperatureMembers) && day.temperatureMembers.some(Number.isFinite)
    ))
    const completeDays = usableDays.filter((day) => (
      Array.isArray(day.precipitationMembers) && day.precipitationMembers.some(Number.isFinite)
    ))
    const dayShare = usableDays.length / expectedDays(definition)
    return [{
      modelId: model.id,
      status: dayShare < 0.75 ? 'partial' : 'healthy',
      expectedDays: expectedDays(definition),
      availableDays: usableDays.length,
      memberCount: model.memberCount,
      completeDayShare: round(100 * completeDays.length / Math.max(1, usableDays.length)),
    }]
  })
  const partialModelIds = modelChecks.filter((check) => check.status === 'partial')
    .map((check) => check.modelId)
  const health = missingModelIds.length > 1
    ? 'critical'
    : missingModelIds.length || partialModelIds.length || warnings.length
      ? 'degraded'
      : 'healthy'
  const captured = Date.parse(capturedAt)
  return {
    method: DATA_QUALITY_VERSION,
    health,
    capturedAt,
    staleAfter: new Date(captured + MAXIMUM_PUBLISHED_AGE_MS).toISOString(),
    expectedFusionModels: fusionDefinitions.length,
    availableFusionModels: fusionDefinitions.length - missingModelIds.length,
    missingModelIds,
    partialModelIds,
    providerWarningCount: warnings.length,
    modelChecks,
    notice: 'Health bewertet Vollstaendigkeit, Member und Datenalter. Degraded bedeutet nicht automatisch eine falsche Prognose, sondern eingeschraenkte Evidenz.',
  }
}
