# Willy (윌리) - 텔레그램 봇

Willow Investment COO 에이전트. CEO와 텔레그램으로 소통하며 일정, 뉴스, 시장 모니터링, 업무 관리를 수행한다.

## 파일 구조

| 파일 | 용도 |
|------|------|
| `scripts/telegram-bot.ts` | 메인 봇 코드 (~3,300줄) |
| `scripts/run-telegram-bot.sh` | 래퍼 스크립트 (볼륨 체크, 자동 재시작) |
| `scripts/com.willow.telegram-bot.plist` | launchd 서비스 정의 |
| `scripts/logs/telegram-bot.lock` | 프로세스 락 (PID) |
| `scripts/logs/telegram-bot.offset` | Telegram update offset |
| `scripts/logs/telegram-bot.log` | 봇 로그 |
| `scripts/logs/tmp/` | 임시 음성/사진 파일 |

## 운영

### 실행

```bash
# 포그라운드
./scripts/run-telegram-bot.sh

# 백그라운드 (데몬)
./scripts/run-telegram-bot.sh --daemon
```

### launchd 서비스

```bash
# 등록 & 시작
launchctl load ~/Library/LaunchAgents/com.willow.telegram-bot.plist

# 시작/정지
launchctl start com.willow.telegram-bot
launchctl stop com.willow.telegram-bot

# 등록 해제
launchctl unload ~/Library/LaunchAgents/com.willow.telegram-bot.plist
```

launchd 설정:
- 로그인 시 자동 시작 (`RunAtLoad`)
- 비정상 종료 시 자동 재시작 (`KeepAlive.SuccessfulExit: false`)
- 외장하드 마운트 상태 감시 (`PathState`)
- 재시작 쿨다운 60초 (`ThrottleInterval`)

### 로그

```bash
tail -f scripts/logs/telegram-bot.log
```

### 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `TELEGRAM_BOT_TOKEN` | O | 텔레그램 봇 API 토큰 |
| `NEXT_PUBLIC_SUPABASE_URL` | O | Supabase URL |
| `SUPABASE_SECRET_KEY` | O | Supabase service_role 키 |
| `GITHUB_TOKEN` | | 위클리 브리핑 커밋 조회용 |

모든 변수는 `.env.local`에서 로드한다.

## 아키텍처

### 메시지 처리 파이프라인

```
Telegram getUpdates (30초 long-polling)
    |
    v
중복 감지 (update_id, 5분 만료)
    |
    v
메시지 타입 분기
    ├── 텍스트
    ├── 음성 → Whisper 전사 (python3, base 모델, ko)
    ├── 사진 → Claude Code 이미지 분석
    └── 버튼 콜백
    |
    v
메시지 배칭 (5초 debounce)
    |
    v
이전 처리 중단 (AbortController)
    |
    v
컨텍스트 수집 (병렬)
    ├── 대시보드      ├── 지식그래프
    ├── 위키          ├── 팔로업
    ├── 텐소프트웍스    ├── 뉴스/동영상
    ├── 프롬프트섹션    ├── 속성카탈로그
    └── 대화이력
    |
    v
시스템 프롬프트 빌드 (고정 ~2,100줄 + 동적 섹션)
    |
    v
Claude CLI 호출 (claude -p --output-format text, --dangerously-skip-permissions)
    |
    v
액션 추출 & 실행 (```action JSON 블록)
    |
    v
응답 전송 (Markdown → 실패 시 plain text, 4096자 분할)
    |
    v
대화이력 저장 (Supabase, MAX_HISTORY=20)
```

### 핵심 메커니즘

**Polling**: 1.5초 간격으로 `getUpdates` 호출 (30초 타임아웃).

**Lock 파일**: `telegram-bot.lock`에 PID 기록. 시작 시 기존 PID 생존 여부 확인, stale lock 자동 정리.

**Offset 파일**: `telegram-bot.offset`에 마지막 처리한 update_id 저장. 재시작 시 중복 처리 방지.

**메시지 배칭**: 5초 debounce로 빠른 연속 메시지를 합쳐서 한 번에 Claude에 전달.

**AbortController**: 새 메시지 도착 시 진행 중인 Claude 호출을 취소하고, 이전 메시지 + 새 메시지를 합쳐서 재처리.

**래퍼 스크립트**: 외장하드 마운트 확인 (최대 60초 대기) → 의존성 체크 → 크래시 시 자동 재시작 (최대 10회, 30초 쿨다운).

## 프로액티브 기능

| 기능 | 시간/주기 | 설명 |
|------|----------|------|
| 모닝 브리핑 | 08:00-09:00 | 일정, 마일스톤, 재무 요약 |
| 위클리 브리핑 | 월요일 10:30 | GitHub 커밋, 태스크 로그, 주간보고 분석 |
| 자율 체크 | 30분 간격 | 데이터 해시 비교, 이슈 감지 시 알림 |
| 시장 모니터링 | 5분 간격 | US/KR 시장 개장/폐장 감지, 포트폴리오 브리핑 |
| 속보 알림 | 20분 간격 | 주요 미디어 속보 + 시장 데이터 |
| 뉴스 다이제스트 | 9시, 12시, 15시, 18시 | 감시 주제별 뉴스/유튜브 큐레이션 |

## 액션 시스템

Claude 응답 내 ` ```action ` JSON 블록을 파싱하여 실행한다.

