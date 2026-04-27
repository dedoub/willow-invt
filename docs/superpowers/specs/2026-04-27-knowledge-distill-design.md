# Knowledge Distillation Pipeline Design

## Goal

모든 콘텐츠 소스(이메일, 텔레그램 대화, 주식 매매/리서치)에서 지식을 추출하여 Knowledge Graph(`knowledge_entities`, `knowledge_relations`, `knowledge_insights`)로 자동 연결하는 파이프라인 구축.

## Background

현재 시스템은 콘텐츠 소스들이 사일로로 존재한다:
- **이메일**: Gemini로 분석(`email_metadata`)되지만 KG 미연결
- **텔레그램 대화**: `telegram_conversations`에 저장만 됨, 분석 없음
- **주식 매매/리서치**: `stock_trades`, `stock_research`에 저장, KG 미연결

Knowledge Graph 테이블과 MCP 도구는 이미 존재하지만, 자동으로 데이터를 채우는 파이프라인이 없다.

## Architecture

```
Source Tables                  Distillation                    Knowledge Graph
─────────────                  ────────────                    ───────────────
email_metadata ─────┐
                    │
telegram_convo ─────┼──→ knowledge-distill.ts ──→ knowledge_entities
                    │    (Claude CLI 기반)        knowledge_relations
stock_trades ───────┤    launchd 매일 06:00       knowledge_insights
stock_research ─────┘
                              │
                              ▼
                    knowledge_distill_log
                    (처리 이력 추적)
```

### 단일 스크립트, 소스별 처리 함수

`scripts/knowledge-distill.ts` 하나에 모든 소스 처리 로직을 포함한다. 소스마다 추출 전략이 다르므로 별도 함수로 분리하되, 공통 KG 쓰기 로직은 공유한다.

## Data Sources & Extraction Strategy

### 1. Email → Knowledge Graph

**입력**: `email_metadata` (is_analyzed = true)

**추출 대상**:
- `entities.people` → `knowledge_entities` (type: person)
- `entities.companies` → `knowledge_entities` (type: company)
- `entities.products` → `knowledge_entities` (type: product)
- `entities.tickers` → `knowledge_entities` (type: market)
- `topics` → `knowledge_insights` (type: observation, 반복 토픽 패턴)
- `action_items` → `knowledge_insights` (type: decision)
- 인물-회사 관계 → `knowledge_relations` (predicate: works_at, collaborates_with)

**전략**: 이메일은 이미 Gemini가 구조화된 entities/topics/action_items를 추출해 둔 상태이므로, Claude CLI 없이 직접 매핑한다. 단, 관계 추론(누가 어느 회사 소속인지)은 이메일 도메인 + from_name 기반 규칙으로 처리한다.

**처리 단위**: 개별 이메일 (email_metadata.gmail_message_id 기준)

### 2. Telegram Conversations → Knowledge Graph

**입력**: `telegram_conversations` (bot_type: 'ceo')

**추출 대상**:
- 결정사항 → `knowledge_insights` (type: decision)
- 관찰/의견 → `knowledge_insights` (type: observation)
- 언급된 인물/기업/종목 → `knowledge_entities`
- 전략적 판단 → `knowledge_insights` (type: pattern)

**전략**: 텔레그램 대화는 비정형이므로 Claude CLI로 분석한다. 대화 전체를 넘기고 구조화된 JSON을 요청한다.

**처리 단위**: conversation 전체 (chat_id + bot_type 기준, updated_at 비교)

**Ryuha 대화는 제외**: 학습 관련 대화는 Knowledge Graph 대상이 아님.

### 3. Stock Trades → Knowledge Graph

**입력**: `stock_trades`

**추출 대상**:
- 종목 → `knowledge_entities` (type: market, properties에 ticker/market 포함)
- 매매 패턴 → `knowledge_insights` (type: pattern, "X 종목 N번 분할매수" 등)
- 종목-전략 관계 → `knowledge_relations` (predicate: employs_strategy)

**전략**: 직접 매핑. 매매 기록은 구조화되어 있으므로 Claude CLI 불필요.

**처리 단위**: 종목별 집계 (ticker 기준, 최신 거래일 비교)

### 4. Stock Research → Knowledge Graph

**입력**: `stock_research`

**추출 대상**:
- 리서치 대상 종목 → `knowledge_entities` (type: market)
- 리서치 요약/결론 → `knowledge_insights` (type: observation)
- 종목 간 관계 (같은 섹터 등) → `knowledge_relations`

