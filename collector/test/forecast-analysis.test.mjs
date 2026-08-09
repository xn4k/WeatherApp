import test from 'node:test'
import assert from 'node:assert/strict'
import { buildForecastAnalysis, buildUncertaintyDecomposition } from '../src/forecast-analysis.mjs'

function model(id, members, days = 5) {
  return {
    id, includeInFusion: true, memberCount: members.length,
    daily: Array.from({ length: days }, (_, index) => ({
      date: `2026-08-${String(index + 10).padStart(2, '0')}`,
      temperatureMembers: members.map((value) => value + index),
      precipitationMembers: members.map((value) => Math.max(0, value / 10)),
    })),
  }
}

test('total variance is exactly decomposed into within-model and between-model variance', () => {
  const result = buildUncertaintyDecomposition([
    model('a', [-1, 1], 1),
    model('b', [1, 3], 1),
  ]).daily[0].temperature
  assert.equal(result.withinVariance, 1)
  assert.equal(result.betweenVariance, 1)
  assert.equal(result.totalVariance, 2)
  assert.equal(result.withinShare, 50)
  assert.equal(result.betweenShare, 50)
})

test('scenario shares remain model-balanced even with unequal member counts', () => {
  const analysis = buildForecastAnalysis([
    model('small', [10, 12]),
    model('large', [5, 6, 7, 8, 9, 10, 11, 12]),
  ])
  const near = analysis.scenarios.windows.find((window) => window.id === 'near')
  assert.ok(near)
  assert.ok(near.scenarios.length >= 2)
  assert.ok(Math.abs(near.scenarios.reduce((sum, scenario) => sum + scenario.modelBalancedShare, 0) - 100) <= 0.2)
  assert.equal(near.trajectoryCount, 10)
})
