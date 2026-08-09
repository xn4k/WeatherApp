import { quantile, round } from './fusion.mjs'

export const CLIMATE_METHOD = 'calendar-climatology-v1.0.0'
export const CLIMATE_REFERENCE_PERIOD = Object.freeze({ start: 1991, end: 2020 })

function finite(values) {
  return values.filter(Number.isFinite)
}

function rounded(value, precision = 2) {
  return Number.isFinite(value) ? round(value, precision) : null
}

function record(observations, field, order) {
  const valid = observations.filter((entry) => Number.isFinite(entry[field]))
  if (!valid.length) return null
  const selected = valid.reduce((best, entry) => (
    order(entry[field], best[field]) ? entry : best
  ))
  return { value: rounded(selected[field]), year: Number(selected.date.slice(0, 4)) }
}

function frequency(values, threshold) {
  const samples = finite(values)
  if (!samples.length) return null
  return round(100 * samples.filter((value) => value >= threshold).length / samples.length, 1)
}

function monthDay(date) {
  return date.slice(5)
}

export function buildClimateCalendar(observations, station, referencePeriod = CLIMATE_REFERENCE_PERIOD) {
  const grouped = new Map()
  for (const observation of observations) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observation.date)) continue
    const key = monthDay(observation.date)
    const values = grouped.get(key) ?? []
    values.push(observation)
    grouped.set(key, values)
  }

  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, history]) => {
    history.sort((left, right) => left.date.localeCompare(right.date))
    const reference = history.filter((entry) => {
      const year = Number(entry.date.slice(0, 4))
      return year >= referencePeriod.start && year <= referencePeriod.end
    })
    const temperatureReference = finite(reference.map((entry) => entry.temperatureMean))
    const precipitation = history.map((entry) => entry.precipitationSum)
    const firstYear = Number(history[0].date.slice(0, 4))
    const lastYear = Number(history.at(-1).date.slice(0, 4))

    return {
      method: CLIMATE_METHOD,
      monthDay: key,
      source: 'dwd-cdc',
      referenceKind: 'station-observation',
      station,
      referencePeriod,
      sampleYears: new Set(history.map((entry) => entry.date.slice(0, 4))).size,
      referenceSampleYears: new Set(reference.map((entry) => entry.date.slice(0, 4))).size,
      firstYear,
      lastYear,
      temperatureP10: rounded(quantile(temperatureReference, 0.1)),
      temperatureP50: rounded(quantile(temperatureReference, 0.5)),
      temperatureP90: rounded(quantile(temperatureReference, 0.9)),
      maximumRecord: record(history, 'temperatureMax', (value, best) => value > best),
      minimumRecord: record(history, 'temperatureMin', (value, best) => value < best),
      wettestRecord: record(history, 'precipitationSum', (value, best) => value > best),
      rainFrequency1mm: frequency(precipitation, 1),
      rainFrequency10mm: frequency(precipitation, 10),
      history: history.map((entry) => ({
        date: entry.date,
        temperatureMean: rounded(entry.temperatureMean),
        temperatureMin: rounded(entry.temperatureMin),
        temperatureMax: rounded(entry.temperatureMax),
        precipitationSum: rounded(entry.precipitationSum),
        sunshineHours: rounded(entry.sunshineHours),
        qualityLevel: entry.qualityLevel ?? null,
        qualityStatus: entry.qualityStatus,
      })),
      notice: `Stationsmessungen; Klimavergleich ${referencePeriod.start}-${referencePeriod.end}. Rekorde beziehen sich nur auf die verfuegbaren Stationsjahre.`,
    }
  })
}

export function climateAnomaly(day, climateDay) {
  if (!day || !climateDay || !Number.isFinite(day.temperatureP50) || !Number.isFinite(climateDay.temperatureP50)) return null
  const history = finite(climateDay.history?.map((entry) => entry.temperatureMean) ?? [])
  const percentile = history.length
    ? 100 * history.filter((value) => value <= day.temperatureP50).length / history.length
    : null
  return {
    forecastDate: day.date,
    monthDay: monthDay(day.date),
    forecastTemperatureP50: day.temperatureP50,
    climateTemperatureP50: climateDay.temperatureP50,
    anomaly: round(day.temperatureP50 - climateDay.temperatureP50, 2),
    percentile: rounded(percentile, 1),
    sampleYears: climateDay.sampleYears,
  }
}
