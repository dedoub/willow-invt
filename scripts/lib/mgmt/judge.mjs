// judge.mjs — 새 메시지 묶음을 건·결정·할일·자료·일지·일정 변경으로 해석한다(Codex 한 번).
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { redact } from './redact.mjs'
import { isPersonalText } from './infer.mjs'

const SCHEMA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'judge-schema.json')

const field = v => redact(v ?? '').text

// I9: 개인·가족 메시지는 judge 에 넘기지 않는다(추론 제외 패턴과 같다 — '…님의 거래내역', 류하·김류하, 가족, 병원,
// 보안 알림). 제목·보낸이·방 이름·본문 앞부분을 본다. 증권사 업무 메일은 거르지 않는다.
export function isPersonalItem(item) {
  return isPersonalText([item?.subject, item?.from, item?.space, String(item?.text ?? '').slice(0, 300)].filter(Boolean).join(' '))
}

export function buildPrompt({ company, items, openCases, openSchedules, lessons = [], decisions = [] }) {
  const name = company === 'willow' ? '윌로우인베스트먼트' : '텐소프트웍스'
  const lines = items.map(x => `- ref=${x.ref} | ${x.at} | ${field(x.space ?? x.subject ?? '')} | ${field(x.from ?? '')}${x.direction === 'out' ? ' (우리가 보냄)' : ''}: ${field(x.text).replace(/\n+/g, ' / ')}`)
  return [
    `너는 ${name} 경영관리 기록 담당이다. 아래 새 메시지를 읽고 JSON 스키마대로만 답한다.`,
    '규칙:',
    '- 모든 항목의 source_ref 는 아래 메시지의 ref 중 하나여야 한다. 없는 ref 를 만들지 않는다.',
    '- 건(cases)은 사람들이 "그 건"이라 부르는 사안. 아래 열린 건과 같은 사안이면 같은 name 을 쓴다.',
    '- 할 일(todo)은 요청 말투(부탁드립니다·해주세요·올리세요)에서 만든다. 기한이 있으면 due_date(YYYY-MM-DD).',
    '- 기한·날짜가 있는 할 일, 미팅, 입금·제출 마감은 schedules op=create 로도 낸다.',
    '- schedules 마다 kind(task=할 일·마감, meeting=회의·방문·발표·미팅)와 owner(그 일을 맡거나 참석하는 사람 이름. 김동욱 본인 일이거나 모르면 null)를 적는다.',
    '- 다른 사람(대표·직원)의 대외 회의·방문·발표도 일시가 있으면 owner 를 그 사람으로 해서 낸다(모니터링용). 시각·장소·일찍 도착 요청은 title 에 짧게 넣는다.',
    '- 아직 보내지 않은 계획·초안을 "제출했다·신청 완료"로 적지 않는다. 우리가 실제로 보낸 메일만 완료다.',
    '- 처리했습니다·송금했습니다·발급했습니다·반영되었습니다·제출했습니다 같은 완료 말이 열린 일정과 짝이면 op=complete, match_key 는 그 일정의 key.',
    '- 날짜가 바뀌었다는 말이면 op=update.',
    '- 비밀번호·키·계좌가 평문으로 보이면 kind=security 항목으로 "무엇이 누구에게 공유됐는지"만 적고 값은 적지 않는다.',
    '- 결정(decisions)은 대표 판단이 필요한 것만: 예산 밖 지출, 가격·계약 조건, 대외 제출 범위, 참석자, 처음 보는 거래 성격.',
    '- 개발 세부·잡담은 kind=daily 한 줄로 끝낸다(스페이스별 하루 한 단락).',
    '- 개인·가족·개인투자 메시지는 무시한다(아무 항목도 만들지 않는다).',
    ...(lessons.length ? ['', '지난 교훈(반드시 지킨다):', ...lessons.map(l => `- ${field(l).replace(/\n+/g, ' / ')}`)] : []),
    ...(decisions.length ? ['', '최근 대표 결정(이 결정에 맞는 후속 할 일·일정을 만들고, 같은 것을 다시 묻지 않는다):', ...decisions.map(d => `- ${field(d)}`)] : []),
    '',
    `열린 건: ${JSON.stringify(openCases.map(c => field(c.name)))}`,
    `열린 일정: ${JSON.stringify(openSchedules.map(s => ({ key: s.source_key, title: field(s.title), date: s.schedule_date })))}`,
    '',
    '새 메시지:',
    ...lines,
  ].join('\n')
}

// exec/mkdtemp/schema 를 주입 가능하게 두어 시험에서 실제 codex 를 부르지 않고도
// 임시 폴더 정리와 stdio 설정을 확인할 수 있게 한다.
export function codexRunner(prompt, { exec = execFileSync, schema = SCHEMA } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mgmt-judge-'))
  const out = path.join(dir, 'out.json')
  try {
    // stderr 는 절대 캡처하지 않는다(ignore) — codex 실패 시 에러 메시지에 프롬프트·본문 일부가
    // 섞여 로그로 새는 것을 막는다.
    // I10: 임시 폴더에서, 읽기 전용 샌드박스로 — 메일 본문의 지시가 저장소·파일을 건드리지 못하게.
    exec('codex', ['exec', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '--output-schema', schema, '-o', out, '-'],
      { cwd: dir, input: prompt, encoding: 'utf8', timeout: 600_000, stdio: ['pipe', 'ignore', 'ignore'] })
    return JSON.parse(fs.readFileSync(out, 'utf8'))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export async function judge(prompt, { runner = codexRunner } = {}) {
  return runner(prompt)
}
