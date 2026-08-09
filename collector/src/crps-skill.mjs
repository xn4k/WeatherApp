function average(values) {
  const finite = values.filter(Number.isFinite)
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null
}

function empiricalCrps(values, observation) {
  const usable = values.filter(Number.isFinite)
  if (!usable.length || !Number.isFinite(observation)) return null
  const observationDistance = usable.reduce((sum, value) => sum + Math.abs(value - observation), 0) / usable.length
  let pairDistance = 0
  for (const left of usable) for (const right of usable) pairDistance += Math.abs(left - right)
  return observationDistance - 0.5 * pairDistance / usable.length ** 2
}

function skill(score, reference) {
  return Number.isFinite(score) && Number.isFinite(reference) && reference > 0
    ? 1 - score / reference
    : null
}

export function buildCrpsSkill(documents, systemId) {
  const observations = new Map()
  for (const document of documents) {
    const value = document.reference?.temperatureMean
    if (Number.isFinite(value)) observations.set(document.validDate, value)
  }
  const dates = [...observations.keys()].sort()
  const systemScores = []
  const climatologyScores = []
  const persistenceScores = []
  for (const document of documents) {
    const score = document.systemScores?.[systemId]?.temperatureCRPS
    const observation = observations.get(document.validDate)
    if (!Number.isFinite(score) || !Number.isFinite(observation)) continue
    systemScores.push(score)
    const historical = [...observations.entries()]
      .filter(([date]) => date !== document.validDate)
      .map(([, value]) => value)
    if (historical.length >= 5) climatologyScores.push(empiricalCrps(historical, observation))
    const index = dates.indexOf(document.validDate)
    if (index > 0) {
      const previousDate = dates[index - 1]
      const gapDays = Math.round((Date.parse(`${document.validDate}T12:00:00Z`) - Date.parse(`${previousDate}T12:00:00Z`)) / 86_400_000)
      if (gapDays === 1) persistenceScores.push(Math.abs(observations.get(previousDate) - observation))
    }
  }
  const meanCrps = average(systemScores)
  const climatologyCrps = average(climatologyScores)
  const persistenceCrps = average(persistenceScores)
  return {
    climatologyCrps,
    persistenceCrps,
    crpsSkillClimatology: skill(meanCrps, climatologyCrps),
    crpsSkillPersistence: skill(meanCrps, persistenceCrps),
  }
}
