import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduledReportChatId } from '../scheduled-report-policy'

test('일요일에도 예약 작업 완료 보고를 CEO 채팅으로 보낸다', () => {
  assert.equal(scheduledReportChatId(7586966475, 'Sun'), 7586966475)
})

test('유효하지 않은 채팅 ID는 보고 대상으로 사용하지 않는다', () => {
  assert.equal(scheduledReportChatId(Number.NaN, 'Mon'), null)
})
