#!/usr/bin/env node
// 공인인증서 모듈이 남긴 창을 닫는다.
//
//   node scripts/close-cert-dialogs.mjs
//   node scripts/close-cert-dialogs.mjs --quit-modules
//
// 한 단계가 인증서 창을 띄운 채로 죽으면 그 창이 화면 한복판에 남아 다음 단계를
// 막는다. Chrome 을 내렸다 올려도 소용없다 — 이 창들은 Chrome 것이 아니라 별도
// 모듈 프로세스 것이다. 2026-08-29 에 신한은행 인증서선택 창이 남아 재실행 자체를
// 막았고, 우리카드가 커밋에 실패하고 남긴 창 때문에 그 다음 묶음이 탭조차 열지
// 못했다.
//
// --quit-modules 는 창을 훑지 않고 보안 프로그램을 통째로 내린다. 하루 수집이 다
// 끝난 뒤 Chrome 을 내리고 부른다 — 창만 닫으면 은행 보안 프로그램이 배경에 계속
// 남아 있다(CEO 2026-09-18). Chrome 이 살아 있을 때 부르면 페이지가 다시 띄운다.
//
// 규칙과 실제 동작은 lib/cert-cleanup.mjs 에 있다. 확인 버튼은 절대 누르지 않는다.
import process from 'node:process'
import { closeCertDialogs, quitSecurityModules } from './lib/cert-cleanup.mjs'

function log(message) {
  console.log(`[cert-cleanup] ${message}`)
}

if (process.argv.includes('--quit-modules')) {
  const stopped = await quitSecurityModules({ log })
  log(stopped.length > 0 ? `보안 프로그램 ${stopped.length}개를 내렸어요.` : '내릴 보안 프로그램이 없었어요.')
} else {
  const closed = await closeCertDialogs({ log })
  if (closed > 0) log(`인증서 창 ${closed}개를 닫았어요.`)
}
process.exitCode = 0
