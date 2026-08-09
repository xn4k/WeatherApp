import { round } from './fusion.mjs'

export const ANALYSIS_VERSION = 'forecast-analysis-v1.0.0'

function finite(values) {
  return values.filter(Number.isFinite)
}

function average(values) {
  const usable = finite(values)
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null
}

function variance(values) {
  const usable = finite(values)
  const mean = average(usable)
  return usable.length && Number.isFinite(mean)
    ? usable.reduce((sum, value) => sum + (value - mean) ** 2, 0) / usable.length
    : null
}

function weightedAverage(points) {
  const usable = points.filter((point) => Number.isFinite(point.value) && point.weight > 0)
  const total = usable.reduce((sum, point) => sum + point.weight, 0)
  return total ? usable.reduce((sum, point) => sum + point.value * point.weight, 0) / total : null
}

function decomposition(groups) {
  const usable = groups.map(finite).filter((group) => group.length)
  if (!usable.length) return null
  const means = usable.map(average)
  const withinVariance = average(usable.map(variance)) ?? 0
  const betweenVariance = variance(means) ?? 0
  const totalVariance = withinVariance + betweenVariance
  return {
    withinVariance: round(withinVariance, 3),
    betweenVariance: round(betweenVariance, 3),
    totalVariance: round(totalVariance, 3),
    withinShare: totalVariance ? round(100 * withinVariance / totalVariance) : 0,
    betweenShare: totalVariance ? round(100 * betweenVariance / totalVariance) : 0,
  }
}

export function buildUncertaintyDecomposition(models) {
  const eligible = models.filter((model) => model.includeInFusion !== false)
  const dates = [...new Set(eligible.flatMap((model) => model.daily.map((day) => day.date)))].sort()
  return {
    method: 'law-of-total-variance-v1.0.0',
    daily: dates.flatMap((date) => {
      const days = eligible.flatMap((model) => {
        const day = model.daily.find((candidate) => candidate.date === date)
        return day ? [day] : []
      })
      const temperature = decomposition(days.map((day) => day.temperatureMembers ?? []))
      const precipitation = decomposition(days.map((day) => day.precipitationMembers ?? []))
      return temperature ? [{
        date,
        modelCount: days.length,
        temperature,
        precipitation,
      }] : []
    }),
    notice: 'Die Gesamtvarianz wird exakt in Streuung innerhalb der Modelle und Dissens zwischen den Modellmitteln zerlegt. Sie ist keine kalibrierte Fehlerwahrscheinlichkeit.',
  }
}

function distance(left, right) {
  return left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0)
}

function normalizedFeatures(trajectories, dates) {
  const columns = Array.from({ length: dates.length * 2 }, (_, column) => {
    const values = trajectories.map((trajectory) => trajectory.raw[column])
    const mean = average(values) ?? 0
    const scale = Math.sqrt(variance(values) ?? 0) || 1
    return { mean, scale }
  })
  return trajectories.map((trajectory) => ({
    ...trajectory,
    features: trajectory.raw.map((value, index) => (value - columns[index].mean) / columns[index].scale),
  }))
}

function initialCenters(trajectories, count) {
  const mean = trajectories[0].features.map((_, index) => weightedAverage(
    trajectories.map((trajectory) => ({ value: trajectory.features[index], weight: trajectory.weight })),
  ))
  const centers = [trajectories.reduce((best, trajectory) => (
    distance(trajectory.features, mean) > distance(best.features, mean) ? trajectory : best
  )).features]
  while (centers.length < count) {
    const next = trajectories.reduce((best, trajectory) => {
      const nearest = Math.min(...centers.map((center) => distance(trajectory.features, center)))
      const bestNearest = Math.min(...centers.map((center) => distance(best.features, center)))
      return nearest > bestNearest ? trajectory : best
    })
    centers.push([...next.features])
  }
  return centers
}

function cluster(trajectories, count) {
  let centers = initialCenters(trajectories, count)
  let assignments = []
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const nextAssignments = trajectories.map((trajectory) => {
      const distances = centers.map((center) => distance(trajectory.features, center))
      return distances.indexOf(Math.min(...distances))
    })
    if (assignments.length && nextAssignments.every((value, index) => value === assignments[index])) break
    assignments = nextAssignments
    centers = centers.map((center, clusterIndex) => center.map((fallback, featureIndex) => (
      weightedAverage(trajectories.flatMap((trajectory, index) => assignments[index] === clusterIndex
        ? [{ value: trajectory.features[featureIndex], weight: trajectory.weight }]
        : [])) ?? fallback
    )))
  }
  return { assignments, centers }
}

