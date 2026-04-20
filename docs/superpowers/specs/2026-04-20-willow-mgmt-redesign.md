# 윌로우 사업관리 3페이지 분리 + Linear 디자인 적용

## 목표

현재 `/willow-investment/management` (8,367줄 단일 페이지)를 3개 페이지로 분리하면서 **Linear 디자인 시스템**을 전면 적용한다.

기존 management 페이지는 그대로 유지하고, 새 페이지를 별도 라우트에 구축한다.

## 새 디자인 시스템 (Linear variant)

기존 CLAUDE.md 디자인 시스템을 대체한다. `tokens.jsx`의 `balanced` variant 기반.

### 토큰

```
Font:    Inter Tight (sans) / JetBrains Mono (mono)
Weight:  regular 420, medium 520, semibold 620, bold 720

Page:    #FAFAFA
Card:    #FFFFFF
Inner:   #F6F6F7
Line:    rgba(15,15,20,0.07)
Text:    #0E0F12
Muted:   #5B5E66
Subtle:  #9398A0

Brand:   #2183B4 (500), #166A97 (600), #125577 (700)
Accent:  pos #107A52, neg #C23A3A, warn #B8781F

Radius:  sm 4px, md 6px, lg 8px
Density: rowH 34px, cardPad 14px, gap 6/10/16px

Badge:   radius 4px, weight 520, padX 7px, padY 2px, size 11px
Eyebrow: mono, uppercase, letter-spacing 1.2, 10.5px, subtle color
```

### 레이아웃 패턴

