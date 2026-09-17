import test from 'node:test'
import assert from 'node:assert/strict'
import { passesCriteria, isNetworkFailure } from '../support/performance-metrics.mjs'

test('T-B5: cancelamento explícito da consulta é separado de falha de rede', () => {
  assert.equal(isNetworkFailure('net::ERR_ABORTED', 'read'), false)
  for (const action of ['reserve', 'exchange', undefined]) assert.equal(isNetworkFailure('net::ERR_ABORTED', action), true)
  for (const error of ['net::ERR_FAILED', 'net::ERR_CONNECTION_RESET', 'net::ERR_TIMED_OUT', undefined]) {
    assert.equal(isNetworkFailure(error, 'read'), true)
  }
})

const valid = () => ({
  readP95: 1500,
  writeP95: 1700,
  syncMs: [4982, 5039, 4956],
  uiErrors: 0,
  loadErrors: 0,
})

test('T-B5: aprova medições válidas sem erros', () => {
  assert.equal(passesCriteria(valid()), true)
})

test('T-B5: aceita exatamente as fronteiras de 2000 ms e 7000 ms', () => {
  assert.equal(passesCriteria({
    ...valid(), readP95: 2000, writeP95: 2000, syncMs: [7000, 7000, 7000],
  }), true)
})

test('T-B5: HTTP 503 na UI reprova mesmo após recuperação visual em menos de 7 s', () => {
  assert.equal(passesCriteria({ ...valid(), uiErrors: 1 }), false)
})

test('T-B5: falha de rede da UI com status 0 contabilizada reprova', () => {
  assert.equal(passesCriteria({ ...valid(), uiErrors: 1, syncMs: [100, 100, 100] }), false)
})

test('T-B5: erro de carga reprova mesmo com latências dentro das metas', () => {
  assert.equal(passesCriteria({ ...valid(), loadErrors: 1 }), false)
})

for (const field of ['readP95', 'writeP95']) {
  test(`T-B5: ${field} acima de 2000 ms reprova`, () => {
    assert.equal(passesCriteria({ ...valid(), [field]: 2001 }), false)
  })

  test(`T-B5: ${field} sem medição finita reprova`, () => {
    for (const value of [NaN, Infinity, -Infinity, undefined, null]) {
      assert.equal(passesCriteria({ ...valid(), [field]: value }), false)
    }
  })
}

test('T-B5: qualquer sincronização acima de 7000 ms reprova', () => {
  for (let index = 0; index < 3; index++) {
    const input = valid()
    input.syncMs[index] = 7001
    assert.equal(passesCriteria(input), false)
  }
})

test('T-B5: exige exatamente três medições de sincronização', () => {
  for (const syncMs of [[], [100], [100, 100], [100, 100, 100, 100]]) {
    assert.equal(passesCriteria({ ...valid(), syncMs }), false)
  }
})

test('T-B5: sincronização sem medição finita reprova', () => {
  for (const value of [NaN, Infinity, -Infinity, undefined, null]) {
    assert.equal(passesCriteria({ ...valid(), syncMs: [100, value, 100] }), false)
  }
})
