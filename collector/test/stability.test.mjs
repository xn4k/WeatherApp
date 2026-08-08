import test from 'node:test'
import assert from 'node:assert/strict'
import { compareFusionRuns } from '../src/stability.mjs'

function outlook(refreshedAt, daily) {
  return { refreshedAt, fusion: { daily } }
}

test('run stability compares only common validity dates', () => {
  const previous = outlook('2026-08-08T00:00:00Z', [
    { date: '2026-08-09', temperatureP10: 8, temperatureP50: 10, temperatureP90: 14, rainProbability1mm: 20 },
    { date: '2026-08-10', temperatureP10: 9, temperatureP50: 11, temperatureP90: 15, rainProbability1mm: 40 },
  ])
  const current = outlook('2026-08-08T06:00:00Z', [
    { date: '2026-08-10', temperatureP10: 8, temperatureP50: 13, temperatureP90: 16, rainProbability1mm: 25 },
    { date: '2026-08-11', temperatureP10: 7, temperatureP50: 9, temperatureP90: 12, rainProbability1mm: 10 },
  ])

  const stability = compareFusionRuns(previous, current)
  assert.equal(stability.comparedDays, 1)
  assert.equal(stability.meanAbsoluteTemperatureShift, 2)
  assert.equal(stability.maximumAbsoluteTemperatureShift, 2)
  assert.equal(stability.meanAbsoluteRainShift, 15)
  assert.equal(stability.meanTemperatureSpreadChange, 2)
  assert.equal(stability.daily[0].date, '2026-08-10')
})

test('run stability stays absent without overlapping days', () => {
  const previous = outlook('2026-08-08T00:00:00Z', [
    { date: '2026-08-09', temperatureP10: 8, temperatureP50: 10, temperatureP90: 14, rainProbability1mm: 20 },
  ])
  const current = outlook('2026-09-08T00:00:00Z', [
    { date: '2026-09-09', temperatureP10: 8, temperatureP50: 10, temperatureP90: 14, rainProbability1mm: 20 },
  ])
  assert.equal(compareFusionRuns(previous, current), null)
})
