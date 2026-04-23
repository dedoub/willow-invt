# 텐소프트웍스 통합 페이지 설계

## 목표

기존 텐소프트웍스의 프로젝트 페이지(`/tensoftworks/projects`)와 경영관리 페이지(`/tensoftworks/management`)를 Linear 디자인 시스템으로 통합한 단일 페이지를 구축한다.

## 라우트

- **경로**: `/willow-investment/tensw`
- **파일**: `src/app/willow-investment/(linear)/tensw/page.tsx`
- **컴포넌트**: `src/app/willow-investment/(linear)/tensw/_components/`

## 페이지 레이아웃

```
┌─────────────────────────────────────────┐
│ 텐소프트웍스                              │
│ 프로젝트 · 일정 · 경영관리 · 위키 · 이메일   │
├─────────────────────────────────────────┤
│ [프로젝트 리스트]            (full width)  │
├─────────────────────────────────────────┤
│ [일정 캘린더]                (full width)  │
├──────────────────────┬──────────────────┤
│ [현금관리]             │ [차입금관리]      │
│ [매출관리/세금계산서]    │                  │
│         2fr          │      1fr         │
├──────────────────────┬──────────────────┤
│ [위키]                │ [이메일]          │
│         2fr          │      1fr         │
└──────────────────────┴──────────────────┘
```

모바일에서는 모든 2-column 그리드가 1-column 스택으로 변환된다.

## 섹션별 설계

### 1. 프로젝트 리스트 (ProjectBlock)

**데이터**: `/api/tensoftworks` → `tensw_projects` 테이블 (개발 프로젝트 현황)

간단한 리스트 형태로 프로젝트 이름, 상태, 할일 진행률을 보여준다. 기존의 풍부한 카드 UI를 테이블/리스트로 단순화.

| 열 | 내용 |
|---|---|
| 아이콘 | 프로젝트 아이콘 (LIcon 매핑) |
| 프로젝트명 | 이름 + 설명 (truncate) |
| 상태 | active/managed/closed/poc 배지 |
| 진행률 | completed / total 비율 바 또는 퍼센트 |
| AI 완성도 | AI progress score (있으면 표시) |

- 상태별 필터 배지 (전체, 진행, 관리, 종료, POC)
- 클릭 시 외부 tensw-todo 사이트(`https://tensw-todo.vercel.app/projects/{slug}`)로 이동
- 페이지네이션 (기본 10개씩, localStorage 저장)

### 2. 일정 캘린더 (ScheduleBlock)

**데이터**: `/api/tensw-mgmt/schedules`, `/api/tensw-mgmt/clients`

Willow mgmt의 `ScheduleBlock`과 동일한 패턴으로 구현:
- 주간/월간 뷰 토글
- 드래그앤드롭 없음
- 클릭으로 일정 상세 / 추가 다이얼로그 열기
- 일정별 클라이언트 색상 표시
- 완료 토글 (체크박스)

**차이점 (Willow mgmt vs Tensw)**:
- Tensw 일정은 `milestone_ids` (복수 마일스톤 연결) 지원
- Tensw 일정에는 `tasks` (하위 태스크 목록) 있음
- Tensw는 클라이언트(`tensw_mgmt_clients`)별 색상 구분
- 일정 타입: task / meeting / deadline

**다이얼로그**:
- `AddScheduleDialog`: 일정 생성/편집 (제목, 날짜, 시간, 타입, 클라이언트 선택, 설명)
- `ScheduleDetailDialog`: 일정 상세 보기 (편집/삭제 버튼)

### 3. 현금관리 (CashBlock)

**데이터**: `/api/tensw-mgmt/invoices` → `tensw_mgmt_cash` 테이블

Willow mgmt의 `CashBlock`과 동일한 패턴:
- 상단 요약 통계 (매출/비용/자산/부채 합계, LStat 사용)
- 기간 필터 (월/분기/연)
- 타입 필터 배지 (전체/매출/비용/자산/부채)
- 거래 목록 (2줄 행: 거래처 + 금액, 날짜 + 설명)
- 클릭 시 상세 다이얼로그
- 추가 버튼

**다이얼로그**:
- `CashDialog`: 현금 거래 생성/편집/삭제
- `CashDetailDialog`: 상세 보기

### 4. 매출관리/세금계산서 (SalesBlock)

**데이터**: `/api/tensw-mgmt/tax-invoices` → `tensw_mgmt_sales` 테이블

Akros 세금계산서 블록과 유사한 패턴:
- 행 레이아웃: 상태 배지 + 발행일 | 거래처 + 금액
- 상태: pending → issued → completed
- 연도 필터
- 상태 필터 배지
- 합계 통계 (공급가액/세액/합계)
- 추가/편집 다이얼로그

**다이얼로그**:
- `SalesDialog`: 세금계산서 생성/편집/삭제 (발행일, 거래처, 공급가액, 세액, 항목 목록, 비고)

### 5. 차입금관리 (LoanBlock)

**데이터**: `/api/tensw-mgmt/loans` → `tensw_mgmt_loans` 테이블

간결한 리스트:
- 행 레이아웃: 대출기관 + 대출유형 | 원금 + 이율 + 만기일
- 상태 필터 (active/completed)
- 합계 통계 (총 원금)
- 추가/편집 다이얼로그

**다이얼로그**:
- `LoanDialog`: 차입금 생성/편집/삭제

### 6. 위키 (TenswWikiBlock)

**데이터**: `/api/wiki?section=tensw-mgmt`

Akros/ETC 위키 블록과 동일한 래퍼 패턴:
- 공유 `WikiList` 컴포넌트를 `section='tensw-mgmt'`로 필터
- 생성 시 자동으로 `section: 'tensw-mgmt'` 설정

