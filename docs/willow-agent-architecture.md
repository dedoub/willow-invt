# 윌로우 에이전트 (Willow Agent)

**자율 진화형 AI COO 에이전트**

Telegram Bot → Claude Code CLI (full session) → MCP Server → Supabase DB 구조의 자율 진화형 AI 에이전트

## Tech Stack

| 구성요소 | 기술 |
|----------|------|
| Runtime | Node.js (Next.js 15) |
| AI Engine | Claude Code CLI (`--print` 모드, full session) |
| Protocol | MCP (Model Context Protocol) - Streamable HTTP |
| DB | Supabase (PostgreSQL) × 3 프로젝트 |
| Interface | Telegram Bot API (polling) |
| Deploy | Vercel |

---

## 아키텍처 (5 레이어)

```
[Interface] Telegram Bot (bash script, polling)
     ↓ 메시지 수신
[Brain] Claude Code CLI
     - System Prompt = 고정부(코드) + 동적부(DB에서 로드)
     - auto-memory (MEMORY.md) 로 세션 간 상태 유지
     ↕ Tool Use
[Hands] MCP Server (99개 도구)
     - CRUD: 위키, 일정, 인보이스, 프로젝트, 태스크
     - 온톨로지: 엔티티/관계/인사이트 검색·생성
     ↕ SQL
[Memory] Supabase DB
     - knowledge_entities (지식 노드)
     - knowledge_relations (노드 간 관계)
     - knowledge_insights (의사결정 기록)
     - knowledge_attribute_catalog (스키마 자율 확장)
     - agent_prompt_sections (동적 프롬프트)
     - agent_prompt_history (프롬프트 버전 관리)
     ↕
[Self-Modify] 파일 R/W, bash, git, DB migration
```

---

## 핵심 설계 패턴 5가지

### 1. Tool-Augmented Agent (MCP)

LLM이 직접 DB를 조회하지 않고, MCP 프로토콜로 추상화된 도구를 호출합니다. **도구 추가 = 능력 추가**. OAuth 2.1로 인증.

- MCP 서버 엔드포인트: `/api/mcp` (Streamable HTTP)
- 도구 99개: 위키, 일정, 인보이스, 프로젝트, 태스크, 온톨로지 등
- 인증: OAuth 2.1 + PKCE (`/api/mcp/oauth/*`)

```
사용자 메시지: "내일 일정 뭐 있어?"
     ↓
Claude: list_schedules 도구 호출
     ↓
MCP Server: Supabase 쿼리 → 결과 반환
     ↓
Claude: 자연어로 응답 생성
```

### 2. Knowledge Graph (온톨로지)

벡터 검색이 아닌 **Entity-Relation-Insight** 구조의 그래프 DB. 대화에서 자동으로 지식을 추출하여 축적합니다. 컨텍스트 윈도우에 의존하지 않는 영속적 기억.

**테이블 구조:**

```sql
-- 지식 노드
knowledge_entities (
  name TEXT,
  entity_type TEXT,  -- person, company, project, strategy, ...
  description TEXT,
  tags TEXT[],
  properties JSONB   -- 자유 확장 가능한 속성
)

-- 노드 간 관계
knowledge_relations (
  subject TEXT,       -- 주어 엔티티
  predicate TEXT,     -- 관계 유형 (owns, manages, uses_technology, ...)
  object TEXT,        -- 목적어 엔티티
  properties JSONB
)

-- 의사결정/인사이트 기록
knowledge_insights (
  content TEXT,
  insight_type TEXT,  -- decision, concept, preference, ...
  entity_names TEXT[],
  context TEXT
)
```

**핵심 차별점:** 벡터 DB는 "비슷한 것"을 찾지만, 온톨로지는 "정확한 관계"를 추론합니다. "텐소프트웍스가 사용하는 기술은?" → `uses_technology` 관계를 따라가면 됩니다.

### 3. Dynamic Prompt Management

