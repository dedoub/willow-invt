# 자율 진화형 AI 에이전트 — 빌더 가이드

**시간이 지날수록 똑똑해지는 AI 에이전트를 만드는 방법**

지식을 축적하고, 스키마를 스스로 확장하고, 프롬프트를 스스로 수정하고, 나아가 자기 코드까지 업데이트하는 자율 AI 에이전트를 만들기 위한 실전 아키텍처.

---

## 개요

대부분의 AI 챗봇은 세션이 끝나면 초기화된다. 이 가이드는 **진화하는** 에이전트 — 대화할수록 기억하고, 학습하고, 스스로 개선하는 에이전트를 만드는 방법을 설명한다.

```
[Interface] 채팅 UI / 메신저 봇 (Telegram, Slack 등)
     ↓ 사용자 메시지
[Brain] LLM (Claude, GPT 등) + 풀 도구 접근 권한
     - 시스템 프롬프트 = 고정부(코드) + 동적부(DB에서 로드)
     - 세션 메모리로 세션 간 연속성 유지
     ↕ Tool Use
[Hands] MCP 서버 (구조화된 도구 레이어)
     - 도메인 데이터 CRUD 도구
     - 지식 그래프 도구 (엔티티, 관계, 인사이트)
     ↕ SQL / API
[Memory] 데이터베이스 (PostgreSQL 등)
     - knowledge_entities (지식 노드)
     - knowledge_relations (노드 간 관계)
     - knowledge_insights (의사결정 기록)
     - attribute_catalog (자율 확장 스키마)
     - prompt_sections (동적 프롬프트 내용)
     - prompt_history (프롬프트 버전 관리)
     ↕
[Self-Modify] 파일 R/W, 셸 명령, git, DB 마이그레이션
```

---

## 자율 진화의 5가지 기둥

### 1. 도구 증강 에이전트 (MCP)

LLM이 직접 DB를 조회하지 않는다. 대신 MCP(Model Context Protocol)로 추상화된 **도구**를 호출한다. **도구 추가 = 능력 추가**.

```
사용자: "내일 미팅 뭐 있어?"
     ↓
LLM: list_schedules 도구 호출
     ↓
MCP 서버: DB 쿼리 → 결과 반환
     ↓
LLM: 자연어로 응답 생성
```

**왜 MCP인가?**
- 표준화된 프로토콜 — 어떤 LLM이든 사용 가능
- OAuth 2.1 인증 내장
- 도구가 자기 설명적 (이름, 설명, 스키마 포함)
- 새 기능 추가 = 새 도구 핸들러 추가

**구현 예시:**
```typescript
// MCP 도구 정의 예시
server.tool("list_schedules", {
  description: "다가오는 일정 목록 조회",
  parameters: z.object({
    start_date: z.string().optional(),
    end_date: z.string().optional(),
  }),
  handler: async ({ start_date, end_date }) => {
    const data = await db.query("SELECT * FROM schedules WHERE ...");
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
});
```

---

### 2. 지식 그래프 (온톨로지)

벡터 검색("비슷한 것을 찾기")이 아닌, 구조화된 **Entity-Relation-Insight** 그래프("정확한 관계를 추론")를 사용한다.

**스키마:**

```sql
-- 지식 노드
CREATE TABLE knowledge_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,  -- person, company, project, concept, ...
  description TEXT,
  tags TEXT[],
  properties JSONB DEFAULT '{}',  -- 자유롭게 확장 가능한 속성
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 노드 간 관계 (엣지)
CREATE TABLE knowledge_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,       -- 출발 엔티티명
  predicate TEXT NOT NULL,     -- 관계 유형 (owns, manages, uses, ...)
  object TEXT NOT NULL,        -- 도착 엔티티명
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 의사결정, 학습, 선호도
CREATE TABLE knowledge_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  insight_type TEXT NOT NULL,  -- decision, concept, preference, observation
  entity_names TEXT[],         -- 관련 엔티티들
  context TEXT,                -- 왜 중요한지
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**벡터 DB와의 핵심 차이:**
- 벡터 DB: "X와 비슷한 문서 찾기" (확률적)
- 지식 그래프: "A 회사가 사용하는 기술은?" → `uses_technology` 엣지를 따라감 (결정적)

**대화에서 자동 추출:**
시스템 프롬프트에서 에이전트에게 매 대화마다 지식을 추출하도록 지시한다:
```
시스템 프롬프트:
"모든 대화에서 엔티티, 관계, 인사이트를 추출하라.
 새로운 개념을 발견하면 → 엔티티 생성.
 관계를 발견하면 → 관계 생성.
 의사결정이 이루어지면 → 인사이트 기록."
