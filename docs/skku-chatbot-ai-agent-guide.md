# SKKU Chatbot — 자율 진화형 AI 에이전트 적용 가이드

**대화할수록 똑똑해지는 대학 챗봇을 만드는 방법**

---

## 왜 자율 진화형인가?

일반 챗봇은 세션이 끝나면 초기화된다. 벡터 검색 기반 RAG 챗봇은 넣어준 문서에서 "비슷한 것"을 찾아줄 뿐, 스스로 학습하지 않는다.

자율 진화형 챗봇은 다르다:
- **대화할수록 지식이 쌓인다** — 학생 질문에서 엔티티와 관계를 추출하여 DB에 축적
- **관계를 추론한다** — "컴공과 교수님이 가르치는 수업은?" 같은 관계 질의에 정확히 답변
- **스스로 개선된다** — 사용자 피드백에 따라 응답 스타일이 자동 조정됨

---

## 적용할 3가지 기둥

5가지 기둥 중 대학 챗봇에 적합한 3가지를 적용한다.

| # | 기둥 | 적용 여부 | 이유 |
|---|------|----------|------|
| 1 | MCP (도구 증강) | ✅ 적용 | 학사 시스템, 도서관 등 기존 시스템 연동 |
| 2 | 지식 그래프 (온톨로지) | ✅ 핵심 | 학과-교수-강의-건물 관계 구조화 |
| 3 | 동적 프롬프트 관리 | ✅ 적용 | 학사 규정 변경, 응답 스타일 개선 |
| 4 | 스키마 자율 확장 | △ Phase 3 | 운영 안정화 후 적용 |
| 5 | 코드 자기 수정 | ❌ 미적용 | 클라이언트 납품 프로젝트에 부적합 |

---

## 아키텍처

```
[Interface] 웹 채팅 UI (SKKU 포털 내장)
     ↓ 학생 질문
[Brain] LLM (Claude / GPT)
     - 시스템 프롬프트 = 고정부(코드) + 동적부(DB에서 로드)
     ↕ Tool Use
[Hands] MCP 서버
     - 학사 데이터 조회 도구
     - 도서관/시설 조회 도구
     - 지식 그래프 CRUD 도구
     ↕ SQL / API
[Memory] 데이터베이스 (PostgreSQL)
     - knowledge_entities (지식 노드)
     - knowledge_relations (노드 간 관계)
     - knowledge_insights (학습된 패턴)
     - prompt_sections (동적 프롬프트)
     - prompt_history (프롬프트 버전 관리)
```

---

## 기둥 1: MCP (도구 증강)

LLM이 직접 DB를 조회하지 않는다. MCP 프로토콜로 추상화된 **도구**를 호출한다. **도구 추가 = 능력 추가**.

### 동작 예시

```
학생: "소프트웨어학과 졸업요건이 뭐예요?"
     ↓
LLM: get_graduation_requirements 도구 호출 (department: "소프트웨어학과")
     ↓
MCP 서버: 학사 DB 쿼리 → 졸업요건 데이터 반환
     ↓
LLM: 자연어로 정리하여 응답
```

### SKKU 도메인 MCP 도구 예시

```typescript
// 도구 정의 예시 (TypeScript + @modelcontextprotocol/sdk)

// 학과 정보 조회
server.tool("get_department_info", {
  description: "학과 정보 조회 (교수진, 커리큘럼, 졸업요건 등)",
  parameters: z.object({
    department: z.string().describe("학과명"),
  }),
  handler: async ({ department }) => {
    const data = await db.query(
      "SELECT * FROM departments WHERE name LIKE $1", [`%${department}%`]
    );
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  },
});

// 강의 검색
server.tool("search_courses", {
  description: "강의 검색 (학과, 교수, 학년, 학기 기준)",
  parameters: z.object({
    keyword: z.string().optional(),
    department: z.string().optional(),
    professor: z.string().optional(),
    year: z.number().optional(),
    semester: z.enum(["1학기", "2학기", "여름학기", "겨울학기"]).optional(),
  }),
  handler: async (params) => { /* ... */ },
});

// 시설 정보 조회
server.tool("get_facility_info", {
  description: "건물/시설 위치, 운영시간 등 조회",
  parameters: z.object({
    facility_name: z.string().describe("건물명 또는 시설명"),
  }),
  handler: async ({ facility_name }) => { /* ... */ },
});

// 학사 일정 조회
server.tool("get_academic_calendar", {
  description: "학사 일정 조회 (수강신청, 시험, 방학 등)",
  parameters: z.object({
    year: z.number().optional(),
    semester: z.string().optional(),
    event_type: z.string().optional(),
  }),
  handler: async (params) => { /* ... */ },
});
```

### 왜 MCP인가?

- **표준 프로토콜** — Claude든 GPT든 어떤 LLM이든 같은 도구를 사용
- **확장이 쉬움** — 도서관 연동이 필요하면 `search_library` 도구만 추가
- **기존 시스템 유지** — SKKU 기존 DB/API를 그대로 두고 MCP 레이어만 얹음

---

## 기둥 2: 지식 그래프 (온톨로지) — 핵심