시스템 프롬프트를 하드코딩하지 않고 DB 테이블에서 로드합니다. 에이전트가 스스로 프롬프트 섹션을 수정 가능하며, 버전 히스토리로 롤백도 가능합니다.

```
System Prompt = CORE_PROMPT(코드, 고정) + 동적 섹션(DB, 변경 가능)
```

**동적 섹션 5개:**
- 전략조언 스타일
- 커뮤니케이션 스타일
- 지식추출 규칙
- 위험판단 기준
- 자기개선 지침

```sql
agent_prompt_sections (
  section_key TEXT,    -- 'strategy_advice', 'communication', ...
  content TEXT,        -- 실제 프롬프트 내용
  version INTEGER,
  updated_by TEXT      -- 'agent' or 'human'
)

agent_prompt_history (
  section_key TEXT,
  old_content TEXT,
  new_content TEXT,
  reason TEXT,         -- 왜 수정했는지
  version INTEGER
)
```

### 4. Schema Self-Extension (Attribute Catalog)

고정 스키마 위에 에이전트가 새 속성을 자율 발견·등록합니다. 대화가 쌓일수록 데이터 모델이 정교해집니다.

**레벨 구조:**

| 레벨 | 설명 | 변경 가능 | 예시 |
|------|------|-----------|------|
| 레벨 1 | 엔티티 타입, 관계 구조 | ❌ 절대 고정 | `entity_type: company` |
| 레벨 2 | 표준 속성 (core key) | △ 거의 고정 | `company.industry`, `person.role` |
| 레벨 3 | 밀도 확장 속성 | ✅ 자율 확장 | 대화에서 발견한 새 속성 |

```
대화: "텐소프트웍스 직원이 15명이래"
     ↓
에이전트 판단: 'employee_count'는 기존 카탈로그에 없는 속성
     ↓
discover_attribute 액션 실행 → 레벨 3으로 등록
     ↓
이후 모든 company 엔티티에 employee_count 추적 가능
```

### 5. Self-Modifying Code

에이전트가 자신의 소스 코드를 읽고, 수정하고, git commit/push하고, DB 마이그레이션까지 실행합니다. 개발자 없이 자체 기능 확장 가능.

**가능한 작업:**
- 파일 읽기/쓰기/편집
- bash 명령 실행
- git commit, push
- Supabase 마이그레이션 (DDL 실행)
- Vercel 배포 트리거
- MCP 도구 추가/수정

---

## 텔레그램 봇 동작 흐름

```
┌─────────────────────────────────────────────────────┐
│ 1. telegram-bot.sh: 30초 간격 long-polling          │
│    └─ Telegram getUpdates API 호출                  │
│                                                      │
│ 2. 새 메시지 수신                                    │
│    └─ offset 파일로 중복 방지                        │
│                                                      │
│ 3. 사업 데이터 수집 (MCP API 호출)                   │
│    ├─ 일정 (이번 주)                                 │
│    ├─ 인보이스 (최근 20건)                           │
│    ├─ 텐소프트웍스 현황 (프로젝트, 태스크, 주간보고) │
│    └─ 위키 노트 목록                                 │
│                                                      │
│ 4. 시스템 프롬프트 조립                              │
│    ├─ CORE_PROMPT (고정, COO 역할 정의)              │
│    ├─ 동적 섹션 (agent_prompt_sections에서 로드)     │
│    ├─ 사업 데이터 (3에서 수집한 것)                  │
│    ├─ 온톨로지 요약 (엔티티, 관계, 인사이트)         │
│    ├─ 위키 노트 목록                                 │
│    └─ 이전 대화 히스토리 (최근 5턴)                  │
│                                                      │
│ 5. Claude Code CLI 실행                              │
│    └─ claude --print --model opus                    │
│       --allowedTools 'mcp__*' 'Read' 'Write' ...     │
│                                                      │
│ 6. 응답 파싱                                         │
│    ├─ 텍스트 → Telegram sendMessage                  │
│    ├─ ```action 블록 → API 호출                      │
│    │   (일정 등록, 위키 작성, 태스크 생성 등)         │
│    └─ 온톨로지 블록 → DB 저장                        │
│       (엔티티, 관계, 인사이트 자동 추출)             │
└─────────────────────────────────────────────────────┘
```

### 주요 파일

```
scripts/
├── telegram-bot.sh          # 봇 메인 스크립트 (bash)
├── telegram-bot.ts          # 프롬프트 조립 로직 (TypeScript)
└── logs/
    ├── telegram-bot.pid     # 프로세스 ID (중복 실행 방지)
    ├── telegram-bot.lock    # 동시 실행 방지 lock
    ├── telegram-bot.offset  # Telegram update offset
    └── telegram-bot.log     # 실행 로그

