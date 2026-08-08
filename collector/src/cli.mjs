import { readFile } from 'node:fs/promises'
import { createFirestore, publishSnapshot } from './firestore.mjs'
import { loadCalibration, updateVerification } from './firestore-verification.mjs'
import { collectOpenMeteo } from './openmeteo.mjs'
import { buildSnapshot, snapshotSummary } from './snapshot.mjs'

const argumentsSet = new Set(process.argv.slice(2))
const dryRun = argumentsSet.has('--dry-run')
const selectedLocation = process.argv.find((argument) => argument.startsWith('--location='))?.split('=')[1]

function validateLocation(location) {
  const required = ['id', 'name', 'latitude', 'longitude', 'timezone']
  const missing = required.filter((field) => location[field] === undefined || location[field] === '')
  if (missing.length) throw new Error(`Standort unvollständig (${missing.join(', ')}).`)
  if (!Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    throw new Error(`Ungültige Koordinaten für ${location.id}.`)
  }
  return location
}

async function readLocations() {
  const raw = await readFile(new URL('../locations.json', import.meta.url), 'utf8')
  return JSON.parse(raw)
    .filter((location) => location.enabled !== false)
    .filter((location) => !selectedLocation || location.id === selectedLocation)
    .map(validateLocation)
}

async function main() {
  const locations = await readLocations()
  if (!locations.length) throw new Error('Kein aktiver Standort für den Collector gefunden.')
  const database = dryRun ? null : createFirestore()

  for (const location of locations) {
    console.log(`[collect] ${location.name}: Modelle werden geladen`)
    const calibration = database ? await loadCalibration(database, location.id) : null
    const collected = await collectOpenMeteo(location, fetch, calibration)
    const snapshot = buildSnapshot(location, collected)
    console.log(JSON.stringify(snapshotSummary(snapshot), null, 2))
    if (database) {
      const path = await publishSnapshot(database, snapshot)
      console.log(`[publish] ${path}`)
      const verification = await updateVerification(database, location)
      console.log(`[verify] ${JSON.stringify(verification)}`)
    }
  }

  if (dryRun) console.log('[dry-run] Keine Daten wurden in Firestore geschrieben.')
}

main().catch((error) => {
  console.error(`[collector] ${error.stack ?? error.message}`)
  process.exitCode = 1
})