### 7. 이메일 (EmailBlock)

**데이터**: Gmail API (`context=tensoftworks`, `label=TENSW`)

공유 `EmailBlock` 컴포넌트 재사용 (mgmt 페이지에서 이미 사용 중):
- 이메일 목록 (30일, 최근 50건)
- 클릭 시 `EmailDetailDialog`
- 답장/전달 → `ComposeEmailDialog`

## 공유 컴포넌트 재사용

| 컴포넌트 | 원본 위치 | 재사용 방식 |
|---------|---------|-----------|
| `EmailBlock` | `mgmt/_components/email-block.tsx` | 그대로 import |
| `EmailDetailDialog` | `mgmt/_components/email-detail-dialog.tsx` | 그대로 import |
| `ComposeEmailDialog` | `mgmt/_components/compose-email-dialog.tsx` | 그대로 import |
| `WikiList` | `wiki/_components/wiki-list.tsx` | 래퍼에서 section 필터 |

## 새로 만들 파일

```
src/app/willow-investment/(linear)/tensw/
├── page.tsx                          # 메인 페이지 (데이터 로딩, 블록 조립)
└── _components/
    ├── project-block.tsx             # 프로젝트 리스트
    ├── schedule-block.tsx            # 일정 캘린더 (주간/월간)
    ├── add-schedule-dialog.tsx       # 일정 추가/편집 다이얼로그
    ├── schedule-detail-dialog.tsx    # 일정 상세 다이얼로그
    ├── cash-block.tsx                # 현금관리 블록
    ├── cash-dialog.tsx               # 현금 추가/편집 다이얼로그
    ├── sales-block.tsx               # 매출관리/세금계산서 블록
    ├── sales-dialog.tsx              # 세금계산서 다이얼로그
    ├── loan-block.tsx                # 차입금관리 블록
    ├── loan-dialog.tsx               # 차입금 다이얼로그
    └── wiki-block.tsx                # 위키 래퍼
```

## API 의존성

모든 API는 이미 존재한다. 새 API 엔드포인트 불필요.

| 기능 | 엔드포인트 | 메서드 |
|-----|----------|-------|
| 프로젝트 | `/api/tensoftworks` | GET |
| 일정 목록 | `/api/tensw-mgmt/schedules` | GET |
| 일정 CRUD | `/api/tensw-mgmt/schedules` | POST/PUT/DELETE |
| 일정 날짜 토글 | `/api/tensw-mgmt/schedules/toggle-date` | POST |
| 클라이언트 | `/api/tensw-mgmt/clients` | GET |
| 현금 목록 | `/api/tensw-mgmt/invoices` | GET |
| 현금 CRUD | `/api/tensw-mgmt/invoices` | POST/PUT/DELETE |
| 세금계산서 | `/api/tensw-mgmt/tax-invoices` | GET/POST/PUT/DELETE |
| 차입금 | `/api/tensw-mgmt/loans` | GET/POST/PUT/DELETE |
| 위키 | `/api/wiki` | GET/POST/PUT/DELETE |
| 이메일 | `/api/gmail/emails`, `/api/gmail/status` | GET |

## 사이드바 연결

`linear-sidebar.tsx`의 CLIENTS 배열에서 `tensw` 항목에 href 추가:
```tsx
const href = c.id === 'akros' ? '/willow-investment/akros'
  : c.id === 'etc' ? '/willow-investment/etc'
  : c.id === 'tensw' ? '/willow-investment/tensw'
  : undefined
```

## 스켈레톤

`linear-skeleton.tsx`에 `TenswSkeleton` 추가:
- Row 1: 프로젝트 리스트 골격 (LCard + Bone 행 5개)
- Row 2: 캘린더 골격 (LCard + 7-column grid)
- Row 3: 2fr+1fr grid (현금/매출 + 차입금)
- Row 4: 2fr+1fr grid (위키 + 이메일)

## 타입

기존 `TenswMgmtClient`, `TenswMgmtSchedule`, `TenswMgmtTask` 등은 `@/types/tensw-mgmt`에서 import.

세금계산서와 차입금 타입은 경영관리 페이지에서 인라인으로 정의되어 있으므로, 필요 시 타입을 tensw-mgmt.ts에 추가:

```typescript
export interface TenswTaxInvoice {
  id: string
  invoice_date: string
  company: string
  description: string | null
  supply_amount: number
  tax_amount: number
  total_amount: number
  status: 'pending' | 'issued' | 'completed'
  items: Array<{ description: string; quantity: number; unit_price: number; supply_amount: number; tax_amount: number }>
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TenswLoan {
  id: string
  lender: string
  loan_type: string
  principal: number
  interest_rate: number
  start_date: string
  end_date: string | null
  repayment_type: string
  interest_payment_day: number | null
  status: 'active' | 'completed'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface TenswCashItem {
  id: string
  type: 'revenue' | 'expense' | 'asset' | 'liability'
  counterparty: string
  description: string | null
  amount: number
  issue_date: string | null
  payment_date: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}
```

## 디자인 원칙

- Linear 디자인 토큰 (`t.*`) 사용
- `LCard`, `LSectionHead`, `LBtn`, `LIcon`, `LStat` 프리미티브 활용
- 테두리/그림자 없이 배경색 계층으로 구분
- 다이얼로그는 Linear 스타일 (position: fixed 오버레이, t.neutrals.card 배경)
- 금액 포맷: 원화는 `toLocaleString()` + '원', 숫자는 천 단위 콤마
- 페이지네이션은 ETC/Akros 패턴 (개씩 입력 + chevron 네비게이션)
