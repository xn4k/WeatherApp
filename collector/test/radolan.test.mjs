import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeRadolan } from '../src/radolan.mjs'

test('RADOLAN SF binary values become a local 3x3 grid mean', () => {
  const header = Buffer.from('SF010000100000000BY0000000VS 3PR E-01 GP 900x900\x03', 'latin1')
  const data = Buffer.alloc(900 * 900 * 2)
  for (let index = 0; index < 900 * 900; index += 1) data.writeUInt16LE(10, index * 2)
  const result = decodeRadolan(Buffer.concat([header, data]), 50.9991, 7.0387)
  assert.equal(result.precipitationSum, 1)
  assert.equal(result.pixelCount, 9)
  assert.equal(result.header.precision, 0.1)
})
