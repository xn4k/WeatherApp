import test from 'node:test'
import assert from 'node:assert/strict'
import { aggregateEvidence, attachFragility } from '../src/evidence-engine.mjs'

function scoreDocuments(days, improvement = 1) {
  return Array.from({ length: days }, (_, index) => ({
    validDate: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    leadBucket: 'days-0-3',
    reference: { temperatureMean: 10 },
    modelScores: {
      biased: { temperatureMedian: 12, temperatureAbsoluteError: 2 },
      stable: { temperatureMedian: 10.5, temperatureAbsoluteError: 0.5 },
    },
    systemScores: {
      baseline: { temperatureCRPS: 2, temperatureP10: 8, temperatureP90: 12, temperatureIntervalHit: true },
      shadow: { temperatureCRPS: 2 - improvement },
    },
  }))
}

test('shadow challenger cannot pass the out-of-sample gate before 30 distinct days', () => {
  const evidence = aggregateEvidence(scoreDocuments(29))
  assert.equal(evidence.gate.status, 'collecting')
  assert.equal(evidence.gate.promotionEligible, false)
})

test('gate becomes eligible only when paired future CRPS improvement is statistically positive', () => {
  const evidence = aggregateEvidence(scoreDocuments(30))
  assert.equal(evidence.gate.status, 'eligible')
  assert.equal(evidence.gate.promotionEligible, true)
  assert.equal(evidence.gate.lowerConfidence95, 1)
  assert.equal(evidence.parametersByBucket['days-0-3'].modelParameters.biased.temperatureBias, 2)
})

test('fragility is labelled as an index rather than an error probability', () => {
  const outlook = attachFragility({ fusion: { daily: [{
    date: '2026-08-09', temperatureP10: 10, temperatureP90: 22, modelCount: 3,
  }] } }, { daily: [{ date: '2026-08-09', temperatureP50Shift: 3 }] })

  assert.equal(outlook.fragility.calibratedProbability, false)
  assert.equal(outlook.fragility.daily[0].level, 'high')
  assert.equal(outlook.fragility.daily[0].primaryDriver, 'modelSpread')
})
