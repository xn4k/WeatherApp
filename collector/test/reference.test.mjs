import test from 'node:test'
import assert from 'node:assert/strict'
import { completedReferenceDates, parseReferenceDays } from '../src/reference.mjs'

test('reference dates include only completed local calendar days', () => {
  assert.deepEqual(
    completedReferenceDates('Europe/Berlin', new Date('2026-08-08T12:00:00Z'), 3),
    ['2026-08-05', '2026-08-06', '2026-08-07'],
  )
})

test('historical forecast payload becomes an explicitly labelled analysis proxy', () => {
  const result = parseReferenceDays({
    daily: {
      time: ['2026-08-07'],
      temperature_2m_mean: [19.4],
      precipitation_sum: [2.1],
    },
  }, '2026-08-08T00:00:00Z')

  assert.equal(result[0].date, '2026-08-07')
  assert.equal(result[0].temperatureMean, 19.4)
  assert.equal(result[0].kind, 'analysis-proxy')
})
