import { round } from './fusion.mjs'

export const RUN_MEMORY_VERSION = 'multi-run-memory-v1.0.0'

function average(values) {
  const finite = values.filter(Number.isFinite)
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null
}

function sign(value) {
  return value > 0 ? 1 : value < 0 ? -1 : 0
}

export function buildRunMemory(previousRuns, currentOutlook, limit = 12) {
  const history = [...previousRuns]
    .filter((run) => Array.isArray(run.outlook?.fusion?.daily))
    .sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt))
    .slice(-Math.max(1, limit - 1))
  history.push({ capturedAt: currentOutlook.refreshedAt, outlook: currentOutlook })
  const dates = currentOutlook.fusion?.daily?.map((day) => day.date) ?? []
  const daily = dates.flatMap((date) => {
    const values = history.flatMap((run) => {
      const day = run.outlook.fusion.daily.find((candidate) => candidate.date === date)
      return day ? [{ capturedAt: run.capturedAt, value: day.temperatureP50 }] : []
    })
    if (values.length < 2) return []
    const changes = values.slice(1).map((entry, index) => entry.value - values[index].value)
    const directions = changes.map(sign).filter(Boolean)
    const flips = directions.slice(1).filter((direction, index) => direction !== directions[index]).length
    const absoluteChanges = changes.map(Math.abs)
    const recent = absoluteChanges.at(-1) ?? 0
    const earlier = average(absoluteChanges.slice(0, -1))
    const convergence = Number.isFinite(earlier)
      ? round(Math.max(-100, Math.min(100, 100 * (earlier - recent) / Math.max(0.1, earlier))))
      : 0
    return [{
      date,
      runCount: values.length,
      firstCapturedAt: values[0].capturedAt,
      latestShift: round(changes.at(-1)),
      meanAbsoluteShift: round(average(absoluteChanges) ?? 0),
      flipFlopCount: flips,
      flipFlopRate: round(100 * flips / Math.max(1, directions.length - 1)),
      convergence,
      state: convergence >= 20 ? 'converging' : convergence <= -20 ? 'diverging' : 'stable',
    }]
  })
  return {
    method: RUN_MEMORY_VERSION,
    runCount: history.length,
    firstCapturedAt: history[0]?.capturedAt ?? currentOutlook.refreshedAt,
    latestCapturedAt: currentOutlook.refreshedAt,
    daily,
    notice: 'Das Laufgedaechtnis misst Konvergenz und Richtungswechsel ueber mehrere archivierte Modelllaeufe. Es beschreibt Stabilitaet, nicht Trefferwahrscheinlichkeit.',
  }
}
