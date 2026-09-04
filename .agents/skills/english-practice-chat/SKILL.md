---
name: english-practice-chat
description: 영작연습(/english) 페이지를 웹 대신 대화로 진행할 때 사용. "영작연습 하자", "영작 문제 내줘", "여기서 영작연습", "영어 작문 연습", "류하 영작연습" 같은 요청에 반응한다. 페이지와 같은 문제은행·채점 기준을 쓰고 시도 기록도 같은 테이블에 남긴다.
---

# English Practice (대화형)

`/english` 페이지와 **같은 데이터·같은 기준**으로 영작연습을 대화에서 진행한다.
웹 UI만 대체하는 것이라, 문제은행·통계·복습 큐가 페이지와 갈라지면 안 된다.

## 원칙

- 문제는 새로 지어내지 않는다. 반드시 `english_practice_items`에서 뽑는다.
- 채점한 문항은 예외 없이 `english_practice_attempts`에 즉시 적재한다. 적재하지 않은 채점은 없는 것으로 친다.
- 답을 받기 전에 `reference_english`를 보여주지 않는다. 힌트로 영어 단어를 흘리지도 않는다.
- 한 번에 한 문항만 낸다. 답이 오면 채점 → 기록 → 다음 문항.
- 채점은 대화 중인 모델이 직접 한다. 페이지의 llm-json 프록시(Gemini flash)를 호출하지 않는다. 기준만 동일하게 쓴다.

## 데이터

- Supabase 프로젝트: `axcfvieqsaphhvbkyzzv` (willow-dash-tensw-todo), MCP `execute_sql` 사용.
- 문제은행 `english_practice_items`: `korean_full`, `korean_chunks`(jsonb 배열), `english_chunks`, `reference_english`, `topic`, `source_type`, `profile`.
- `source_type`(ceo): `wiki`(업무 맥락) · `business_talk`(맥락 없는 기본 비즈니스 회화) · `daily_life`(미국 성인 일상 표현). 생성 시 모델이 주는 `kind`로 갈린다.
- 시도 `english_practice_attempts`: `item_id`, `user_answer`, `score`, `passed`, `is_review`, `feedback`(jsonb), `profile`.

## 프로필

| profile | 대상 | 영어 | 소재 |
|---|---|---|---|
| `ceo` (기본) | 김동욱 | 미국식 비즈니스 구어체 | 업무위키·이메일 분석 |
| `ryuha` | 류하 | 영국식 구어체(ISEB 인터뷰) | 류하 노트·ISEB 문항 |

"류하"가 언급되면 `ryuha`, 아니면 `ceo`다. `ryuha`는 교정도 영국 철자(favourite, maths)를 쓰고, 코멘트는 아이가 이해하는 말로 격려하듯 쓴다.

## 절차

1. **상태 확인** — 총 문항, 시도 문항, 마지막 시도 기준 합격/정답률, 미시도 수, 복습대기 수를 먼저 뽑아 한 줄로 알린다.
2. **큐 뽑기** — 대화 한 라운드는 10문항. 기본은 신규 6 + 복습 4이고, 한쪽 풀이 모자라면 다른 쪽으로 채운다.
   - 신규 풀: 시도 기록이 하나도 없는 문항. 기본은 페이지와 같은 **오래된 순**(`order by created_at asc`)이고, CEO가 "섞어서"·"회화 위주로" 같은 말을 하면 무작위나 소재 순환으로 바꾼다. 페이지 드롭다운의 네 가지(오래된 순·종류 고르게·무작위·최신 순)와 같은 선택지다 — 구현은 `src/lib/english-queue.ts`.
   - 복습 풀: **마지막** 시도가 불합격인 문항. 오래 묵은 것부터.
3. **출제** — 번호(n/10), 신규·복습 표시, `topic`, `korean_full`, 그리고 `korean_chunks`를 줄바꿈 목록으로 보여준다.
4. **채점** — 아래 기준으로 점수·교정·자연스러운 문장·코멘트를 만든다.
5. **기록** — 채점 즉시 `english_practice_attempts`에 INSERT.
6. **결과 표시** — 점수/합격 여부, 교정문, 자연스러운 버전, 코멘트 1~3개, 그리고 이 시점에 `reference_english`를 공개한다. 바로 다음 문항으로 넘어간다.
7. **마무리** — "끝"이라고 하거나 10문항이 끝나면 이번 라운드 결과(푼 수, 합격 수, 평균 점수)와 갱신된 누적 통계를 정리한다. 더 하겠다면 2번부터 반복한다.

## 채점 기준 (페이지와 동일)

