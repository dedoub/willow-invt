---
name: mgmt-agent
description: Use when running, checking or tuning the Tensoftworks/Willow management agent that keeps the schedule ledgers (tensw_mgmt_schedules, willow_mgmt_schedules) current — running a step by hand, reading a digest, turning an inferred rule off, or answering a pending decision. Trigger on "경영관리 에이전트", "일정 정리", "결정함", "반복 규칙", "경영관리 요약".
---

# 경영관리 에이전트

텐소프트웍스(10월부터 경영관리 일체)와 윌로우인베스트먼트의 일정을 한 원장(`tensw_mgmt_schedules`·
`willow_mgmt_schedules`)으로 돌리는 자동화. 세 고리로 돈다.

1. **규칙 → 일정** (`rules`): `mgmt_rules` 의 정기 업무를 오늘~60일로 깐다. 사람이 적은 행
   (`origin='manual'`)은 날짜·제목을 다시 손대지 않는다.
2. **메일·스페이스 → 일정 갱신** (`collect`): 텐소·윌로우 메일함과 텐소 구글 챗 스페이스를 읽어
   Codex 판단(`judge`)으로 새 일정·완료·결정 후보를 뽑는다.
3. **증빙 → 완료 처리** (`close`): 세금 고지·메일·현금 원장에서 근거를 찾은 정기 행만 완료로 닫는다.
   추측으로 닫지 않는다.

결정이 필요한 것(빠진 일정, 반복 규칙 채택 여부 등)만 `decide` 단계가 윌리 버튼으로 CEO에게 묻는다.
저녁 요약(`digest`)이 그날 한 일·빠진 일·결정 대기·실패를 모은다. 아침 회차(07:0x)는 지난 6개월
로그에서 반복 규칙을 더 찾고(`infer`), 월요일이면 규칙도 스스로 손보고(`tune`) 주간 성적표와 스킬
후보를 낸다(`weekly`) — 아래 "자가 발전" 절.

## 명령

```bash
node scripts/mgmt-agent.mjs --dry                  # 무엇을 할지만(쓰기·윌리 전송 없음)
node scripts/mgmt-agent.mjs --only rules            # 규칙 전개만
node scripts/mgmt-agent.mjs --only collect          # 메일·스페이스 읽고 일정 갱신만
node scripts/mgmt-agent.mjs --only close            # 증빙 근거로 완료 처리만
node scripts/mgmt-agent.mjs --only decide           # 열린 결정 처리·윌리 발송만
node scripts/mgmt-agent.mjs --only digest           # 저녁 요약만
node scripts/mgmt-agent.mjs --only infer            # 반복 규칙 추론만
node scripts/mgmt-agent.mjs --only tune             # 규칙 자동 조정만(월요일 07:0x)
node scripts/mgmt-agent.mjs --only weekly           # 주간 성적표 + 스킬 후보만(월요일 07:3x)
node scripts/mgmt-agent.mjs --only learn            # 대표가 되돌린 행에서 교훈 찾기만
node scripts/mgmt-agent.mjs lesson --company tensw --scope judge "문장"   # 대표 교정 한 줄을 교훈으로
node scripts/mgmt-replay.mjs                        # 2026-06~09 재현 시험(완전 읽기 전용)
npm run mgmt:test                                   # 유닛 테스트
```

`--only` 없이 부르면 시각에 따라 자동으로 고른다(07:00~07:30 은 `infer` 도 포함(월요일이면 `infer`
다음에 `tune` 도), 07:30~07:59 이고 월요일이면 끝에 `weekly` 도, 18:30~19:00 은 `digest` 도 포함,
그 외 시간은 `learn → rules → collect → close → decide`). 모든 회차는 `learn` 으로 시작한다. 잘못된 `--only` 값은
바로 종료 코드 2 로 실패한다.

## 스케줄

