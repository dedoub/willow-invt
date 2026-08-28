#!/usr/bin/env node
// 공인인증서 모듈이 남긴 창을 닫는다.
//
//   node scripts/close-cert-dialogs.mjs
//
// 한 단계가 인증서 창을 띄운 채로 죽으면 그 창이 화면 한복판에 남아 다음 단계를
// 막는다. Chrome 을 내렸다 올려도 소용없다 — 이 창들은 Chrome 것이 아니라 별도
// 모듈 프로세스 것이다. 2026-08-29 에 신한은행 인증서선택 창이 남아 재실행 자체를
// 막았고, 우리카드가 커밋에 실패하고 남긴 창 때문에 그 다음 묶음이 탭조차 열지
// 못했다.
//
// 규칙과 실제 동작은 lib/cert-cleanup.mjs 에 있다. 확인 버튼은 절대 누르지 않는다.
import process from 'node:process'
import { closeCertDialogs } from './lib/cert-cleanup.mjs'

function log(message) {
  console.log(`[cert-cleanup] ${message}`)
}

const closed = await closeCertDialogs({ log })
if (closed > 0) log(`인증서 창 ${closed}개를 닫았어요.`)
process.exitCode = 0
