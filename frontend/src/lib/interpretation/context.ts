import type { ClimateDay } from '../../types/evidence'
import type { Outlook } from '../../types/outlook'
import { leadBucket, median, range } from './helpers'
import type { DeterministicContext, InterpretationContext } from './types'

function availableDates(outlook: Outlook) {
  if (outlook.mode === 'ensemble') {
    return outlook.fusion?.daily.map((day) => day.date) ?? []
  }
  return [...new Set((outlook.models ?? []).flatMap((model) =>
    model.daily.map((day) => day.date),
  ))].sort()
}

function deterministicContext(outlook: Outlook, date: string): DeterministicContext | null {
  const modelDays = (outlook.models ?? []).flatMap((model) => {
    const day = model.daily.find((candidate) => candidate.date === date)
    return day ? [{ id: model.id, short: model.short, day }] : []
  })
  if (!modelDays.length) return null

  const days = modelDays.map((entry) => entry.day)
  const minimumSpread = range(days.map((day) => day.temperatureMin))
  const maximumSpread = range(days.map((day) => day.temperatureMax))
  const spreads = [minimumSpread, maximumSpread].filter(Number.isFinite) as number[]

  return {
    modelDays,
    temperatureMin: median(days.map((day) => day.temperatureMin)),
    temperatureMax: median(days.map((day) => day.temperatureMax)),
    temperatureSpread: spreads.length ? Math.max(...spreads) : null,
    precipitationMedian: median(days.map((day) => day.precipitation)),
    wetModelCount: days.filter((day) => day.precipitation >= 1).length,
    modelCount: days.length,
    apparentTemperature: median(days.map((day) => day.apparentTemperatureMax)),
    relativeHumidity: median(days.map((day) => day.relativeHumidityMean)),
    dewPoint: median(days.map((day) => day.dewPointMean)),
    windSpeed: median(days.map((day) => day.windSpeedMean)),
  }
}

export function buildInterpretationContext(
  outlook: Outlook,
  date: string,
  climate: ClimateDay | null = null,
): InterpretationContext {
  const dates = availableDates(outlook)
  const index = Math.max(0, dates.indexOf(date))
  const fusionDays = outlook.fusion?.daily ?? []
  const fusionIndex = fusionDays.findIndex((day) => day.date === date)

  return {
    outlook,
    date,
    leadIndex: index,
    leadBucket: leadBucket(index),
    deterministic: deterministicContext(outlook, date),
    fusionDay: fusionDays.find((day) => day.date === date) ?? null,
    previousFusionDay: fusionIndex > 0 ? fusionDays[fusionIndex - 1] : null,
    uncertainty: outlook.analysis?.uncertainty.daily.find((day) => day.date === date) ?? null,
    scenarioWindow: outlook.analysis?.scenarios.windows.find((window) => window.dates.includes(date)) ?? null,
    runMemoryDay: outlook.runMemory?.daily.find((day) => day.date === date) ?? null,
    runStabilityDay: outlook.runStability?.daily.find((day) => day.date === date) ?? null,
    fragilityDay: outlook.fragility?.daily.find((day) => day.date === date) ?? null,
    evidenceDay: outlook.evidence?.daily.find((day) => day.date === date) ?? null,
    mosmixDay: outlook.challengers?.mosmix?.daily.find((day) => day.date === date) ?? null,
    challengerDay: outlook.calibrationChallenger?.daily.find((day) => day.date === date) ?? null,
    climate,
  }
}