launchd `com.willow.mgmt-agent` 가 평일 07~20시, 매시 :05·:35 에 `scripts/run-mgmt-agent.sh` 를
부른다(주말·07시 이전·20시 이후는 스크립트가 바로 종료). **도입 첫 2주는 `MGMT_ARGS=--dry` +
`MGMT_DRY_DIGEST=1` 로 등록돼 있다** — DB 쓰기·결정 발송 없이, 저녁 요약 한 통만 "(시험 운행)"
표시로 윌리에게 간다. 안정되면 plist 의 `MGMT_ARGS`/`MGMT_DRY_DIGEST` 를 빼고
`launchctl bootout`→`bootstrap` 으로 다시 올린다.

- 동시 실행 방지: `~/.willow/mgmt-agent.lock` (pid 기록, 35분 넘으면 죽은 락으로 보고 무시).
- 시간 상한: 20분(그 안에 못 끝내면 `timeout` 실패로 기록하고 종료).
- 실패 기록: `~/.willow/mgmt-agent-failures.jsonl` — 그날 실패가 저녁 요약에 모여 나온다.

## 반복 규칙 끄기·보기

```sql
-- 활성 규칙 보기
select company, task_key, step, title, origin, active from mgmt_rules where active;
-- 추정(또는 씨앗) 규칙 하나 끄기
update mgmt_rules set active=false where title='…';
```

씨앗 규칙(`origin='seed'`, `scripts/lib/mgmt/seed-rules.mjs`)의 제목은 `{period}` 자리표시자를
그대로 담고 있어 `like` 로 찾는 편이 안전하다(`title like '%급여대장 요청%'`). 추론 규칙
(`origin='inferred'`)은 이미 채워진 월로 제목이 나온다.

## 교훈 장부

에이전트가 원장 행을 쓸 때마다 그 행의 제목·날짜·완료·상태를 `mgmt_agent_writes` 에 남긴다. 다음
회차의 `learn` 이 지금 행과 비교해 대표가 **지웠거나·다시 열었거나·날짜를 옮겼거나·이름을 바꾼** 행을
찾아 `mgmt_lessons` 에 교훈(`source='reverted'`)으로 적는다. 개인 일정이 된 행은 교훈 없이 기록만 지운다.
되돌림은 같은 회차 안에서 다시 뒤집히지 않게 고정한다: 날짜·이름을 바꾼 정기 행은 `origin='manual'`
(규칙이 더 손대지 않음), 다시 연 행은 마지막 증빙을 `rejected` 로 표시(그 증빙으로 다시 닫지 않음),
지운 정기 행은 그 회차 키를 막는다(`scope='rule'`, `example.expected='suppressed'` — 교훈을 끄면 다시 깔린다).
활성 교훈 중 범위가 `judge`·`close` 이고 회사가 같거나 공통인 최근 20개가 Codex 판단 프롬프트에
"지난 교훈(반드시 지킨다)" 으로 들어간다. 이미 있는 문장을 `lesson` 으로 다시 넣으면 "이미 있는 교훈이에요" 로 끝난다.

대표가 직접 고쳐 말하면(`source='ceo_correction'`):

```bash
node scripts/mgmt-agent.mjs lesson --company tensw|willow [--scope judge|rule|close|decision] "문장"
```

`--scope` 기본값은 `judge`. 회사·범위가 틀리면 종료 코드 2. 문장은 저장 전에 비밀값을 가린다.

```sql
select company, scope, lesson, source, hits, created_at from mgmt_lessons where active order by created_at desc;
update mgmt_lessons set active=false where lesson='…';   -- 틀린 교훈 끄기
```

## 자가 발전

에이전트는 대표 손을 거칠 때마다, 그리고 매주 한 번, 스스로 판단을 손본다. 넷이 한 흐름이다.

