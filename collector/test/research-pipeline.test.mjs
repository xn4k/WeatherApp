import test from 'node:test'
import assert from 'node:assert/strict'
import { assessDataQuality } from '../src/data-quality.mjs'
import { buildRunMemory } from '../src/run-memory.mjs'
import { buildProbabilisticDiagnostics } from '../src/probabilistic-diagnostics.mjs'
import { buildCalibrationChallenger } from '../src/calibration-challenger.mjs'

function outlook(capturedAt, value) {
  return { refreshedAt: capturedAt, fusion: { daily: [{ date: '2026-08-15', temperatureP50: value }] } }
}

test('multi-run memory detects direction changes without calling them error probabilities', () => {
  const memory = buildRunMemory([
    { capturedAt: '2026-08-08T00:00:00Z', outlook: outlook('2026-08-08T00:00:00Z', 20) },
    { capturedAt: '2026-08-08T06:00:00Z', outlook: outlook('2026-08-08T06:00:00Z', 22) },
    { capturedAt: '2026-08-08T12:00:00Z', outlook: outlook('2026-08-08T12:00:00Z', 21) },
  ], outlook('2026-08-08T18:00:00Z', 23))
  assert.equal(memory.daily[0].flipFlopCount, 2)
  assert.equal(memory.runCount, 4)
  assert.match(memory.notice, /Stabilitaet/)
})

test('data quality becomes degraded when a fusion source is missing', () => {
  const definitions = [
    { id: 'a', forecastDays: 2, includeInFusion: true },
    { id: 'b', forecastDays: 2, includeInFusion: true },
  ]
  const quality = assessDataQuality([{
    id: 'a', memberCount: 2, daily: [
      { temperatureMembers: [1, 2], precipitationMembers: [0, 1] },
      { temperatureMembers: [2, 3], precipitationMembers: [0, 0] },
    ],
  }], definitions)
  assert.equal(quality.health, 'degraded')
  assert.deepEqual(quality.missingModelIds, ['b'])
})

function scoreDocument(index) {
  const probability = index % 2 ? 0.8 : 0.2
  const outcome = index % 2 ? 1 : 0
  return {
    validDate: `2026-07-${String(index + 1).padStart(2, '0')}`,
    leadBucket: 'days-0-3',
    reference: { temperatureMean: 20 + outcome, precipitationSum: outcome ? 2 : 0 },
    systemScores: {
      baseline: {
        temperatureP10: 18, temperatureP50: 20, temperatureP90: 22,
        temperatureCRPS: 1, temperatureIntervalHit: true, temperatureRankFraction: outcome ? 0.7 : 0.4,
        rainProbability1mm: probability, rainProbability10mm: 0,
      },
      shadow: {
        temperatureP10: 18, temperatureP50: 20.5, temperatureP90: 22,
        temperatureCRPS: 0.9, temperatureIntervalHit: true, temperatureRankFraction: 0.5,
        rainProbability1mm: probability, rainProbability10mm: 0,
      },
    },
  }
}

test('reliability diagnostics and challenger parameters stay observational', () => {
  const diagnostics = buildProbabilisticDiagnostics(Array.from({ length: 30 }, (_, index) => scoreDocument(index)))
  const bucket = diagnostics.buckets['days-0-3']
  assert.equal(bucket.distinctDays, 30)
  assert.ok(bucket.baseline.rain1mm.skill > 0)
  assert.ok(Number.isFinite(bucket.baseline.temperature.crpsSkillClimatology))
  assert.equal(diagnostics.challengerParameters['days-0-3'].eligible, true)

  const challenger = buildCalibrationChallenger({ daily: [{
    date: '2026-08-10', temperatureP10: 18, temperatureP25: 19, temperatureP50: 20,
    temperatureP75: 21, temperatureP90: 22,
  }] }, diagnostics, '2026-08-09T00:00:00Z', 'UTC')
  assert.equal(challenger.live, false)
  assert.equal(challenger.status, 'shadow-ready')
})