```

---

### 3. 동적 프롬프트 관리

시스템 프롬프트를 하드코딩하지 않는다. 두 부분으로 나눈다:
- **CORE_PROMPT** (고정, 코드에 존재): 역할 정의, 도구 설명, 출력 포맷
- **동적 섹션** (DB에 존재, 변경 가능): 에이전트가 스스로 수정할 수 있는 행동 규칙

```sql
CREATE TABLE prompt_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT UNIQUE NOT NULL,  -- 'communication_style', 'risk_assessment', ...
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_by TEXT DEFAULT 'human',   -- 'agent' 또는 'human'
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL,
  old_content TEXT,
  new_content TEXT NOT NULL,
  reason TEXT,                       -- 왜 이 변경이 필요했는지
  version INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**에이전트가 자기 프롬프트를 수정하는 흐름:**
```
사용자: "너무 장황하게 말하지 마. 불릿 포인트로만 줘."
     ↓
에이전트: prompt_sections 테이블의 'communication_style' 섹션 업데이트
         사유: "사용자가 간결한 불릿 포인트 응답을 요청"
     ↓
다음 세션: 에이전트가 업데이트된 프롬프트를 로드 → 행동이 바뀜
```

이것이 피드백 루프를 만든다: 사용자 피드백 → 프롬프트 업데이트 → 개선된 행동 → 더 많은 피드백.

---

### 4. 스키마 자율 확장 (Attribute Catalog)

고정 스키마로는 모든 것을 담을 수 없다. 3단계 시스템을 설계한다:

| 레벨 | 설명 | 변경 가능? | 예시 |
|------|------|-----------|------|
| 레벨 1 | 엔티티 타입, 관계 구조 | ❌ 고정 | `entity_type: company` |
| 레벨 2 | 표준 속성 (core key) | △ 거의 안 바뀜 | `company.industry`, `person.role` |
| 레벨 3 | 밀도 확장 속성 | ✅ 에이전트가 확장 | 대화에서 발견됨 |

```sql
CREATE TABLE attribute_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,      -- 어떤 엔티티 타입에 적용되는지
  description TEXT,
  data_type TEXT DEFAULT 'text',  -- text, number, date, boolean
  level INTEGER DEFAULT 3,        -- 1=고정, 2=표준, 3=자동발견
  importance TEXT DEFAULT 'medium',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**동작 방식:**
```
대화: "파트너사 직원이 200명이래"
     ↓
에이전트: 'employee_count'가 'company' 엔티티의 카탈로그에 없네?
     ↓
에이전트: 'employee_count'를 레벨 3 속성으로 등록
     ↓