1. **되돌림에서 배우기** (`learn`, 매 회차 맨 앞) — 위 "교훈 장부" 절 그대로. 대표가 지웠거나·다시
   열었거나·날짜를 옮겼거나·이름을 바꾼 행마다 교훈 한 줄(`mgmt_lessons`, `source='reverted'`)이
   쌓이고, 다음 판단(`judge`)이 "지난 교훈"으로 그걸 지킨다. 대표가 직접 고쳐 말하면:
   ```bash
   node scripts/mgmt-agent.mjs lesson --company tensw|willow [--scope judge|rule|close|decision] "문장" [--dry]
   ```
   윌리가 "경영관리 교훈: …" 을 받으면 이 명령을 그대로 부른다(회사가 불분명하면 되묻는다). `--scope`
   기본값은 `judge`, 회사·범위가 틀리면 종료 코드 2. 문장은 저장 전에 비밀값을 가린다.
2. **규칙 자동 조정** (`tune`, 월요일 07:0x 회차, `infer` 다음) — 정기 회차가 계속 며칠 일찍 끝나면
   그 요일로 당기고(`shift_day`), 두 번 연속 빠지면 규칙을 끌지 결정함에 묻고(`ask_disable`), 추정
   규칙이 근거 없이 두 번 어긋나면 조용히 끄고(`deactivate`), 세 번 맞으면 추정 표시를 뗀다(`confirm`).
   모두 메일·메시지 발송 없이 규칙 자체만 고친다(대표 승인은 `ask_disable` 물음에만 필요).
3. **월요일 주간 성적표** (`weekly`, 월요일 07:3x 회차) — 지난 7일치 쓴 일정·근거로 닫은 수·되돌림
   (과 되돌림률)·빠짐·물어본 결정·지난 판단 재사용·해석 실패를 한 통으로 윌리에게 보낸다
   (`scripts/lib/mgmt/weekly.mjs` `scorecard()`).
   ```bash
   node scripts/mgmt-agent.mjs --dry --only weekly   # 무엇이 나갈지만(윌리 전송 없음)
   node scripts/mgmt-agent.mjs --only weekly         # 실제 회차 — 월요일 07:30~07:59 엔 자동으로도 돈다
   ```
4. **스킬 후보를 개발 에이전트로** (`weekly` 안에서 성적표 다음) — 같은 회차가 `mgmt_entries`
   (`kind='todo'`, 담당에 "김동욱" 포함)에서 최근 4주 안에 레시피 없이 3번 넘게 반복된 일을
   찾는다(`skillCandidates()` — 숫자·날짜·금액·괄호 속 글자를 지우고 20자로 묶어, 세금계산서 두 건처럼
   거래처가 다르면 안 묶인다). 레시피가 있는 업무(급여·출근부·지원금·세금계산서 등, `mgmt_rules.recipe`
   가 있는 행 제목에서 뽑은 이름)는 뺀다. 묶인 일마다 `ws_threads` 에 같은 제목(`[mgmt-skill] <이름>`)의
   열린 스레드가 없으면 새로 연다(`project='willow-invt'`, `tags=['mgmt-skill-request']`, 요약에는
   메시지 참조(refs)만 넣고 본문은 가린다). **개발 에이전트가 이 스레드를 집어 스킬로 만든다** — 윌리는
   스레드를 열기만 하고 구현하지 않는다. 성적표 끝줄에 이번에 넘긴 후보 수가 나온다.

## 결정함 보기

```sql
select id, kind, subject_key, question, status, created_at
from mgmt_decisions where status in ('open','sent') order by created_at;
```

`open` 은 아직 버튼을 못 보낸 것(다음 `decide` 회차가 보낸다), `sent` 는 윌리에 이미 간 것.
CEO 가 텔레그램 버튼으로 답하면 `telegram-bot.ts` 가 `answered` 로 바꾸고, 같은 성격의 다음
결정은 `reuseAnswer()` 가 버튼 없이 지난 답을 재사용한다(저녁 요약에 "지난 판단 재사용"으로 나온다).

## 하면 안 되는 것

