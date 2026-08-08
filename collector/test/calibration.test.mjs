import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateSkill } from '../src/calibration.mjs'

function documents(days) {
  return Array.from({ length: days }, (_, index) => ({
    validDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
    leadBucket: 'days-0-3',
    modelScores: {
      good: {
        temperatureAbsoluteError: 1,
        temperatureCRPS: 0.8,
        precipitationAbsoluteError: 0.5,
        brier1mm: 0.1,
        brier10mm: 0.05,
      },
      weak: {
        temperatureAbsoluteError: 3,
        temperatureCRPS: 2.5,
        precipitationAbsoluteError: 2,
        brier1mm: 0.35,
        brier10mm: 0.25,
      },
    },
  }))
}

test('skill weights stay disabled before enough distinct verification days exist', () => {
  const profile = aggregateSkill(documents(13))
  assert.equal(profile.status, 'collecting')
  assert.deepEqual(profile.activeBuckets, [])
})

test('skill weights activate conservatively after the minimum sample is reached', () => {
  const profile = aggregateSkill(documents(14))
  const weights = profile.weightsByBucket['days-0-3']
  assert.equal(profile.status, 'active')
  assert.ok(weights.temperature.good > 1)
  assert.ok(weights.temperature.weak < 1)
  assert.ok(weights.precipitation.good > weights.precipitation.weak)
  assert.ok(weights.temperature.good <= 2)
  assert.ok(weights.temperature.weak >= 0.5)
})