이후: 에이전트가 모든 company 엔티티에서 employee_count를 추적
```

스키마 마이그레이션 없이도 대화가 쌓일수록 데이터 모델이 풍부해진다.

---

### 5. 코드 자기 수정

에이전트가 자기 자신의 소스 코드를 읽고, 수정하고, 배포한다. 5가지 기둥 중 가장 강력하면서 가장 위험한 요소.

**가능한 작업:**
- 프로젝트 내 파일 읽기/쓰기/편집
- 셸 명령 실행
- Git 커밋 및 푸시
- DB 마이그레이션 실행
- 배포 트리거
- 새 MCP 도구 추가 (= 자기 자신에게 새 능력 부여)

**안전 장치:**
- 파괴적 작업은 사용자의 명시적 확인 필요
- Git push는 명시적 요청 시에만
- 모든 프롬프트/스키마 변경에 버전 히스토리 유지 (롤백 가능)
- 핵심 아키텍처(레벨 1)는 불변

---

## 메신저 봇 연동

봇은 **인터페이스 레이어**로, 사용자를 AI 두뇌에 연결하는 역할을 한다.

### 동작 흐름

```
┌──────────────────────────────────────────────┐
│ 1. 봇이 새 메시지를 폴링                      │
│    (long-polling 또는 webhook)                │
│                                              │
│ 2. 새 메시지 수신                             │
│    └─ offset/timestamp로 중복 제거            │
│                                              │
│ 3. 컨텍스트 데이터 수집 (MCP/API 경유)         │
│    ├─ 일정, 태스크, 인보이스                   │
│    ├─ 지식 그래프 요약                        │
│    └─ 최근 대화 이력                          │
│                                              │
│ 4. 시스템 프롬프트 조립                        │
│    ├─ CORE_PROMPT (고정)                      │
│    ├─ 동적 섹션 (DB에서 로드)                  │
│    ├─ 사업 데이터 (3단계에서 수집한 것)         │
│    ├─ 지식 그래프 요약                        │
│    └─ 대화 이력 (최근 N턴)                    │
│                                              │
│ 5. LLM 호출 (풀 도구 접근 권한)                │
│    └─ 응답 파싱:                              │
│       ├─ 텍스트 → 채팅 메시지로 전송           │
│       ├─ 액션 블록 → API로 실행               │
│       └─ 지식 → 온톨로지 DB에 저장            │
│                                              │
│ 6. 스케일링 처리                              │
│    └─ 온톨로지 > 임계치:                      │
│       전체 데이터 대신 요약만 주입              │
└──────────────────────────────────────────────┘
```

### 자동 스케일링 컨텍스트

지식 그래프가 커지면 모든 것을 프롬프트에 넣을 수 없다. 임계치를 설정한다:

```
if (entity_count <= 80) {
  // 전체 온톨로지를 시스템 프롬프트에 주입
} else {
  // 요약만 주입 + 에이전트가 MCP 도구로 직접 쿼리
}
```

---

## 액션 패턴

에이전트가 부수 효과(side effect)를 발생시키기 위한 구조화된 포맷을 정의한다:

````markdown
```action
{"type": "create_schedule", "title": "팀 미팅", "date": "2026-03-15"}
```
````

봇이 LLM 응답에서 이 블록들을 파싱하고 API 호출로 실행한다. 이렇게 하면 **에이전트가 말하는 것**(텍스트)과 **에이전트가 하는 것**(액션)이 분리된다.

**주요 액션 타입:**
- `create_schedule` — 캘린더 이벤트 추가
- `create_note` — 문서 작성
- `create_task` — 태스크 추가
- `update_prompt` — 자기 행동 규칙 수정
- `discover_attribute` — 스키마 확장
- `create_entity` / `create_relation` / `create_insight` — 지식 그래프 구축

---

## 구현 단계

### Phase 1: 기반 구축
```
├── 1. 웹 앱 + 데이터베이스 셋업
├── 2. MCP 서버 구현 (도구 엔드포인트)
└── 3. 도메인별 CRUD 도구 정의
```

### Phase 2: 지능 부여
```
├── 4. 지식 그래프 테이블 + MCP 도구
├── 5. 시스템 프롬프트 설계 (역할, 액션 포맷, 추출 규칙)
└── 6. 메신저 봇 스크립트 (Telegram, Slack 등)
```

### Phase 3: 자율 진화
```
├── 7. 동적 프롬프트 테이블 + 업데이트 메커니즘
└── 8. Attribute Catalog + 자동 발견
```

### Phase 4: 자율성 (선택)
```
└── 9. 코드 자기 수정 기능
      (파일 R/W, git, 배포)
```

---

## 기술 스택 옵션

| 구성요소 | 선택지 |
|----------|--------|
| LLM | Claude (Claude Code CLI 경유), GPT, Gemini |
| MCP 런타임 | `@modelcontextprotocol/sdk` (TypeScript) |
| 데이터베이스 | Supabase, Neon, PlanetScale, 순수 PostgreSQL |
| 웹 프레임워크 | Next.js, FastAPI, Express |
| 채팅 인터페이스 | Telegram Bot, Slack Bot, Discord Bot, 커스텀 UI |
| 배포 | Vercel, Railway, Fly.io |

---

## 핵심 통찰

> **"프레임은 고정, 안의 정보 밀도가 계속 진화하는 시스템."**

일반 챗봇과의 차이:
- **일반 챗봇**: 컨텍스트 윈도우 안에서만 똑똑함 → 세션 끝나면 리셋
- **자율 진화 에이전트**: DB에 지식을 축적 → 세션마다 더 똑똑해짐 → 자기 프롬프트와 코드까지 수정

에이전트는 단순히 질문에 답하는 게 아니다. **조직의 기억을 쌓고**, **자기 행동을 다듬고**, **자기 능력을 확장**해 나간다.

---

## 시작하기 (최소 기능 에이전트)

1. **데이터베이스 구축** — 위의 6개 테이블 생성 (entities, relations, insights, attribute_catalog, prompt_sections, prompt_history)
2. **MCP 서버 구축** — 도메인 CRUD 도구 + 지식 그래프 도구
3. **시스템 프롬프트 작성** — 에이전트의 역할 정의 + 지식 추출 지시
4. **채팅 인터페이스 연결** — Telegram 봇이 가장 간단 (폴링 + API 호출)
5. **대화 시작** — 에이전트가 첫 날부터 지식 그래프를 만들기 시작한다

이 아키텍처의 장점은 **Phase 1만으로도 바로 쓸 수 있다**는 것이다. 각 단계를 추가할 때마다 에이전트가 의미 있게 더 똑똑해진다. 한 번에 다 만들 필요가 없다.
