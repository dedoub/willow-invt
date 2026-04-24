# 류하일정 Linear 페이지 디자인

## 목표

기존 `/others/ryuha-study` 페이지(4600줄 단일 파일, Tailwind/shadcn)를 Linear 디자인 시스템으로 전면 재구현하여 `/willow-investment/(linear)/ryuha`에 배치한다. 기능은 1:1 유지하되, 드래그앤드롭 제거 및 Tiptap→플레인텍스트 전환으로 단순화한다.

## 결정 사항

| 항목 | 결정 |
|------|------|
| 범위 | 전체 기능 1:1 재구현 |
| 레이아웃 | 한 페이지, 수직 스크롤 |
| 캘린더 뷰 | 주간 + 월간 둘 다 |
| 드래그앤드롭 | 제거 (편집 다이얼로그로 대체) |
| 메모 | 캘린더 아래 "오늘의 메모" 영역 |
| 수첩 | 위키와 동일한 2열 패널 (목록 | 상세) |
| 성장기록 차트 | 커스텀 SVG (recharts 미사용) |
| 리치 에디터 | 제거, 플레인 텍스트 textarea |

## 라우팅

- 신규: `/willow-investment/(linear)/ryuha/page.tsx`
- 사이드바: `linear-sidebar.tsx`의 류하일정 링크를 `/willow-investment/ryuha`로 변경
- 기존 `/others/ryuha-study`는 유지 (별도 제거 시점)

## 페이지 구조

```
┌─────────────────────────────────────────────────┐
│ 류하일정 (h1) + 부제                              │
├─────────────────────────────────────────────────┤
│ 캘린더 블록 (calendar-block.tsx)                  │
│  ┌─ 주간/월간 토글, ← 이전/다음 → 네비게이션      │
│  └─ 7열 그리드 (주간) 또는 7×5 그리드 (월간)       │
├─────────────────────────────────────────────────┤
│ 오늘의 메모 (daily-memo.tsx)                      │
│  └─ 선택된 날짜의 메모, textarea 인라인 편집       │
├─────────────────────────────────────────────────┤
│ 교재/단원 관리 (2열 그리드)                        │
│  ┌─────────────────┬───────────────────────┐    │
│  │ textbook-block   │ progress-block        │    │
│  │ 과목 필터        │ 과목별 진행률 바       │    │
│  │ 교재 → 단원 목록 │ 마감 임박/지연 경고    │    │
│  └─────────────────┴───────────────────────┘    │
├─────────────────────────────────────────────────┤
│ 류하 수첩 (notebook-block.tsx)                    │
│  ┌─────────────────┬───────────────────────┐    │
│  │ 노트 목록        │ 노트 상세/편집         │    │
│  │ 검색, 핀, 페이징 │ 플레인텍스트+파일첨부   │    │
│  └─────────────────┴───────────────────────┘    │
├─────────────────────────────────────────────────┤
│ 성장기록 (growth-block.tsx)                       │
│  ┌─────────────────┬───────────────────────┐    │
│  │ SVG 차트         │ 기록 테이블            │    │
│  │ 키/몸무게 라인   │ 추가/수정/삭제         │    │
│  └─────────────────┴───────────────────────┘    │
└─────────────────────────────────────────────────┘
```

## 컴포넌트 파일 구조

```
src/app/willow-investment/(linear)/ryuha/
├── page.tsx                    # 메인 페이지 (데이터 fetch, 블록 조립)
└── _components/
    ├── calendar-block.tsx      # 주간/월간 캘린더 + 일정 카드
    ├── schedule-dialog.tsx     # 일정 추가/편집 다이얼로그
    ├── daily-memo.tsx          # 선택 날짜 메모 인라인 편집
    ├── textbook-block.tsx      # 교재/단원 관리 (과목 필터, 접기/펼치기)
    ├── textbook-dialog.tsx     # 교재 추가/편집 다이얼로그
    ├── chapter-dialog.tsx      # 단원 추가/편집 다이얼로그
    ├── subject-dialog.tsx      # 과목 관리 다이얼로그
    ├── progress-block.tsx      # 진도 요약 (진행률 바, 경고)
    ├── notebook-block.tsx      # 류하 수첩 (2열 패널)
    └── growth-block.tsx        # 성장기록 (SVG 차트 + 테이블)
```

## 블록별 상세

### 1. calendar-block.tsx

**헤더:**
- LSectionHead: eyebrow="CALENDAR", title="일정"
- 액션: 주간/월간 토글 버튼 + 일정 추가 버튼
- 네비게이션: ← 이전 | "2026년 4월 3주차" 또는 "2026년 4월" | 다음 →

**주간 뷰 (기본):**
- 7열 CSS 그리드
- 각 열 헤더: 요일(월~일) + 날짜
- 오늘 날짜 강조 (brand 색상 원형 배경)
- 셀 내용: 일정 카드 수직 나열
- 빈 셀 클릭 → 해당 날짜로 schedule-dialog 열기

**월간 뷰:**
- 7×5(~6) CSS 그리드
- 각 셀: 날짜 숫자 + 축약된 일정 (제목만, 최대 3개 + "+N more")
- 셀 클릭 → 해당 날짜의 주간 뷰로 전환

