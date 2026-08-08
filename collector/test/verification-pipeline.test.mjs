import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarLeadDays, scoreForecastRun, scoreModelDay } from '../src/verification.mjs'

const reference = {
  date: '2026-08-10',
  temperatureMean: 12,
  precipitationSum: 4,
  source: 'test-reference',
  kind: 'analysis-proxy',
}

test('model-day verification calculates deterministic and probabilistic losses', () => {
  const score = scoreModelDay({
    temperatureMembers: [10, 12, 14],
    precipitationMembers: [0, 3, 9],
  }, reference)
  assert.equal(score.temperatureAbsoluteError, 0)
  assert.equal(score.precipitationAbsoluteError, 1)
  assert.equal(score.rainProbability1mm, 0.6667)
  assert.ok(score.brier1mm < 0.12)
  assert.equal(score.brier10mm, 0)
})

test('run verification keeps lead time and model scores reproducible', () => {
  const model = {
    id: 'test-model',
    daily: [{
      date: reference.date,
      temperatureMembers: [11, 12, 13],
      precipitationMembers: [0, 4, 8],
    }],
  }
  const score = scoreForecastRun(
    { id: 'run-1', capturedAt: '2026-08-07T06:00:00Z' },
    [model],
    reference,
    'Europe/Berlin',
  )
  assert.equal(calendarLeadDays('2026-08-07T06:00:00Z', reference.date, 'Europe/Berlin'), 3)
  assert.equal(score.leadBucket, 'days-0-3')
  assert.ok(score.modelScores['test-model'])
})
