import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFusion,
  modelBalancedProbability,
  modelBalancedQuantile,
  quantile,
} from '../src/fusion.mjs'

test('quantile interpolates an individual ensemble distribution', () => {
  assert.equal(quantile([0, 10], 0.5), 5)
  assert.equal(quantile([Number.NaN, 3], 0.5), 3)
  assert.equal(quantile([], 0.5), null)
})

test('each model receives equal total weight regardless of member count', () => {
  const hundredColdMembers = Array.from({ length: 100 }, () => 0)
  assert.equal(modelBalancedQuantile([hundredColdMembers, [20]], 0.5), 0)
  assert.equal(modelBalancedQuantile([hundredColdMembers, [20]], 0.75), 20)
  assert.equal(modelBalancedProbability([hundredColdMembers, [20]], 10), 0.5)
})

test('fusion reports the changing model and member composition per day', () => {
  const models = [
    {
      id: 'large', name: 'Large', short: 'L', includeInFusion: true, memberCount: 3,
      daily: [
        { date: '2026-08-09', temperatureMembers: [10, 11, 12], precipitationMembers: [0, 1, 2], apparentTemperatureMembers: [8, 9, 10], apparentTemperatureMaxMembers: [15, 16, 17], relativeHumidityMembers: [40, 42, 44], dewPointMembers: [2, 3, 4], windSpeedMembers: [10, 11, 12] },
        { date: '2026-08-10', temperatureMembers: [12, 13, 14], precipitationMembers: [0, 0, 0] },
      ],
    },
    {
      id: 'small', name: 'Small', short: 'S', includeInFusion: true, memberCount: 1,
      daily: [
        { date: '2026-08-09', temperatureMembers: [20], precipitationMembers: [10], apparentTemperatureMembers: [18], apparentTemperatureMaxMembers: [24], relativeHumidityMembers: [70], dewPointMembers: [14], windSpeedMembers: [20] },
      ],
    },
    {
      id: 'reference', name: 'Reference', short: 'R', includeInFusion: false, memberCount: 1,
      daily: [
        { date: '2026-08-09', temperatureMembers: [99], precipitationMembers: [99] },
      ],
    },
  ]

  const fusion = buildFusion(models)
  assert.equal(fusion.daily[0].modelCount, 2)
  assert.equal(fusion.daily[0].memberCount, 4)
  assert.equal(fusion.daily[0].rainProbability10mm, 50)
  assert.equal(fusion.daily[1].modelCount, 1)
  assert.equal(fusion.daily[1].memberCount, 3)
  assert.equal(fusion.daily[0].temperatureP90, 20)
  assert.equal(fusion.daily[0].apparentTemperatureP50, 10)
  assert.equal(fusion.daily[0].relativeHumidityP50, 44)
  assert.equal(fusion.daily[1].apparentTemperatureP50, null)
})
