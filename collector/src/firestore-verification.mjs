import { FieldValue } from '@google-cloud/firestore'
import { aggregateSkill, publicCalibration } from './calibration.mjs'
import { completedReferenceDates, loadReferenceDays, REFERENCE_SOURCE } from './reference.mjs'
import { scoreForecastRun } from './verification.mjs'

const RECENT_RUN_LIMIT = 160
const SCORE_WINDOW_LIMIT = 3000
const WRITE_BATCH_LIMIT = 400

function chunks(values, size) {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) => (
    values.slice(index * size, (index + 1) * size)
  ))
}

async function commitSets(database, sets) {
  for (const group of chunks(sets, WRITE_BATCH_LIMIT)) {
    const batch = database.batch()
    group.forEach(({ reference, data, options }) => {
      if (options) batch.set(reference, data, options)
      else batch.set(reference, data)
    })
    await batch.commit()
  }
}

export async function loadCalibration(database, locationId) {
  if (!database) return null
  const snapshot = await database
    .collection('publicWeather').doc(locationId)
    .collection('calibration').doc('current')
    .get()
  return snapshot.exists ? snapshot.data() : null
}

async function existingDocumentPaths(database, references) {
  const paths = new Set()
  for (const group of chunks(references, 100)) {
    const snapshots = await database.getAll(...group)
    snapshots.filter((snapshot) => snapshot.exists)
      .forEach((snapshot) => paths.add(snapshot.ref.path))
  }
  return paths
}

async function scoreDueForecasts(database, location, references) {
  const locationRef = database.collection('publicWeather').doc(location.id)
  const runsSnapshot = await locationRef.collection('runs')
    .orderBy('capturedAt', 'desc')
    .limit(RECENT_RUN_LIMIT)
    .get()
  const candidates = runsSnapshot.docs.flatMap((document) => {
    const run = { id: document.id, ...document.data() }
    const dates = new Set(run.outlook?.fusion?.daily?.map((day) => day.date) ?? [])
    return references.flatMap((reference) => {
      if (!dates.has(reference.date)) return []
      const scoreRef = locationRef.collection('verification')
        .doc(`${run.id}_${reference.date.replaceAll('-', '')}`)
      return [{ run, runRef: document.ref, reference, scoreRef }]
    })
  })

  const existing = await existingDocumentPaths(
    database,
    candidates.map((candidate) => candidate.scoreRef),
  )
  const due = candidates.filter((candidate) => !existing.has(candidate.scoreRef.path))
  const dueByRun = new Map()
  for (const candidate of due) {
    const grouped = dueByRun.get(candidate.run.id) ?? []
    grouped.push(candidate)
    dueByRun.set(candidate.run.id, grouped)
  }
  const sets = []

  for (const candidatesForRun of dueByRun.values()) {
    const [{ run, runRef }] = candidatesForRun
    const modelsSnapshot = await runRef.collection('models').get()
    const models = modelsSnapshot.docs.map((document) => document.data())
    for (const candidate of candidatesForRun) {
      const score = scoreForecastRun(run, models, candidate.reference, location.timezone)
      if (score) sets.push({ reference: candidate.scoreRef, data: score })
    }
  }
  await commitSets(database, sets)
  return sets.length
}

async function aggregateStoredScores(database, locationRef, now) {
  const scores = await locationRef.collection('verification')
    .orderBy('validDate', 'desc')
    .limit(SCORE_WINDOW_LIMIT)
    .get()
  const profile = {
    ...aggregateSkill(scores.docs.map((document) => document.data())),
    referenceSource: REFERENCE_SOURCE,
    updatedAt: now.toISOString(),
    scoreWindowLimit: SCORE_WINDOW_LIMIT,
  }
  await locationRef.collection('calibration').doc('current').set({
    ...profile,
    storedAt: FieldValue.serverTimestamp(),
  })
  await locationRef.update(
    'latestOutlook.calibration', publicCalibration(profile),
    'calibrationUpdatedAt', FieldValue.serverTimestamp(),
  )
  return profile
}

export async function updateVerification(
  database,
  location,
  { now = new Date(), fetchImpl = fetch, backfillDays = 3 } = {},
) {
  const dates = completedReferenceDates(location.timezone, now, backfillDays)
  const references = await loadReferenceDays(location, dates, fetchImpl)
  const locationRef = database.collection('publicWeather').doc(location.id)
  await commitSets(database, references.map((reference) => ({
    reference: locationRef.collection('references').doc(reference.date),
    data: { ...reference, storedAt: FieldValue.serverTimestamp() },
    options: { merge: true },
  })))
  const newScores = await scoreDueForecasts(database, location, references)
  const profile = await aggregateStoredScores(database, locationRef, now)
  return {
    referenceDays: references.length,
    newScores,
    calibrationStatus: profile.status,
    distinctDays: profile.distinctDays,
    minimumDays: profile.minimumDays,
    activeBuckets: profile.activeBuckets,
  }
}