가장 중요한 차별점. 벡터 검색이 아닌 **Entity-Relation** 구조로 대학의 지식을 구조화한다.

### 벡터 DB vs 지식 그래프

| | 벡터 DB (RAG) | 지식 그래프 (온톨로지) |
|---|---|---|
| 질의 방식 | "비슷한 문서 찾기" | "정확한 관계 따라가기" |
| 예시 | "졸업" 검색 → 졸업 관련 문서 반환 | 소프트웨어학과 → requires → 졸업요건 |
| 장점 | 구현 쉬움 | 정확한 답, 설명 가능 |
| 한계 | 비슷한 문서가 정답이 아닐 수 있음 | 초기 구조화 비용 |
| 진화 | 문서 추가해야 함 (수동) | 대화에서 자동 축적 |

### DB 스키마

```sql
-- 지식 노드 (학과, 교수, 강의, 건물, 제도 등)
CREATE TABLE knowledge_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  description TEXT,
  tags TEXT[],
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 노드 간 관계
CREATE TABLE knowledge_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,       -- 출발 엔티티
  predicate TEXT NOT NULL,     -- 관계 유형
  object TEXT NOT NULL,        -- 도착 엔티티
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 학습된 인사이트 (자주 묻는 질문 패턴, 운영 관찰 등)
CREATE TABLE knowledge_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  insight_type TEXT NOT NULL,  -- faq_pattern, policy_change, observation
  entity_names TEXT[],
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### SKKU 도메인 엔티티 타입

| 엔티티 타입 | 설명 | 예시 |
|------------|------|------|
| `department` | 학과/학부 | 소프트웨어학과, 경영학과 |
| `professor` | 교수 | 김교수, 이교수 |
| `course` | 강의/과목 | 데이터구조, 알고리즘 |
| `building` | 건물/시설 | 제2공학관, 중앙도서관 |
| `policy` | 학사제도/규정 | 졸업요건, 복수전공 규정 |
| `event` | 학사일정 | 수강신청, 기말고사 |
| `service` | 학생서비스 | 장학금, 기숙사, 상담센터 |

### SKKU 도메인 관계 타입

| 관계 (predicate) | 설명 | 예시 |
|-----------------|------|------|
| `belongs_to` | 소속 | 김교수 → belongs_to → 소프트웨어학과 |
| `teaches` | 강의 담당 | 김교수 → teaches → 데이터구조 |
| `located_at` | 위치 | 소프트웨어학과 → located_at → 제2공학관 |
| `requires` | 필수 조건 | 알고리즘 → requires → 데이터구조 (선수과목) |
| `part_of` | 소속/구성 | 데이터구조 → part_of → 소프트웨어학과 (전공필수) |
| `scheduled_at` | 일정 | 기말고사 → scheduled_at → 12월 3주차 |
| `provides` | 제공 | 중앙도서관 → provides → 스터디룸 예약 |

### 자동 지식 추출 — 대화에서 DB가 채워지는 과정

```
학생: "김교수님 연구실이 어디예요?"
     ↓
챗봇: 답변 + 동시에 지식 추출:
     - Entity: 김교수 (professor)
     - Relation: 김교수 → located_at → N동 501호
     - Insight: "교수 연구실 위치가 자주 질문됨" (faq_pattern)
```

```
학생: "컴공과에서 복수전공 하려면 뭐가 필요해요?"
     ↓
챗봇: 답변 + 지식 추출:
     - Relation: 소프트웨어학과 → requires → 복수전공 신청 (최소 36학점)
     - Insight: "학과별 복수전공 요건 질문 빈도 높음" (faq_pattern)
```

시스템 프롬프트에 다음과 같이 지시:

```
"모든 대화에서 지식을 추출하라:
 - 새로운 개념이 등장하면 → 엔티티 생성 도구 호출
 - 관계가 발견되면 → 관계 생성 도구 호출
 - 반복 질문 패턴 발견 시 → 인사이트 기록
 - 기존 엔티티에 새 정보가 추가되면 → 엔티티 업데이트"
```

### 온톨로지 활용 — 관계 추론 답변

지식 그래프가 쌓이면 이런 답변이 가능해진다:

```
학생: "소프트웨어학과 3학년이 들어야 할 수업 추천해주세요"
     ↓
챗봇 내부:
  1. search_entities(type: "course") → 소프트웨어학과 과목 목록
  2. search_relations(subject: "소프트웨어학과", predicate: "part_of") → 전공필수/선택 구분
  3. search_relations(predicate: "requires") → 선수과목 체인 확인
  4. search_insights(type: "faq_pattern") → "이 과목은 학생들이 어려워함" 패턴
     ↓
