import assert from 'node:assert/strict'
import test from 'node:test'
import { LAUNCHD_DAEMONS, SECURITY_PROCESSES, quitTargets } from './cert-cleanup.mjs'

test('수집 뒤 내리기에서 launchd 데몬(CrossEXService)은 뺀다', () => {
  assert.ok(SECURITY_PROCESSES.includes('CrossEXService'))
  assert.ok(!quitTargets().includes('CrossEXService'))
  assert.ok(quitTargets().includes('veraport'))
  assert.equal(LAUNCHD_DAEMONS.CrossEXService, 'kr.co.iniline.crossex-service')
})
