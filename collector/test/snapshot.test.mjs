import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSnapshot } from '../src/snapshot.mjs'

const location = {
  id: 'geo_1p0000_2p0000', name: 'Test', latitude: 1, longitude: 2, timezone: 'UTC',
}

function collected(refreshedAt) {
  return {
    models: [{
      id: 'm', name: 'Model', short: 'M', sourceModel: 'm', includeInFusion: true,
      memberCount: 1,
      daily: [{ date: '2026-08-09', temperatureMembers: [10], precipitationMembers: [0] }],
    }],
    outlook: {
      mode: 'ensemble', horizonDays: 1, ensembles: [], warnings: [],
      fusion: { method: 'equal-model-weighted-empirical', algorithmVersion: 'fusion-v1.0.0', daily: [], notice: 'test' },
      notice: 'test', refreshedAt, source: 'firebase',
    },
  }
}

test('same forecast payload is idempotent across collector retries', () => {
  const first = buildSnapshot(location, collected('2026-08-08T00:00:00.000Z'))
  const retry = buildSnapshot(location, collected('2026-08-08T00:01:00.000Z'))
  assert.equal(first.payloadHash, retry.payloadHash)
  assert.equal(first.runId, retry.runId)
  assert.notEqual(first.capturedAt, retry.capturedAt)
})
