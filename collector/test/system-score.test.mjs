import test from 'node:test'
import assert from 'node:assert/strict'
import { scoreForecastRun } from '../src/verification.mjs'

test('verification scores champion, frozen shadow and MOSMIX through the complete path', () => {
  const date = '2026-08-10'
  const model = {
    id: 'test-model',
    daily: [{
      date,
      temperatureMembers: [11, 12, 13],
      precipitationMembers: [0, 4, 8],
    }],
  }
  const run = {
    id: 'run-system',
    capturedAt: '2026-08-07T06:00:00Z',
    outlook: {
      fusion: { daily: [{
        date,
        temperatureP10: 11,
        temperatureP50: 12,
        temperatureP90: 13,
        precipitationP50: 4,
        rainProbability1mm: 66.7,
        rainProbability10mm: 0,
      }] },
      evidence: {
        profile: { weightsByBucket: {}, evidence: { parametersByBucket: {} } },
        daily: [{
          date,
          temperatureP10: 10.5,
          temperatureP50: 11.8,
          temperatureP90: 13.5,
          precipitationP50: 4,
          rainProbability1mm: 66.7,
          rainProbability10mm: 0,
        }],
      },
      challengers: { mosmix: { daily: [{ date, temperatureMean: 12.5, precipitationSum: 3 }] } },
    },
  }
  const reference = {
    date,
    temperatureMean: 12,
    precipitationSum: 4,
    source: 'test-reference',
    kind: 'station-observation',
  }

  const score = scoreForecastRun(run, [model], reference, 'Europe/Berlin')

  assert.ok(Number.isFinite(score.systemScores.baseline.temperatureCRPS))
  assert.ok(Number.isFinite(score.systemScores.shadow.temperatureCRPS))
  assert.equal(score.systemScores.shadow.temperatureAbsoluteError, 0.2)
  assert.equal(score.systemScores.mosmix.temperatureAbsoluteError, 0.5)
})