- **발송하지 않는다.** 이 에이전트는 메일·챗에 쓰지 않는다(Gmail send·drafts, Chat 쓰기 금지).
  윌리로 가는 결정 질문·요약 알림만 보낸다.
- **즉석 스크립트를 새로 짜지 않는다.** 윌리(텔레그램)는 이 문서의 명령과 SQL만 쓴다. 새 집계가
  필요하면 스크립트에 옵션을 더하지, 그 자리에서 쿼리를 지어내지 않는다.
- **`category='personal'` 행을 만지지 않는다.** 읽지도 쓰지도 않는다 — 코드가 이미 모든 조회에
  `or(category.is.null,category.neq.personal)` 를 건다.
- **인증서 창의 "확인"을 누르지 않는다.** 이 에이전트 자체는 인증서 화면을 열지 않지만, 같은
  워크스테이션의 다른 재무 자동화(`scripts/login-native-cert.mjs` 등)와 세션을 같이 쓸 때 실수로
  누르면 잠금 카운터가 올라간다. 확인뿐인 알림 창이 아니면 취소만 한다.

## 윌리 말 → 명령

| CEO 말 | 명령 | 끝나면 보고할 것 |
|---|---|---|
| "경영 일정 정리해", "일정 정리" | `node scripts/mgmt-agent.mjs --only rules` → `--only close` | 추가/갱신/완료 건수 |
| "메일·스페이스 확인해서 일정 반영해" | `node scripts/mgmt-agent.mjs --only collect` | 새 건·일정·결정 건수 |
| "오늘 요약", "경영관리 요약" | `node scripts/mgmt-agent.mjs --only digest` | 요약 텍스트 그대로 |
| "결정함에 뭐 있어" | 위 SQL(`mgmt_decisions` open/sent) | 질문 목록 |
| "그 규칙 빼줘 X", "반복 규칙에서 X 끄기" | 위 SQL(`update mgmt_rules set active=false …`) | 끈 규칙 제목 |
| "반복 규칙 뭐 새로 찾았어" | `node scripts/mgmt-agent.mjs --only infer` | 새 추정 규칙 목록(신뢰도 포함) |
| "경영관리 교훈: …" | `node scripts/mgmt-agent.mjs lesson --company <tensw\|willow> --scope judge "…"` (회사가 불분명하면 묻는다) | 저장된 교훈 문장 |
| "교훈 뭐 쌓였어" | 위 SQL(`mgmt_lessons` active) | 교훈 목록 |
| "6~9월로 다시 재봐줘", "재현 시험 돌려줘" | `node scripts/mgmt-replay.mjs` | `scripts/logs/mgmt-replay-2026-06-09.md` 요지 |
| "주간 성적표", "이번 주 어땠어" | `node scripts/mgmt-agent.mjs --dry --only weekly` (실제 발송은 월요일 07:3x 자동 회차) | 성적표 텍스트 그대로 |
| "스킬 후보 뭐 넘겼어" | `select title, summary, created_at from ws_threads where project='willow-invt' and 'mgmt-skill-request' = any(tags) order by created_at desc;` | 스레드 제목·요약 목록 |

`--only` 값은 `learn|rules|collect|close|decide|digest|infer|tune|weekly` 아홉 개뿐이다. 다른 값을
부르면 바로 실패하니 지어내지 않는다.

## 참고

- 설계: `docs/superpowers/specs/2026-09-30-mgmt-agent-design.md`
- 구현 계획: `docs/superpowers/plans/2026-09-30-mgmt-agent.md`
- 원장을 처음 켜기 전 1회성 정리 도구: `node scripts/mgmt-cleanup-ledger.mjs`(계획만) /
  `--apply`(반영) — 이미 도입 때 한 번 돌렸다. 평소 레시피에는 쓰지 않는다.
- 코드: `scripts/mgmt-agent.mjs`, `scripts/lib/mgmt/*.mjs`