**전략**: Claude CLI로 리서치 내용 요약 및 인사이트 추출.

**처리 단위**: 개별 리서치 (id 기준)

## Tracking & Deduplication

### knowledge_distill_log 테이블

```sql
CREATE TABLE knowledge_distill_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL,          -- 'email' | 'telegram' | 'trade' | 'research'
  source_id TEXT NOT NULL,            -- gmail_message_id | 'chat:{chat_id}' | ticker | research.id
  source_updated_at TIMESTAMPTZ,      -- 소스의 updated_at (텔레그램 재처리 판단용)
  entities_created INTEGER DEFAULT 0,
  relations_created INTEGER DEFAULT 0,
  insights_created INTEGER DEFAULT 0,
  distilled_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(source_type, source_id)
);

CREATE INDEX idx_distill_log_source ON knowledge_distill_log(source_type, source_id);
```

**중복 방지 로직**:
- 이메일: `source_id = gmail_message_id`. 이미 존재하면 스킵.
- 텔레그램: `source_id = 'chat:{chat_id}'`. `source_updated_at`과 conversation의 `updated_at` 비교. 변경된 경우에만 재처리.
- 매매: `source_id = ticker`. 최신 거래일이 변경된 경우에만 재처리.
- 리서치: `source_id = research.id`. 이미 존재하면 스킵.

**Entity 중복 방지**: `knowledge_entities.name`이 UNIQUE이므로, upsert (있으면 properties/tags 병합, 없으면 생성).

## Claude CLI Integration

텔레그램 대화와 리서치 분석에만 Claude CLI를 사용한다.

**호출 방식**: 프롬프트를 임시 파일에 쓰고 stdin으로 파이프한다 (shell escaping 문제 방지).
```typescript
import { execSync } from 'child_process'
import { writeFileSync, unlinkSync } from 'fs'

const tmpPath = '/tmp/knowledge-distill-prompt.txt'
writeFileSync(tmpPath, prompt)
const result = execSync(
  `cat ${tmpPath} | claude -p --output-format json`,
  { encoding: 'utf-8', timeout: 60_000 }
)
unlinkSync(tmpPath)
```

**출력 포맷 (JSON)**:
```json
{
  "entities": [
    { "name": "...", "type": "person|company|market|...", "description": "..." }
  ],
  "relations": [
    { "subject": "entity_name", "predicate": "...", "object": "entity_name" }
  ],
  "insights": [
    { "content": "...", "type": "decision|observation|pattern", "context": "..." }
  ]
}
```

## Scheduling

- **실행 주기**: 매일 06:00 (launchd)
- **Plist 파일**: `~/Library/LaunchAgents/com.willow.knowledge-distill.plist`
- **실행 명령**: `npx tsx scripts/knowledge-distill.ts`
- **로그**: `scripts/logs/knowledge-distill.log`
- **타임아웃**: 전체 10분 (개별 Claude CLI 호출 60초)

## Processing Order & Error Handling

1. 이메일 처리 (Claude CLI 불필요, 빠름)
2. 매매 기록 처리 (Claude CLI 불필요, 빠름)
3. 리서치 처리 (Claude CLI 사용)
4. 텔레그램 대화 처리 (Claude CLI 사용)

**에러 처리**:
- 개별 소스 실패 시 로그 남기고 다음 소스로 진행 (전체 중단 없음)
- Claude CLI 호출 실패 시 해당 항목 스킵, 다음 실행에서 재시도
- 전체 실행 결과를 로그 파일에 요약 출력

## File Structure

```
scripts/
  knowledge-distill.ts          # 메인 스크립트
  logs/
    knowledge-distill.log       # 실행 로그

~/Library/LaunchAgents/
  com.willow.knowledge-distill.plist  # launchd 스케줄

supabase/
  migrations/
    YYYYMMDD_knowledge_distill_log.sql  # 트래킹 테이블
```

## Success Criteria

- 이메일 분석 결과의 인물/기업/종목이 Knowledge Graph에 자동 등록
- 텔레그램 CEO 대화에서 결정사항/관찰이 인사이트로 기록
- 매매 종목이 엔티티로 등록되고 매매 패턴이 인사이트로 기록
- 리서치 요약이 인사이트로 기록
- 중복 처리 없음 (distill_log 기반)
- 매일 자동 실행, 실패 시 다음 날 재시도
