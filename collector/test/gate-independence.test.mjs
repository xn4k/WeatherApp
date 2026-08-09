import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateEvidence } from '../src/evidence-engine.mjs'

test('multiple forecast runs for one validity date count as one independent gate sample', () => {
  const documents = Array.from({ length: 30 }, () => ({
    validDate: '2026-08-09',
    leadBucket: 'days-0-3',
    modelScores: {},
    systemScores: {
      baseline: { temperatureCRPS: 2 },
      shadow: { temperatureCRPS: 1 },
    },
  }))

  const gate = aggregateEvidence(documents).gate

  assert.equal(gate.distinctDays, 1)
  assert.equal(gate.samples, 1)
  assert.equal(gate.forecastComparisons, 30)
  assert.equal(gate.promotionEligible, false)
})
