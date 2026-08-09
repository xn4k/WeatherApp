import { createHash } from 'node:crypto'
import { SKILL_ALGORITHM_VERSION as ALGORITHM_VERSION } from './skill-fusion.mjs'

export const SCHEMA_VERSION = 1

export function buildSnapshot(location, collected) {
  const payload = JSON.stringify({
    algorithmVersion: ALGORITHM_VERSION,
    models: collected.models,
    fusion: collected.outlook.fusion,
    evidence: collected.outlook.evidence,
    challengers: collected.outlook.challengers,
  })
  const payloadHash = createHash('sha256').update(payload).digest('hex')
  return {
    schemaVersion: SCHEMA_VERSION,
    algorithmVersion: ALGORITHM_VERSION,
    runId: payloadHash.slice(0, 24),
    payloadHash,
    capturedAt: collected.outlook.refreshedAt,
    source: 'open-meteo',
    location,
    models: collected.models,
    outlook: collected.outlook,
  }
}

export function snapshotSummary(snapshot) {
  return {
    location: `${snapshot.location.name} (${snapshot.location.id})`,
    runId: snapshot.runId,
    capturedAt: snapshot.capturedAt,
    models: snapshot.models.map((model) => `${model.short}:${model.memberCount}`),
    fusionDays: snapshot.outlook.fusion.daily.length,
    warnings: snapshot.outlook.warnings,
    approximateBytes: Buffer.byteLength(JSON.stringify(snapshot), 'utf8'),
  }
}
