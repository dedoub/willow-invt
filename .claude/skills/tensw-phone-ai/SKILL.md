---
name: tensw-phone-ai
description: Use for the Tensoftworks 대표번호(02-563-1271) AI 전화비서 — ClawOps agent that answers missed calls, takes a message, and posts the summary to Google Chat and the mgmt ledger. Trigger on "AI 전화비서", "대표번호", "부재중 전화", "ClawOps", "회사 전화".
---

# 텐소 대표번호 AI 전화비서

```
02-563-1271 (LG U+ 기업 인터넷전화로 번호이동 예정)
  └ 무응답·통화중 착신 → ClawOps 070 → AI 비서(메모 접수, 광고 거르기)
       └ 웹훅 summary.completed / transcript.completed
            → /api/phone/clawops  (?t=CLAWOPS_WEBHOOK_TOKEN)
                 ├ tensw_phone_calls 저장(통화·녹취·요약은 ClawOps API 에서 다시 읽음)
                 ├ 구글챗 스페이스 알림(TENSW_PHONE_CHAT_WEBHOOK, 광고는 안 보냄)
                 └ 회신 필요 → tensw_mgmt_schedules `mgmt:tensw:phone:<callId>` 오늘 할 일
```

```bash
node scripts/clawops-agent.mjs status                 # 에이전트·번호·웹훅
node scripts/clawops-agent.mjs apply                  # 지침 반영 + 번호 연결 + 웹훅 등록
node scripts/clawops-agent.mjs apply --new-number     # 070 발급(월 요금 — 승인 뒤)
npx tsx --test src/lib/phone/clawops.test.ts
```

## 값

| env | 어디 | 메모 |
|---|---|---|
| `CLAWOPS_ACCOUNT_ID`, `CLAWOPS_API_KEY` | .env.local + Vercel Production | 대표 가입 뒤 콘솔 개발자 > API 키 |
| `CLAWOPS_WEBHOOK_TOKEN` | 둘 다(2026-10-02 넣음) | 웹훅 URL 의 `?t=` |
| `CLAWOPS_SIGNING_KEY` | 선택 | 폼 상태콜백 서명 확인용 |
| `TENSW_PHONE_CHAT_WEBHOOK` | Vercel Production | 구글챗 스페이스 > 앱 및 통합 > 웹훅 URL |

## 지침 고치기

AI 비서 말·규칙은 `scripts/clawops-agent.mjs` 의 `INSTRUCTIONS`. 고친 뒤 `apply`.
**복창 문장 형식("확인하겠습니다. 성함 …, 소속 …, 회신 번호 …, 용건 … 맞으신가요?")과
광고 마무리("광고 전화로 확인되어")는 `parseRecord()` 가 읽는다 — 바꾸면 파서와 테스트도 같이 고친다.**

## 덫

- 웹훅 본문 형식은 공개 문서에 없다. 그래서 callId 만 쓰고 나머지는 API 로 다시 읽는다.
- 녹취 화자 이름(speaker_0…)과 역할 연결은 보장되지 않는다. 첫 발화(인사)를 AI 로 본다.
- 착신으로 넘어온 전화에서 원래 발신 번호가 `from` 에 오는지 실제 통화로 확인해야 한다. 안 오면 복창한 회신 번호만 믿는다.
- 통화 연결(transfer)은 아직 쓰지 않는다. 쓰려면 담당자 명단과 Voice Agent SDK 가 필요하다.
- 회신·문자는 사람이 한다. 에이전트는 일정까지만 만든다.