**일정 카드:**
- 과목 색상 좌측 보더 (3px solid)
- 완료 토글: 체크/언체크 아이콘 (클릭 시 API 호출)
- 멀티데이: completed_dates 배열로 날짜별 추적
- 제목 + 시간(있으면) + 연결 단원(있으면) + 숙제 상태(있으면)
- 완료 시: 취소선 + 흐린 색상
- 카드 클릭 → schedule-dialog로 편집

**모바일:**
- 주간 뷰: 3열 그리드 (3일씩, 스와이프 또는 좌우 네비게이션)
- 월간 뷰: 7열 유지, 셀 축소 (날짜+점 표시만)

### 2. schedule-dialog.tsx

기존 scheduleDialogOpen의 기능을 Linear 스타일 다이얼로그로 구현.

**필드:**
- 제목 (필수)
- 날짜 (필수), 종료일 (선택, 멀티데이)
- 시작/종료 시간 (선택)
- 유형: homework | self_study
- 과목/교재/단원 연결 (다중 선택 가능)
- 색상 선택 (과목 색상 우선, 커스텀 가능)
- 설명 (textarea)
- 이메일 리마인더 체크박스
- 숙제 항목 (동적 추가/삭제): 내용 + 마감일 + 완료 토글

**모드:** 추가 / 편집 (편집 시 삭제 버튼 포함)

### 3. daily-memo.tsx

- LCard 안에 LSectionHead eyebrow="MEMO", title="오늘의 메모" (선택된 날짜 표시)
- textarea로 메모 내용 표시/편집
- 저장 버튼 (또는 blur 시 자동저장)
- 메모가 없으면 "메모를 작성하세요" 플레이스홀더
- API: GET/PUT `/api/ryuha/memos` (upsert by date)

### 4. textbook-block.tsx

**과목 필터:** 상단에 과목별 필터 배지 (과목 색상 적용)

**교재 목록:**
- LCard 안에 교재별 행
- 교재 행: 과목 색상 좌측 보더, 교재명, 출판사, 단원 수, 진행률
- 클릭 → 접기/펼치기로 단원 목록 표시

**단원 목록 (펼쳤을 때):**
- 각 단원: 상태 배지 (대기/진행중/리뷰대기/완료), 이름, 목표일
- 상태 변경: 클릭 시 사이클 (pending → in_progress → review_notes_pending → completed)
- 인라인 단원 추가 (하단 + 버튼)

**액션 버튼:** 과목 관리, 교재 추가

### 5. progress-block.tsx

- LCard, LSectionHead eyebrow="PROGRESS", title="진도 현황"
- 과목별 진행률 바 (완료 단원 / 전체 단원)
- 바 색상: 과목 색상
- 마감 임박 단원 목록 (7일 이내)
- 지연 단원 목록 (목표일 초과)

### 6. notebook-block.tsx

업무위키(wiki-list.tsx)와 동일한 패턴.

**왼쪽 패널 (목록):**
- 검색 입력
- 노트 리스트: 핀 고정 노트 상단, 제목 + 날짜 + 미리보기
- 페이지네이션 (localStorage 페이지 사이즈)
- 추가 버튼

**오른쪽 패널 (상세):**
- 선택된 노트 표시
- 편집 모드: 제목 input + 내용 textarea + 파일 첨부
- 파일 첨부: `/api/wiki/upload` (wiki-attachments 버킷 공유)
- 핀 토글, 삭제 기능

**모바일:** 목록 또는 상세 단일 뷰 전환 (← 목록으로 버튼)

### 7. growth-block.tsx

**2열 그리드:** 차트 | 기록 테이블

**SVG 차트:**
- 커스텀 인라인 SVG 라인 차트
- 2개 라인: 키(cm, 인디고), 몸무게(kg, 오렌지)
- X축: 날짜, Y축: 수치
- 호버 시 값 표시 (CSS tooltip)

**기록 테이블:**
- 날짜 | 키 | 몸무게 | 메모
- 행 클릭 → 편집 다이얼로그
- 추가 버튼
- 다이얼로그: 날짜, 키, 몸무게, 메모 입력

**모바일:** 차트 → 테이블 수직 스택

## 데이터 흐름

**page.tsx에서 일괄 fetch:**
```
Promise.all([
  /api/ryuha/subjects
  /api/ryuha/textbooks (chapters 포함)
  /api/ryuha/schedules (날짜 범위)
  /api/ryuha/memos (날짜 범위)
  /api/ryuha/notes
  /api/ryuha/body-records
])
```

**변경 시:** 각 블록에서 CRUD 후 `onDataChanged` 콜백 → page.tsx에서 전체 리로드

## 스타일 규칙

- Linear 디자인 토큰 (`t`) 사용, Tailwind 클래스 미사용
- LCard, LSectionHead, LIcon 등 공유 컴포넌트 활용
- 인라인 스타일만 사용
- useIsMobile(768) 훅으로 반응형 처리
- 색상으로 구분 (border/shadow 미사용)

## 기존 코드 재사용

- 타입: `src/types/ryuha.ts` 그대로 사용
- API: `src/app/api/ryuha/*` 그대로 사용
- MCP: `src/lib/mcp/tools/ryuha.ts` 변경 없음
- 새로 만드는 것: page.tsx + _components/ 10개 파일

## 범위 밖

- 기존 `/others/ryuha-study` 페이지 삭제 (별도 작업)
- API 엔드포인트 변경 없음
- DB 스키마 변경 없음
- MCP 도구 변경 없음
