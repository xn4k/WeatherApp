import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSkillFusion, skillWeightedQuantile } from '../src/skill-fusion.mjs'

const groups = [
  { modelId: 'cold', values: [0, 0] },
  { modelId: 'warm', values: [20] },
]

test('skill weighting preserves equal total model weight as its neutral state', () => {
  assert.equal(skillWeightedQuantile(groups, 0.5), 0)
  assert.equal(skillWeightedQuantile(groups, 0.5, { cold: 0.5, warm: 2 }), 20)
})

test('fusion reports when verified weights are actually active', () => {
  const models = groups.map((group) => ({
    id: group.modelId,
    includeInFusion: true,
    daily: [{
      date: '2026-08-09',
      temperatureMembers: group.values,
      precipitationMembers: group.values,
    }],
  }))
  const calibration = {
    weightsByBucket: {
      'days-0-3': {
        active: true,
        temperature: { cold: 0.5, warm: 2 },
        precipitation: { cold: 0.5, warm: 2 },
      },
    },
  }
  const fusion = buildSkillFusion(models, calibration)
  assert.equal(fusion.method, 'skill-weighted-empirical')
  assert.equal(fusion.daily[0].temperatureP50, 20)
  assert.equal(fusion.daily[0].modelCount, 2)
})
