# 아크로스 프로젝트 페이지 설계

## 목적

아크로스자산운용 ETF 운용 현황과 업무를 한 곳에서 관리하는 프로젝트 페이지.
상단에 AUM 대시보드, 중단에 상품/세금계산서, 하단에 위키/이메일.

## 경로

`/willow-investment/akros` — Linear 스타일 (사이드바 O, 헤더 O)

## 레이아웃

```
┌─────────────────────────────────────────┐
│  아크로스                                │
│  ETF 운용 · 세금계산서 · 위키 · 이메일    │
├─────────────────────────────────────────┤
│  [AUM 대시보드 블록]                      │
│  총 AUM(₩) | 상품 수 | 스파크라인 차트    │
├───────────────────┬─────────────────────┤
│  [상품 테이블 블록]  │  [세금계산서 블록]   │
│  ETF 상품 목록/관리 │  CRUD + PDF 업로드  │
├───────────────────┼─────────────────────┤
│  [위키 블록]       │  [이메일 블록]        │
│  akros 필터링      │  akros 이메일        │
└───────────────────┴─────────────────────┘
```

- 2열 그리드는 모바일에서 1열로 스택
- 각 블록은 LCard + LSectionHead 패턴

## 블록 상세

### 1. AUM 대시보드 (`aum-block.tsx`)

- **데이터 소스**: Supernova DB (`akros_products` 테이블) via `/api/akros-products`
- **표시 항목**: LStat 3개
  - 총 AUM (원화, toLocaleString)
  - 총 상품 수
  - 스파크라인 차트 (최근 30일 AUM 추이, SVG)
- **eyebrow**: "AUM DASHBOARD"
- **title**: "운용 현황"

### 2. 상품 테이블 (`product-block.tsx`)

- **데이터 소스**: `/api/akros-products`
- **표시**: 테이블 형태 (티커, 상품명, AUM, 수수료율, 설정일)
- **기능**:
  - 상품 추가 모달 (Linear 다이얼로그 패턴)
  - 상품 수정 모달 (수수료 구조 tiered fee 포함)
  - 상품 삭제 (수정 모달 내 삭제 버튼)
- **eyebrow**: "PRODUCTS"
- **title**: "상품 관리"
- **페이지네이션**: 드롭다운 + 쉐브론 (기존 pagination-template 패턴)

### 3. 세금계산서 (`tax-invoice-block.tsx`)

- **데이터 소스**: `/api/akros/tax-invoices`
- **표시**: 목록 (발행일, 공급자, 금액, 상태 배지)
- **상태 배지**: 발행(blue), 수정(amber), 영수(green)
- **기능**:
  - 세금계산서 추가 모달
  - 수정 모달
  - PDF 업로드 (`/api/akros/tax-invoices/upload`)
  - 삭제 (수정 모달 내)
- **eyebrow**: "TAX INVOICES"
- **title**: "세금계산서"
- **페이지네이션**: 드롭다운 + 쉐브론

### 4. 위키 (`wiki-block.tsx`)

- **기존 wiki-list 컴포넌트를 재사용**하되, `section='akros'`로 고정 필터링
- 섹션 필터 UI 제거 (아크로스 전용이므로)
- 2패널 (목록 + 상세) 구조 유지
- **eyebrow**: "WIKI"
- **title**: "업무 위키"

### 5. 이메일 (`email-block.tsx`)

- **사업관리 email-block 패턴 재사용**, `context='akros'`로 필터링
- Gmail 목록 + 상세 + 작성 기능
- **eyebrow**: "EMAIL"
- **title**: "이메일"

## API 의존성

| API | 용도 | DB |
|-----|------|----|
| `/api/akros-products` | 상품 CRUD + AUM | Supernova (akros) |
| `/api/akros/tax-invoices` | 세금계산서 CRUD | willow-dash (main) |
| `/api/akros/tax-invoices/upload` | PDF 업로드 | willow-dash (main) |
| `/api/wiki` | 위키 CRUD (section=akros) | willow-dash (main) |
| `/api/gmail/*` | 이메일 (context=akros) | Gmail API |

## 파일 구조

```
src/app/willow-investment/(linear)/akros/
├── page.tsx                    # 메인 페이지 조립
├── _components/
│   ├── aum-block.tsx           # AUM 대시보드
│   ├── product-block.tsx       # 상품 테이블 + 모달
│   ├── tax-invoice-block.tsx   # 세금계산서 + 모달
│   ├── wiki-block.tsx          # 위키 (wiki-list 래핑)
│   └── email-block.tsx         # 이메일 (email-block 래핑)
```

## 사이드바

`LINEAR_ROUTES`에 `/willow-investment/akros` 추가.
사이드바 프로젝트 목록에서 "아크로스" 클릭 시 이 페이지로 이동.

## 모바일

- 2열 그리드 → 1열 스택
- 위키/이메일 2패널 → stacked panels (기존 패턴)
