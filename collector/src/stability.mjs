import { round } from './fusion.mjs'

export const STABILITY_VERSION = 'run-stability-v1.0.0'

export function compareFusionRuns(previousOutlook, currentOutlook) {
  const previousDays = previousOutlook?.fusion?.daily
  const currentDays = currentOutlook?.fusion?.daily
  if (!Array.isArray(previousDays) || !Array.isArray(currentDays)) return null

  const previousByDate = new Map(previousDays.map((day) => [day.date, day]))
  const daily = currentDays.flatMap((day) => {
    const previous = previousByDate.get(day.date)
    if (!previous) return []
    return [{
      date: day.date,
      temperatureP50Shift: round(day.temperatureP50 - previous.temperatureP50),
      temperatureSpreadShift: round(
        (day.temperatureP90 - day.temperatureP10) -
        (previous.temperatureP90 - previous.temperatureP10),
      ),
      rainProbability1mmShift: round(
        day.rainProbability1mm - previous.rainProbability1mm,
      ),
    }]
  })
  if (!daily.length) return null

  const absoluteTemperatureShifts = daily.map((day) => Math.abs(day.temperatureP50Shift))
  return {
    method: STABILITY_VERSION,
    previousCapturedAt: previousOutlook.refreshedAt,
    comparedDays: daily.length,
    meanAbsoluteTemperatureShift: round(
      absoluteTemperatureShifts.reduce((sum, value) => sum + value, 0) / daily.length,
    ),
    maximumAbsoluteTemperatureShift: round(Math.max(...absoluteTemperatureShifts)),
    meanAbsoluteRainShift: round(
      daily.reduce((sum, day) => sum + Math.abs(day.rainProbability1mmShift), 0) / daily.length,
    ),
    meanTemperatureSpreadChange: round(
      daily.reduce((sum, day) => sum + day.temperatureSpreadShift, 0) / daily.length,
    ),
    daily,
  }
}
