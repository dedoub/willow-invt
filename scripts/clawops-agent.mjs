#!/usr/bin/env node
// 텐소프트웍스 대표번호 AI 전화비서(ClawOps) 세우기·고치기.
//
//   node scripts/clawops-agent.mjs status            # 계정의 에이전트·번호·웹훅 상태
//   node scripts/clawops-agent.mjs apply             # 에이전트 지침 반영 + 번호 연결 + 웹훅 등록 (없으면 만든다)
//   node scripts/clawops-agent.mjs apply --new-number  # 070 번호가 없으면 하나 발급(월 요금 발생 — 승인 뒤)
//
// .env.local: CLAWOPS_ACCOUNT_ID, CLAWOPS_API_KEY, CLAWOPS_WEBHOOK_TOKEN(임의 긴 문자열),
//             CLAWOPS_WEBHOOK_BASE(기본 https://dash.willowinvt.com)
// 같은 값을 Vercel Production env 에도 넣어야 웹훅이 받는다(+ TENSW_PHONE_CHAT_WEBHOOK).
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true })
const { CLAWOPS_ACCOUNT_ID: ACC, CLAWOPS_API_KEY: KEY, CLAWOPS_WEBHOOK_TOKEN: TOKEN } = process.env
const BASE = process.env.CLAWOPS_WEBHOOK_BASE ?? 'https://dash.willowinvt.com'
const NAME = '텐소프트웍스 대표번호 AI 비서'
if (!ACC || !KEY) { console.error('CLAWOPS_ACCOUNT_ID / CLAWOPS_API_KEY 를 .env.local 에 넣어 주세요'); process.exit(1) }

export const INSTRUCTIONS = `당신은 주식회사 텐소프트웍스 대표번호(02-563-1271)의 AI 전화 비서입니다. 담당자가 전화를 받지 못했을 때 대신 받습니다.

[회사]
- 주식회사 텐소프트웍스(Tensoftworks). 도서관·학술정보용 AI 검색엔진(Biblo), 온톨로지 기반 AI 서비스, 웹·앱 개발과 유지보수를 합니다.
- 주소: 서울 강남구 봉은사로105길 54-5 리버뷰빌 402호. 업무시간: 평일 오전 9시 30분부터 오후 6시 30분.
- 이메일: admin@tensoftworks.com. 홈페이지: tensoftworks.com.

[말투]
- 존댓말, 짧고 또렷하게. 한 번에 한 가지만 묻습니다. 모르는 것은 지어내지 말고 "담당자가 확인해 연락드리겠습니다"라고 합니다.
- 가격, 계약 조건, 일정 약속, 기술 답변은 하지 않습니다. 메모만 받습니다.

[순서]
1. 인사: "안녕하세요, 텐소프트웍스입니다. 지금 담당자가 전화를 받기 어려워 AI 비서가 대신 받았습니다. 통화 내용은 담당자 전달을 위해 녹음됩니다. 무엇을 도와드릴까요?"
2. 용건을 듣고, 성함과 소속(회사·기관)을 여쭙니다.
3. 회신받을 번호를 여쭙니다. 지금 거신 번호로 받으시겠다고 하면 그 번호라고 적습니다. 숫자는 한 자리씩 다시 읽어 확인합니다.
4. 급한 일인지(오늘 중 회신이 필요한지) 여쭙니다.
5. 반드시 이 형식으로 복창합니다: "확인하겠습니다. 성함 [성함], 소속 [소속], 회신 번호 [번호], 용건 [한 줄 용건] 맞으신가요?" (모르는 칸은 "미확인")
6. 맞다고 하면: "담당자에게 바로 전달하겠습니다. 감사합니다." 하고 마칩니다.

[광고·영업 전화]
- 대출, 보험, 카드, 마케팅 대행, 설문, 광고 제안처럼 우리 고객이 아닌 판매 전화로 보이면 메모를 받지 않고 "광고 전화로 확인되어 따로 전달하지 않습니다. 필요하시면 admin@tensoftworks.com 으로 자료를 보내 주세요. 감사합니다."라고 말하고 마칩니다.

[하지 않는 것]
- 직원 개인 휴대폰 번호, 직원 이름별 출근 여부, 회사 내부 사정은 알려 주지 않습니다.
- 다른 번호로 연결하지 않습니다(연결 기능은 아직 쓰지 않습니다).`

const api = async (method, p, body) => {
  const res = await fetch(`https://api.claw-ops.com/v1/accounts/${ACC}${p}`, {
    method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}

const cmd = process.argv[2] ?? 'status'
const agents = (await api('GET', '/agents')).data ?? []
let agent = agents.find(a => a.name === NAME)
const numbers = (await api('GET', '/numbers')) ?? []
const numList = Array.isArray(numbers) ? numbers : numbers.data ?? []
// 가입하면 "내 첫 에이전트"가 번호에 붙어 있다 — 새로 만들지 않고 그걸 AI 비서로 바꾼다.
agent ??= agents.find(a => numList.some(n => n.agentId === a.agentId))
const hooks = (await api('GET', '/webhooks')).data ?? []
const hookUrl = `${BASE}/api/phone/clawops?t=${TOKEN ?? ''}`

if (cmd === 'status') {
  console.log('에이전트:', agents.map(a => `${a.name} (${a.agentId}) 번호 ${JSON.stringify(a.phoneNumbers ?? [])}`).join('\n  ') || '없음')
  console.log('번호:', numList.map(n => `${n.number} ${n.routingType} ${n.agentId ?? ''}`).join(', ') || '없음')
  console.log('웹훅:', hooks.map(h => `${String(h.url).replace(/t=[^&]+/, 't=…')} [${(h.events ?? []).join(',')}]`).join('\n  ') || '없음')
  process.exit(0)
}
if (cmd !== 'apply') { console.error(`모르는 명령: ${cmd}`); process.exit(1) }
if (!TOKEN) { console.error('CLAWOPS_WEBHOOK_TOKEN 이 없어요 — 긴 임의 문자열을 .env.local 과 Vercel 에 넣어 주세요'); process.exit(1) }

const body = { name: NAME, instructions: INSTRUCTIONS, greeting: true }
agent = agent ? await api('PATCH', `/agents/${agent.agentId}`, body) : await api('POST', '/agents', body)
console.log(`에이전트 ${agent.agentId} 지침 반영 (${INSTRUCTIONS.length}자)`)

let num = numList[0]
if (!num && process.argv.includes('--new-number')) { num = await api('POST', '/numbers'); console.log(`070 번호 발급: ${num.number}`) }
if (num) {
  // 통화가 끝나면 상태 콜백 → 서버가 받아쓰기를 요청 → transcript/summary 웹훅으로 이어진다
  await api('PUT', `/numbers/${num.number}`, { routingType: 'agent', agentId: agent.agentId, statusCallback: hookUrl, statusCallbackEvents: 'completed' })
  console.log(`번호 ${num.number} → 에이전트 연결. LG U+ 02 번호의 무응답·통화중 착신을 이 번호로 걸면 된다.`)
} else console.log('070 번호가 없어요. 발급하려면 --new-number (월 요금 발생)')

const events = ['summary.completed', 'transcript.completed']
const same = hooks.find(h => String(h.url).startsWith(`${BASE}/api/phone/clawops`))
if (same) await api('PUT', `/webhooks/${same.webhookId ?? same.id}`, { url: hookUrl, events })
else await api('POST', '/webhooks', { url: hookUrl, events })
console.log(`웹훅 ${same ? '갱신' : '등록'}: ${BASE}/api/phone/clawops [${events.join(', ')}]`)