### 지원 액션

| 카테고리 | 액션 |
|---------|------|
| 일정/업무 | `create_schedule`, `create_wiki`, `create_task` |
| 뉴스 감시 | `watch_topic`, `unwatch_topic`, `search_news` |
| 지식그래프 | `knowledge_entity`, `knowledge_relation`, `knowledge_insight`, `discover_attribute` |
| 프롬프트 관리 | `update_prompt`, `view_prompt_sections` |
| 텐소프트웍스 | `tensw_create_task`, `tensw_change_status`, `tensw_create_schedule` |
| 팔로업 | `create_follow_up`, `resolve_follow_up` |
| 파일 | `send_file` |
| UI | ` ```buttons [["텍스트", "콜백"]] ``` ` |

## 프롬프트 시스템

### 고정 프롬프트

약 2,100줄. 역할 정의, 대화 스타일, 시간 인식, 회사 구조, 액션 문법 등을 포함한다.

### 동적 섹션

Supabase `knowledge_prompt_sections` 테이블에서 로드. 기본 섹션:
- `strategic_advice` - 전략 조언
- `communication_style` - 소통 스타일
- `knowledge_extraction` - 지식 추출
- `risk_assessment` - 리스크 평가
- `self_improvement` - 자기 개선

`update_prompt` 액션으로 섹션을 수정할 수 있으며, 버전 히스토리가 `agent_prompt_history`에 기록된다.

### 속성 카탈로그

3단계 구조:
1. **fixed** - 코드에 하드코딩된 필수 속성
2. **standard** - DB 정의 표준 속성
3. **agent-discovered** - 에이전트가 `discover_attribute` 액션으로 자율 등록한 속성

## 외부 연동

| 시스템 | 용도 | 방식 |
|--------|------|------|
| Telegram Bot API | 메시지 송수신, 파일 전송 | REST (sendMessage, getUpdates, getFile, sendDocument) |
| Supabase | 대화이력, 일정, 위키, 지식그래프 등 | supabase-js |
| Claude CLI | AI 처리 | `claude -p --output-format text` subprocess |
| MCP Tools | tensw-todo, portfolio-monitor | Claude CLI MCP 연동 |
| Google News RSS | 뉴스 검색 | RSS 파싱 |
| YouTube (Invidious) | 동영상 검색 | 다중 인스턴스 폴백 |
| yfinance | 시장 가격 (WTI, Brent, S&P500, KOSPI, USD/KRW) | python3 subprocess |
| Whisper | 음성 전사 | python3 subprocess (base 모델, ko) |

## 주요 상수

| 상수 | 값 | 설명 |
|------|-----|------|
| `MAX_HISTORY` | 20 | 대화 기록 최대 건수 |
| `POLL_INTERVAL` | 1,500ms | 폴링 주기 |
| `MESSAGE_BATCH_DELAY` | 5,000ms | 메시지 배칭 딜레이 |
| `PROACTIVE_CHECK_INTERVAL` | 30분 | 자율 체크 주기 |
| `MARKET_CHECK_INTERVAL` | 5분 | 시장 상태 확인 주기 |
| `BREAKING_CHECK_INTERVAL` | 20분 | 속보 확인 주기 |
| `NEWS_DIGEST_INTERVAL` | 2시간 | 뉴스 다이제스트 최소 간격 |
| `SENT_NEWS_RETENTION_MS` | 8시간 | 보낸 뉴스 중복 방지 유지 시간 |
| `TOPIC_COOLDOWN_MS` | 4시간 | 주제별 속보 쿨다운 |
| `TENSW_CACHE_TTL` | 10분 | 텐소프트웍스 캐시 TTL |

## Supabase 테이블

| 테이블 | 용도 |
|--------|------|
| `telegram_conversations` | 대화 기록 (chat_id 키) |
| `telegram_watch_topics` | 뉴스 감시 주제 |
| `willow_mgmt_*` | 일정, 태스크, 인보이스, 마일스톤 |
| `tensw_*` | 텐소프트웍스 프로젝트 관리 |
| `work_wiki` | 업무 위키 |
| `knowledge_*` | 지식그래프 (entities, relations, insights, attribute_catalog, prompt_sections) |
| `agent_follow_ups` | 팔로업 트리거 |
| `agent_prompt_history` | 프롬프트 버전 히스토리 |

## 에러 처리

| 상황 | 처리 |
|------|------|
| 마크다운 파싱 실패 | plain text로 폴백 전송 |
| 4096자 초과 | 줄바꿈 기준 분할, 1.5초 간격 전송 |
| Claude CLI 실패 | exit code 체크, stderr 캡처 |
| 음성/사진 임시파일 | 처리 후 삭제 (에러 시에도 finally 삭제) |
| Supabase 액션 실패 | 사용자 친화적 에러 메시지 + 콘솔 로그 |
| 프로세스 중복 실행 | lock file PID 확인, stale lock 자동 정리 |