- **사이드바**: 232px 고정, light mode (#FAFAFA bg, hairline right border)
- **헤더**: 52px 고정, breadcrumb + actions
- **카드**: white bg, lg radius, no shadow, hairline border (선택적)
- **SectionHead**: eyebrow (mono uppercase) + title + action 우측 정렬
- **테이블**: hairline 구분선, tabular-nums, mono 날짜/숫자

### 사이드바 네비게이션

```
WILLOW
  ├── 사업관리    (briefcase icon)
  ├── 투자관리    (trending icon)
  └── 업무 위키   (book icon)

CLIENTS
  ├── 아크로스자산운용  ETF  #3F93C6
  ├── 텐소프트웍스     SI   #B88A2A
  ├── 모노알          App  #2F8F5B
  └── 류하학원        EDU  #8B5CF6
```

## 페이지 1: 사업관리 (`/willow-investment/mgmt`)

참고 디자인: `mgmt-v2.jsx`

### 구성

사이드바 + 헤더 + 본문 3블록 + 우측 에이전트 채팅 패널(38%, 토글)

### Block 1: 일정 (Schedule)

- 주간/월간 뷰 토글
- 7컬럼 주간 캘린더 그리드 (inner bg, 각 셀 min-height 128px)
- 오늘 강조 (brand[50] bg, brand[700] 텍스트)
- 이벤트 칩: tone별 배경색 (brand/info/warn/done/neutral)
- 좁은 화면: 리스트 뷰 fallback
- 데이터: 기존 `/api/willow-mgmt/schedules` API 사용

### Block 2: 현금관리 (Cashflow)

- KPI 3개 카드 (수입/지출/미수금)
- 은행 엑셀 드래그앤드롭 업로드 존 (dashed border, parsing 상태 표시)
- 최근 거래 테이블 (날짜/거래처/내용/금액/상태)
- 데이터: 기존 `/api/willow-mgmt/invoices` API 사용

### Block 3: 이메일 (read-only monitoring)

- 이메일 리스트 (발신자/제목/시간)
- 읽지 않은 메일 강조 (brand dot indicator)
- Gmail 연결 상태 표시
- 데이터: 기존 `/api/gmail/emails` API 사용

### 에이전트 채팅 패널

- 우측 38% 폭, 토글 가능 (헤더 Agent 버튼)
- 좁은 뷰포트(<1180px): 오버레이 모드
- 채팅 메시지에 artifact 인라인 (일정 등록 확인, 파싱 결과, 매칭 실패)
- 채팅 입력 + 추천 프롬프트 chips
- 컨텍스트 라벨: "사업관리 · 일정 · 현금 · 메일"

### 레이아웃

```
[Sidebar 232px] [Main] [Chat 38% toggle]

Main:
  Header (52px)
  ──────────────────────
  ScheduleBlock (전체 너비)
  ──────────────────────
  [CashBlock 1.5fr] [EmailBlock 1fr]  (grid 2컬럼)
```

## 페이지 2: 투자관리 (`/willow-investment/invest`)

참고 디자인: `invest.jsx`

### 구성

사이드바 + 헤더 + 4섹션 세로 나열 + 우측 에이전트 채팅 패널(38%, 토글)

### 상단 Jump Nav (sticky)

포트폴리오 / 매수매도 / 주식 리서치 / 부동산 리서치 — 클릭 시 해당 섹션 스크롤

### Section 1: 포트폴리오

- KPI 4개 카드 (총 평가액/원금/평가손익/실현손익)
- 자산배분 바 (국내주식/해외·ETF/현금 비율)
- 홀딩스 테이블 (종목/평균매입/수량/현재가/평가액/손익%/비중)
- 데이터: 기존 stock-trades API + portfolio 데이터

### Section 2: 매수매도

- 탭: 전체/매수/매도/계획 (각 카운트 표시)
- 거래 테이블 (날짜/타입 배지/종목명/수량/가격/메모·실현손익)
- 데이터: 기존 stock-trades API

### Section 3: 주식 리서치 칸반

- 5컬럼 (관심/리서치 중/매수 후보/보유/후추 관찰)
- 각 카드: 종목명, 티커, 메모, pin 표시
- 기존 `InvestmentKanban` 컴포넌트 로직 재사용
- 데이터: 기존 watchlist API

### Section 4: 부동산 리서치

- 단지 카드 그리드 (`auto-fill, minmax(220px, 1fr)`)
- 각 카드: 이미지 placeholder, 단지명, 지역, 실거래가, 변동률, 호가, 메모
- 기존 부동산 차트 데이터 유지
- 데이터: 기존 real-estate API

### 에이전트 채팅 패널

- 투자 전체 컨텍스트 (포트폴리오 + 주식 + 부동산)
- artifact: 포지션 카드, 부동산 요약 카드

## 페이지 3: 업무 위키 (`/willow-investment/wiki`)

### 구성

사이드바 + 헤더 + 타임라인 스타일 노트 목록

- 날짜순 기록 흐름 (에이전트가 자동 정리한 요약)
- 태그/주제별 필터
- 노트 상세 보기/편집
- 데이터: 기존 `/api/wiki?section=willow-mgmt` API 사용

## 파일 구조

```
src/app/willow-investment/
  mgmt/
    page.tsx              ← 새 사업관리
  invest/
    page.tsx              ← 새 투자관리
  wiki/
    page.tsx              ← 새 업무 위키
  _components/
    linear-tokens.ts      ← 디자인 토큰
    sidebar.tsx           ← 공유 사이드바
    header.tsx            ← 공유 헤더
    section-head.tsx      ← SectionHead 컴포넌트
    agent-chat.tsx        ← 에이전트 채팅 패널
    badge-linear.tsx      ← Linear 스타일 배지
    card-linear.tsx       ← Linear 스타일 카드
    btn-linear.tsx        ← Linear 스타일 버튼
    stat-kpi.tsx          ← KPI stat 컴포넌트
```

## 구현 순서

1. **사업관리** (`/mgmt`) — 공유 컴포넌트(사이드바, 헤더, 토큰) + 3블록
2. **투자관리** (`/invest`) — 4섹션 + jump nav + 채팅
3. **업무 위키** (`/wiki`) — 타임라인 + 필터

## 제외 사항

- 기존 management 페이지 수정 없음 (병행 운영)
- 다크 모드 (추후 별도)
- 모바일 뷰 (추후 별도)
- Phase 03 연결 액션 (AI 자동 추출/등록 — 현재 미사용 워크플로우)
