import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDailyObservations, parseStationCatalog, selectStation } from '../src/dwd-observations.mjs'

test('DWD catalog parsing and configured station selection remain deterministic', () => {
  const catalog = [
    ' 02667 19370101 20260808 91 50.8645 7.1575 Koeln/Bonn                    Nordrhein-Westfalen',
    ' 05000 19900101 20260808 55 51.0000 7.0000 Andere Station               Nordrhein-Westfalen',
  ].join('\n')
  const stations = parseStationCatalog(catalog)
  const station = selectStation({ latitude: 51, longitude: 7, elevation: 52, dwdStationId: '02667' }, stations)

  assert.equal(station.id, '02667')
  assert.equal(station.name, 'Koeln/Bonn')
  assert.ok(station.distanceKm > 0)
})

test('DWD daily parser preserves measurement quality and missing values', () => {
  const text = [
    'STATIONS_ID;MESS_DATUM;QN_4;RSK;SDK;TMK;TNK;TXK;eor',
    '02667;20260808;10;2.5;7.2;21.4;14.0;28.0;eor',
    '02667;20260809;3;-999;-999;22.1;15.1;30.2;eor',
  ].join('\n')
  const rows = parseDailyObservations(text, 'provisional')

  assert.equal(rows.length, 2)
  assert.equal(rows[0].precipitationSum, 2.5)
  assert.equal(rows[0].qualityLevel, 10)
  assert.equal(rows[1].precipitationSum, null)
  assert.equal(rows[1].qualityStatus, 'provisional')
})
