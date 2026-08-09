import test from 'node:test'
import assert from 'node:assert/strict'
import { parseEnsembleDaily } from '../src/openmeteo.mjs'

test('Open-Meteo member columns become explicit per-day distributions', () => {
  const definition = {
    id: 'test', name: 'Test Ensemble', short: 'TEST', model: 'test_model',
    includeInFusion: true,
  }
  const daily = {
    time: ['2026-08-09', '2026-08-10'],
    temperature_2m_mean: [10, 11],
    temperature_2m_mean_member2: [12, null],
    temperature_2m_mean_member10: [14, 15],
    precipitation_sum: [0, 1],
    precipitation_sum_member2: [2, null],
    precipitation_sum_member10: [10, 12],
    apparent_temperature_mean: [9, 10],
    apparent_temperature_mean_member2: [11, 12],
    apparent_temperature_max: [14, 15],
    relative_humidity_2m_mean: [45, 50],
    dew_point_2m_mean: [4, 5],
    wind_speed_10m_mean: [12, 14],
  }

  const model = parseEnsembleDaily(definition, daily)
  assert.equal(model.memberCount, 3)
  assert.deepEqual(model.daily[0].temperatureMembers, [10, 12, 14])
  assert.deepEqual(model.daily[1].temperatureMembers, [11, 15])
  assert.deepEqual(model.daily[1].precipitationMembers, [1, 12])
  assert.deepEqual(model.daily[0].apparentTemperatureMembers, [9, 11])
  assert.deepEqual(model.daily[1].relativeHumidityMembers, [50])
  assert.deepEqual(model.daily[0].dewPointMembers, [4])
  assert.deepEqual(model.daily[1].windSpeedMembers, [14])
})
