import test from 'node:test'
import assert from 'node:assert/strict'
import { buildClimateCalendar, climateAnomaly } from '../src/climate.mjs'

const station = { id: '02667', name: 'Koeln/Bonn' }

test('climate calendar separates the 1991-2020 normal from full station records', () => {
  const observations = [
    { date: '1950-08-09', temperatureMean: 19, temperatureMin: 12, temperatureMax: 28, precipitationSum: 0 },
    { date: '1991-08-09', temperatureMean: 20, temperatureMin: 13, temperatureMax: 29, precipitationSum: 2 },
    { date: '2005-08-09', temperatureMean: 22, temperatureMin: 15, temperatureMax: 31, precipitationSum: 12 },
    { date: '2020-08-09', temperatureMean: 24, temperatureMin: 17, temperatureMax: 35, precipitationSum: 0 },
    { date: '2025-08-09', temperatureMean: 26, temperatureMin: 18, temperatureMax: 37, precipitationSum: 25 },
  ]
  const [day] = buildClimateCalendar(observations, station)

  assert.equal(day.monthDay, '08-09')
  assert.equal(day.temperatureP50, 22)
  assert.deepEqual(day.maximumRecord, { value: 37, year: 2025 })
  assert.deepEqual(day.wettestRecord, { value: 25, year: 2025 })
  assert.equal(day.referenceSampleYears, 3)
  assert.equal(day.sampleYears, 5)
})

test('climate anomaly reports a transparent percentile against available history', () => {
  const [climate] = buildClimateCalendar([
    { date: '1991-08-09', temperatureMean: 18, temperatureMin: 10, temperatureMax: 24, precipitationSum: 0 },
    { date: '2000-08-09', temperatureMean: 20, temperatureMin: 11, temperatureMax: 26, precipitationSum: 0 },
    { date: '2020-08-09', temperatureMean: 22, temperatureMin: 12, temperatureMax: 28, precipitationSum: 0 },
  ], station)
  const anomaly = climateAnomaly({ date: '2026-08-09', temperatureP50: 21 }, climate)

  assert.equal(anomaly.anomaly, 1)
  assert.equal(anomaly.percentile, 66.7)
})
