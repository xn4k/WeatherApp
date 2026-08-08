import test from 'node:test'
import assert from 'node:assert/strict'
import { brierScore, ensembleCRPS, meanAbsoluteError } from '../src/verification.mjs'

test('MAE measures the average absolute temperature error', () => {
  assert.equal(meanAbsoluteError([2, 4], [1, 7]), 2)
  assert.equal(meanAbsoluteError([], []), null)
})

test('Brier score rewards calibrated binary-event probabilities', () => {
  assert.ok(Math.abs(brierScore([0.8, 0.2], [1, 0]) - 0.04) < 1e-12)
  assert.equal(brierScore([1.2], [1]), null)
})

test('CRPS evaluates the complete ensemble distribution', () => {
  assert.equal(ensembleCRPS([12], 12), 0)
  assert.equal(ensembleCRPS([10], 12), 2)
  assert.equal(ensembleCRPS([], 12), null)
})
