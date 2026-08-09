import test from 'node:test'
import assert from 'node:assert/strict'
import { bestReferences } from '../src/reference-layer.mjs'
import { scoreForecastRun } from '../src/verification.mjs'

test('a missing DWD precipitation value falls back per variable without hiding station temperature', async () => {
  const date = '2026-08-08'
  const referenceLayer = {
    bundle: {
      station: { id: '02667', name: 'Koeln/Bonn' },
      recent: [{
        date,
        source: 'dwd-cdc',
        kind: 'station-observation',
        temperatureMean: 21.4,
        precipitationSum: null,
        qualityStatus: 'provisional',
      }],
    },
  }
  const fetchImpl = async () => ({
    ok: true,
    async json() {
      return {
        daily: {
          time: [date],
          temperature_2m_mean: [20.8],
          precipitation_sum: [2.5],
        },
      }
    },
  })

  const [reference] = await bestReferences({
    latitude: 50.9991,
    longitude: 7.0387,
    timezone: 'Europe/Berlin',
  }, [date], referenceLayer, fetchImpl)

  assert.equal(reference.temperatureMean, 21.4)
  assert.equal(reference.precipitationSum, 2.5)
  assert.equal(reference.kind, 'station-observation')
  assert.equal(reference.variableSources.temperature, 'dwd-cdc')
  assert.equal(reference.variableSources.precipitation, 'open-meteo-historical-forecast-best-match')
})

test('champion CRPS reconstructs the skill weights frozen in the forecast run', () => {
  const date = '2026-08-10'
  const models = [
    { id: 'good', daily: [{ date, temperatureMembers: [0], precipitationMembers: [0] }] },
    { id: 'weak', daily: [{ date, temperatureMembers: [10], precipitationMembers: [0] }] },
  ]
  const run = {
    id: 'weighted-run',
    capturedAt: '2026-08-09T00:00:00Z',
    outlook: {
      fusion: { daily: [{
        date,
        temperatureP10: 0,
        temperatureP50: 0,
        temperatureP90: 10,
        precipitationP50: 0,
        rainProbability1mm: 0,
        rainProbability10mm: 0,
      }] },
      calibration: {
        weightsByBucket: {
          'days-0-3': { active: true, temperature: { good: 2, weak: 0.5 }, precipitation: {} },
        },
      },
    },
  }
  const score = scoreForecastRun(run, models, {
    date,
    temperatureMean: 0,
    precipitationSum: 0,
    source: 'test',
    kind: 'station-observation',
  }, 'Europe/Berlin')

  assert.equal(score.systemScores.baseline.temperatureCRPS, 0.4)
})
