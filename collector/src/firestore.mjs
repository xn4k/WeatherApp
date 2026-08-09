import { FieldValue, Firestore } from '@google-cloud/firestore'
import { compareFusionRuns } from './stability.mjs'
import { attachFragility } from './evidence-engine.mjs'

function serviceAccountOptions() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!raw) return {}
  try {
    const account = JSON.parse(raw)
    return {
      credentials: {
        client_email: account.client_email,
        private_key: account.private_key,
      },
    }
  } catch (error) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON ist kein gültiges JSON: ${error.message}`)
  }
}

export function createFirestore() {
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID fehlt.')
  return new Firestore({
    projectId,
    ignoreUndefinedProperties: true,
    ...serviceAccountOptions(),
  })
}

export async function publishSnapshot(database, snapshot) {
  const locationRef = database.collection('publicWeather').doc(snapshot.location.id)
  const runRef = locationRef.collection('runs').doc(snapshot.runId)
  const previous = await locationRef.get()
  if (previous.data()?.latestRunId === snapshot.runId) return runRef.path

  const runStability = compareFusionRuns(
    previous.data()?.latestOutlook,
    snapshot.outlook,
  )
  const outlookWithStability = runStability
    ? { ...snapshot.outlook, runStability }
    : snapshot.outlook
  const outlook = attachFragility(outlookWithStability, runStability)
  const batch = database.batch()

  batch.set(locationRef, {
    schemaVersion: snapshot.schemaVersion,
    id: snapshot.location.id,
    name: snapshot.location.name,
    region: snapshot.location.region,
    country: snapshot.location.country,
    latitude: snapshot.location.latitude,
    longitude: snapshot.location.longitude,
    timezone: snapshot.location.timezone,
    latestRunId: snapshot.runId,
    latestOutlook: outlook,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  batch.set(runRef, {
    schemaVersion: snapshot.schemaVersion,
    algorithmVersion: snapshot.algorithmVersion,
    capturedAt: snapshot.capturedAt,
    payloadHash: snapshot.payloadHash,
    source: snapshot.source,
    modelIds: snapshot.models.map((model) => model.id),
    warnings: snapshot.outlook.warnings,
    outlook,
    storedAt: FieldValue.serverTimestamp(),
  })

  snapshot.models.forEach((model) => {
    batch.set(runRef.collection('models').doc(model.id), {
      schemaVersion: snapshot.schemaVersion,
      algorithmVersion: snapshot.algorithmVersion,
      ...model,
    })
  })

  await batch.commit()
  return runRef.path
}