- 배점: 의미 정확도 50, 문법 30, 자연스러운 구어 표현 20. **80점 이상 합격.**
- `reference_english`는 정답이 아니라 하나의 가능한 답이다. 표현이 달라도 의미가 살아 있고 자연스러우면 감점하지 않는다.
- `corrected`: 학습자 문장을 최소한으로 고친 것. 학습자의 단어를 최대한 살린다.
- `natural`: 원어민이 실제로 말할 가장 자연스러운 버전.
- `points`: 1~3개, 중요한 것부터. `type`은 `grammar|word|natural|good` 중 하나, `note`는 60자 이내 한국어. 잘 썼으면 `good` 하나만.
- feedback jsonb는 페이지와 같은 모양으로 넣는다: `{"score":int,"corrected":"...","natural":"...","points":[{"type":"...","note":"..."}]}`

## 청킹 품질 규칙 (검수·생성 공통)

한글 청크는 영어 어순을 따르지만, **각 청크가 혼자서도 말이 되어야** 한다. 실제로 문제은행에서 반복해 나온 결함들이다.

- 영어 명사구를 두 청크로 자르지 않는다. `AI search | shadow data`, `based on | user-managed ledgers` 는 틀렸다.
- 뒤에 남은 관형절은 **머리명사를 되살려** 닫는다. `to the developer account | that owns the app` → `개발자 계정에요, | 앱을 소유한 계정이요.` 맨 끝이 `앱을 소유한.`, `제품이 쌓아온.` 처럼 관형형으로 끝나면 안 된다.
- 관형형에 `요`를 붙이지 않는다. `통합되는요`, `측정하는요` 는 비문이다. 명사+요(`통합되는 원리요`) 또는 조사+요(`다음 주에요.`, `무료로요.`)로 닫는다.
- `ceo`/`ryuha`는 구어체다. `~습니다/~입니다`가 섞이면 고친다. `ryuha_written`만 문어체(`~한다`)가 설계다.
- 빈 청크, `~에 대한 거예요` 같은 자리표시자, 영어 청크 수와 한글 청크 수 불일치는 그대로 두지 않는다.
- 영어 청크를 다시 나눌 때는 이어 붙인 결과가 `reference_english`와 같아야 한다.

검수 시 백업부터 뜬다. 항목이 많으면 SQL 대신 `@supabase/supabase-js` 스크립트로 덤프 → 판단 → 일괄 UPDATE 순서로 간다.

## 문항이 떨어졌을 때

신규 풀이 비면 문제를 손으로 짓지 말고 생성 API로 채운다.

```
POST /api/english/generate  {"count": 10, "profile": "ceo"}
```

로컬 서버가 안 떠 있으면 배포본을 쓰거나, 그 라운드는 복습만 돌린다.

## 참고 SQL

상태:
```sql
with latest as (
  select distinct on (item_id) item_id, passed, created_at
  from english_practice_attempts where profile='ceo'
  order by item_id, created_at desc
)
select
  (select count(*) from english_practice_items where profile='ceo') as total_items,
  (select count(*) from latest) as attempted,
  (select count(*) from latest where passed) as passed,
  (select count(*) from english_practice_items i
     where profile='ceo' and not exists (select 1 from latest l where l.item_id=i.id)) as fresh_remaining,
  (select count(*) from latest where not passed) as review_remaining;
```

큐:
```sql
with latest as (
  select distinct on (item_id) item_id, passed, created_at
  from english_practice_attempts where profile='ceo'
  order by item_id, created_at desc
),
review as (
  select i.id, i.korean_full, i.korean_chunks, i.topic, true as is_review, l.created_at as last_at
  from english_practice_items i join latest l on l.item_id=i.id
  where i.profile='ceo' and l.passed=false
  order by l.created_at asc limit 4
),
fresh as (
  select i.id, i.korean_full, i.korean_chunks, i.topic, false as is_review, i.created_at as last_at
  from english_practice_items i
  where i.profile='ceo' and not exists (select 1 from latest l where l.item_id=i.id)
  order by i.created_at asc limit 6
)
select * from review union all select * from fresh;
```

기록 (작은따옴표는 `''`로 이스케이프):
```sql
insert into english_practice_attempts (item_id, user_answer, score, passed, is_review, feedback, profile)
values ('<item_id>', '<답안>', 85, true, false,
        '{"score":85,"corrected":"...","natural":"...","points":[{"type":"good","note":"..."}]}'::jsonb,
        'ceo');
```

## 관련 코드

- 페이지: `src/app/(dashboard)/(linear)/english/page.tsx`, `_components/practice-view.tsx`
- API: `src/app/api/english/{generate,grade,queue,to-voicecards}/route.ts`
- 공용: `src/lib/english.ts` (프로필, 덱 매핑, llm-json 프록시)