function trajectoriesForWindow(models, dates) {
  const candidates = models.flatMap((model) => {
    const days = dates.map((date) => model.daily.find((day) => day.date === date))
    if (days.some((day) => !day)) return []
    const memberCount = Math.min(...days.map((day) => day.temperatureMembers?.length ?? 0))
    if (!memberCount) return []
    return Array.from({ length: memberCount }, (_, memberIndex) => {
      const temperatures = days.map((day) => day.temperatureMembers[memberIndex])
      const precipitation = days.map((day) => day.precipitationMembers?.[memberIndex] ?? 0)
      if (temperatures.some((value) => !Number.isFinite(value))) return null
      return {
        modelId: model.id,
        memberIndex,
        temperatures,
        precipitation,
        raw: [...temperatures, ...precipitation.map((value) => Math.log1p(Math.max(0, value)))],
      }
    }).filter(Boolean)
  })
  const modelCounts = Object.fromEntries(models.map((model) => [
    model.id,
    candidates.filter((trajectory) => trajectory.modelId === model.id).length,
  ]).filter(([, count]) => count > 0))
  const modelCount = Object.keys(modelCounts).length
  return candidates.map((trajectory) => ({
    ...trajectory,
    weight: 1 / modelCount / modelCounts[trajectory.modelId],
  }))
}

function summarizeScenario(trajectories, assignments, clusterIndex, dates, totalTrajectories) {
  const members = trajectories.filter((_, index) => assignments[index] === clusterIndex)
  const totalWeight = members.reduce((sum, member) => sum + member.weight, 0)
  if (!members.length || !totalWeight) return null
  const weightedAt = (values) => weightedAverage(values.map((value, index) => ({
    value,
    weight: members[index].weight,
  })))
  const modelComposition = Object.fromEntries([...new Set(members.map((member) => member.modelId))]
    .map((modelId) => [modelId, members.filter((member) => member.modelId === modelId).length]))
  return {
    id: `scenario-${clusterIndex + 1}`,
    modelBalancedShare: round(totalWeight * 100),
    rawMemberShare: round(100 * members.length / totalTrajectories),
    memberCount: members.length,
    modelCount: Object.keys(modelComposition).length,
    modelComposition,
    daily: dates.map((date, dateIndex) => ({
      date,
      temperature: round(weightedAt(members.map((member) => member.temperatures[dateIndex])) ?? 0),
      precipitation: round(weightedAt(members.map((member) => member.precipitation[dateIndex])) ?? 0, 2),
    })),
  }
}

export function buildScenarioEngine(models) {
  const eligible = models.filter((model) => model.includeInFusion !== false)
  const allDates = [...new Set(eligible.flatMap((model) => model.daily.map((day) => day.date)))].sort()
  const definitions = [
    { id: 'near', label: 'Tag 1-5', dates: allDates.slice(0, 5) },
    { id: 'medium', label: 'Tag 6-15', dates: allDates.slice(5, 15) },
    { id: 'extended', label: 'Tag 16-30', dates: allDates.slice(15, 30) },
  ]
  const windows = definitions.flatMap((definition) => {
    if (definition.dates.length < 2) return []
    const raw = trajectoriesForWindow(eligible, definition.dates)
    if (raw.length < 4) return []
    const trajectories = normalizedFeatures(raw, definition.dates)
    const clusterCount = trajectories.length >= 12 ? 3 : 2
    const result = cluster(trajectories, clusterCount)
    const scenarios = Array.from({ length: clusterCount }, (_, clusterIndex) => (
      summarizeScenario(trajectories, result.assignments, clusterIndex, definition.dates, trajectories.length)
    )).filter(Boolean).sort((left, right) => right.modelBalancedShare - left.modelBalancedShare)
    const centerDistances = result.centers.flatMap((center, index) => (
      result.centers.slice(index + 1).map((other) => Math.sqrt(distance(center, other) / center.length))
    ))
    return [{
      id: definition.id,
      label: definition.label,
      dates: definition.dates,
      trajectoryCount: trajectories.length,
      modelCount: new Set(trajectories.map((trajectory) => trajectory.modelId)).size,
      branchingScore: round(Math.min(100, 25 * (Math.max(...centerDistances, 0))), 0),
      scenarios,
    }]
  })
  return {
    method: 'model-balanced-trajectory-clustering-v1.0.0',
    windows,
    notice: 'Szenarien clustern zeitlich zusammenhaengende Ensemblepfade. Modellbalancierte Anteile sind Rohsignale, keine historisch kalibrierten Wahrscheinlichkeiten.',
  }
}

export function buildForecastAnalysis(models) {
  return {
    method: ANALYSIS_VERSION,
    uncertainty: buildUncertaintyDecomposition(models),
    scenarios: buildScenarioEngine(models),
  }
}