챗봇: 선수과목 이수 여부 + 전공필수 우선순위 + 학생 피드백 기반 추천
```

이것은 벡터 검색으로는 불가능한 답변이다. 문서에서 "비슷한 것"을 찾는 게 아니라, **관계를 따라가며 추론**하기 때문이다.

---

## 기둥 3: 동적 프롬프트 관리

시스템 프롬프트를 하드코딩하지 않는다. DB에서 로드하여 운영 중 수정 가능하게 한다.

### 왜 필요한가?

- 학사 규정이 바뀌면? → 프롬프트 업데이트 (재배포 불필요)
- 학생들이 "너무 딱딱하게 답한다"고 하면? → 응답 스타일 섹션 수정
- 새 학기마다 중요 안내사항이 바뀌면? → 공지사항 섹션 업데이트

### DB 스키마

```sql
-- 동적 프롬프트 섹션
CREATE TABLE prompt_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  updated_by TEXT DEFAULT 'human',  -- 'human' 또는 'agent'
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 변경 이력 (롤백 가능)
CREATE TABLE prompt_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL,
  old_content TEXT,
  new_content TEXT NOT NULL,
  reason TEXT,
  version INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 프롬프트 섹션 예시

| section_key | 용도 | 예시 |
|-------------|------|------|
| `role_definition` | 챗봇 역할 정의 | "성균관대학교 학생 도우미 챗봇입니다" |
| `response_style` | 응답 스타일 | "친근하고 간결하게, 존댓말 사용" |
| `current_notices` | 현재 공지사항 | "수강신청 기간: 3/2~3/5" |
| `policy_summary` | 주요 학사 규정 요약 | 졸업요건, 성적 기준 등 |
| `faq_priorities` | 자주 묻는 질문 우선순위 | 인사이트에서 자동 업데이트 |

### 동작 흐름

```
시스템 프롬프트 = CORE_PROMPT (고정, 코드에 존재)
              + prompt_sections에서 로드한 동적 섹션들
              + 지식 그래프 요약 (온톨로지에서 로드)
```

```
관리자: 학사 규정 변경 → prompt_sections의 'policy_summary' 업데이트
     ↓
다음 대화: 챗봇이 업데이트된 프롬프트를 로드 → 즉시 반영
     (코드 수정, 재배포 없음)
```

**에이전트 자동 업데이트 (선택):**
```
학생들이 "좀 더 쉽게 설명해줘"를 50번 반복
     ↓
챗봇: response_style 섹션을 자동 업데이트
     "전문 용어 사용 시 괄호로 쉬운 설명 병기"
     사유: "학생들이 쉬운 설명을 반복적으로 요청"
     ↓
다음 대화부터: 응답 스타일이 자동 개선
```

---

## 구현 단계

### Phase 1: 기반 구축 (MCP + 기본 챗봇)

```
1. SKKU 데이터 구조화
   - 학과, 교수, 강의, 건물 등 기본 데이터를 DB에 적재

2. MCP 서버 구현
   - 학사 데이터 조회 도구들 정의
   - 도서관, 시설 등 기존 시스템 API 연동

3. 챗봇 UI + LLM 연동
   - 시스템 프롬프트 작성 (역할, 응답 규칙)
   - 기본적인 질의응답 동작 확인
```

→ 이 단계만으로 **기본 챗봇 완성**. 일반 RAG 챗봇과 비슷한 수준.

### Phase 2: 지식 축적 (온톨로지)

```
4. 지식 그래프 테이블 생성
   - knowledge_entities, knowledge_relations, knowledge_insights

5. 지식 그래프 MCP 도구 추가
   - create_entity, create_relation, create_insight
   - search_entities, search_relations

6. 시스템 프롬프트에 지식 추출 규칙 추가
   - "모든 대화에서 엔티티와 관계를 추출하라"
```

→ 이 단계부터 **대화할수록 DB가 채워진다**. 일반 챗봇과 차별화 시작.

### Phase 3: 자율 개선 (동적 프롬프트)

```
7. prompt_sections, prompt_history 테이블 생성

8. 시스템 프롬프트를 고정부 + 동적부로 분리

9. 관리자 UI 또는 에이전트 자동 업데이트 메커니즘 구현
```

→ 이 단계부터 **재배포 없이 챗봇 행동 수정 가능**. 운영 효율 극대화.

---

## 기술 스택 권장

| 구성요소 | 권장 | 대안 |
|----------|------|------|
| LLM | Claude API | GPT-4, Gemini |
| MCP 런타임 | `@modelcontextprotocol/sdk` | 직접 REST API로 구현 |
| 데이터베이스 | PostgreSQL (Supabase) | MySQL, MongoDB |
| 웹 프레임워크 | Next.js | FastAPI, Express |
| 채팅 UI | 웹 임베드 (SKKU 포털) | 별도 앱 |

---

## 핵심 정리

```
일반 RAG 챗봇:
  문서 → 벡터 DB → "비슷한 것" 검색 → 답변
  (정적. 넣어준 문서 범위 내에서만 답변)

자율 진화형 챗봇:
  대화 → 지식 추출 → 온톨로지 DB 축적 → 관계 추론 답변
  (동적. 대화할수록 관계가 촘촘해지고 답변이 정교해짐)
```

운영 1학기 후의 온톨로지는 "학생들이 실제로 뭘 궁금해하는지"가 데이터로 증명된 자산이다. 이것이 다른 대학에도 적용할 수 있는 확장 가능한 모델이 된다.

> **"프레임은 고정, 안의 정보 밀도가 계속 진화하는 시스템."**