app/api/mcp/
├── route.ts                 # MCP Streamable HTTP 엔드포인트
└── oauth/                   # OAuth 2.1 인증

lib/mcp/tools/
├── wiki.ts                  # 위키 도구
├── etf.ts                   # Akros/ETC 도구
├── projects.ts              # 프로젝트 도구
├── ryuha.ts                 # 류하 학습관리 도구
├── willow-mgmt.ts           # 윌로우 경영관리 도구
├── tensw-mgmt.ts            # 텐소프트웍스 도구
├── knowledge.ts             # 온톨로지 도구
└── ...
```

---

## ASO 자율 진화 5요소

| # | 요소 | 상태 | 구현체 |
|---|------|------|--------|
| 1 | DB 접근 | ✅ | MCP 99개 도구 |
| 2 | 지식 축적 | ✅ | 온톨로지 DB 3테이블 |
| 3 | Key 자율 확장 | ✅ | Attribute Catalog (레벨 1-2-3) |
| 4 | 프롬프트 자기 수정 | ✅ | agent_prompt_sections + history |
| 5 | 코드 자기 수정 | ✅ | 풀 세션 모드 (파일 R/W, git, bash) |

---

## 재현 가이드

### 필요 요소

1. **Claude Code CLI** + Anthropic API key
2. **Supabase 프로젝트** (온톨로지 테이블 6개 + 업무 데이터 테이블)
3. **Next.js 앱** + MCP 엔드포인트 (`/api/mcp`)
4. **Telegram Bot Token** (BotFather에서 발급)
5. **시스템 프롬프트 설계** (도메인별 역할 정의)
6. **CLAUDE.md** (프로젝트 컨텍스트, 디자인 시스템 등)

### 최소 구현 순서

```
Phase 1: 기반
├── 1. Next.js + Supabase 셋업
├── 2. MCP 서버 구현 (/api/mcp)
└── 3. 업무 도구 정의 (CRUD 도구들)

Phase 2: 지능
├── 4. 온톨로지 테이블 생성 + MCP 도구 추가
├── 5. 시스템 프롬프트 설계 (역할, 액션 포맷)
└── 6. 텔레그램 봇 스크립트 작성

Phase 3: 자율 진화
├── 7. 동적 프롬프트 테이블 추가
└── 8. Attribute Catalog 추가
```

---

## 핵심 인사이트

> **"프레임은 고정, 안의 정보 밀도가 계속 진화하는 시스템"**

일반 챗봇과의 결정적 차이:
- 챗봇: 컨텍스트 윈도우 안에서만 똑똑함 → 세션 끝나면 리셋
- 윌로우 에이전트: DB에 지식 축적 → 세션이 쌓일수록 똑똑해짐 → 스스로 프롬프트와 코드까지 수정

이 구조를 **Agentic Service Organization (ASO)** 이라 부르며, 하나의 에이전틱 서비스를 활용하는 에이전틱 서비스를 만들고, 이를 반복하면 큰 조직처럼 움직이는 에이전틱 서비스 조직이 됩니다.
