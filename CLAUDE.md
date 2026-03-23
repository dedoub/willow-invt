# Willow Dashboard

## Project Overview
Next.js 기반 대시보드 애플리케이션. ETF 관리, 업무 관리 등 다양한 기능 제공.

## Supabase Projects

### willow-dash-tensw-todo (주 프로젝트)
- **Project ID**: `axcfvieqsaphhvbkyzzv`
- **Region**: ap-southeast-1
- **URL**: https://axcfvieqsaphhvbkyzzv.supabase.co
- **용도**:
  - Wiki (업무위키) - `wiki_notes` 테이블
  - Tensoftworks 프로젝트 관리
  - CEO 문서 관리

#### Storage Buckets
| Bucket | Public | 용도 |
|--------|--------|------|
| `wiki-attachments` | Yes | 업무위키 첨부파일 |
| `etf-documents` | No | ETF 문서 |
| `tensw-project-docs` | Yes | 텐소프트웍스 프로젝트 문서 |
| `ceo-docs` | Yes | CEO 관련 문서 |

### project-supernova (Akros DB)
- **Project ID**: `iiicccnrnwdfawsvbacu`
- **Region**: ap-northeast-2
- **URL**: https://iiicccnrnwdfawsvbacu.supabase.co
- **용도**: Akros ETF 관련 데이터

### review-notes (ReviewNotes App)
- **Project ID**: `kumaqaizejnjrvfqhahu`
- **Region**: ap-southeast-1
- **URL**: https://kumaqaizejnjrvfqhahu.supabase.co
- **용도**: ReviewNotes 앱 유저/콘텐츠 관리
- **주요 테이블**:
  - `User` - 유저 정보 (subscriptionPlan, role 등)
  - `Note` - 노트
  - `Problem` - 문제
  - `Subscription` - 구독 정보 (LemonSqueezy 연동)

## Environment Variables
```
# Main Supabase (willow-dash-tensw-todo)
NEXT_PUBLIC_SUPABASE_URL=https://axcfvieqsaphhvbkyzzv.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=... (service_role)

# Akros DB (Supernova)
AKROS_SUPABASE_URL=https://iiicccnrnwdfawsvbacu.supabase.co
AKROS_SUPABASE_SERVICE_KEY=...

# ReviewNotes Supabase
REVIEWNOTES_SUPABASE_URL=https://kumaqaizejnjrvfqhahu.supabase.co
REVIEWNOTES_SUPABASE_KEY=...

# LemonSqueezy (ReviewNotes 결제)
LEMONSQUEEZY_API_KEY=...
LEMONSQUEEZY_STORE_ID=237969
```

## Key Pages & Features

### ETF/Akros Page (`/etf/akros`)
- 업무위키 (Work Wiki) - 파일 첨부 지원
- 인보이스 관리
- Gmail 연동
- API: `/api/wiki`, `/api/wiki/upload`, `/api/wiki/[id]`

### Tensoftworks Management (`/tensoftworks/management`)
- 프로젝트 관리
- 계약/결제 관리
- 일정 관리

## API Routes

### Wiki API
- `GET /api/wiki` - 위키 노트 목록 조회
- `POST /api/wiki` - 새 노트 생성
- `PUT /api/wiki/[id]` - 노트 수정
- `DELETE /api/wiki/[id]` - 노트 삭제
- `POST /api/wiki/upload` - 파일 업로드 (wiki-attachments 버킷)

### Gmail API
- `/api/gmail/auth` - OAuth 인증
- `/api/gmail/emails` - 이메일 목록
- `/api/gmail/send` - 이메일 발송

## Authentication
커스텀 JWT 인증 사용 (`auth_token` 쿠키)

## MCP Server
Willow Dashboard는 자체 MCP 서버를 내장하고 있으며, Claude Desktop 등 MCP 클라이언트에서 OAuth 2.1 인증 후 데이터에 접근 가능.

- **Endpoint**: `/api/mcp` (Streamable HTTP)
- **Auth**: OAuth 2.1 + PKCE (`/api/mcp/oauth/*`)
- **도구 수**: 88개 (10개 모듈)
- **리소스**: 3개 (`willow://wiki/notes`, `willow://users/me`, `willow://projects/{section}`)

### MCP 도구 모듈
| 모듈 | 파일 | 도구 수 | 접두사 |
|------|------|---------|--------|
| 대시보드 | `dashboard.ts` | 1 | - |
| 업무위키 | `wiki.ts` | 5 | - |
| 프로젝트(레거시) | `projects.ts` | 6 | - |
| Akros ETF | `etf.ts` | 8 | `akros_` |
| ETF/Etc | `etf.ts` | 5 | `etc_` |
| ETF/Etc 인보이스 | `invoices.ts` | 3 | `etc_` |
| 이메일 AI 분석 | `email-analysis.ts` | 8 | `akros_`/`etc_` |
| 류하 학습관리 | `ryuha.ts` | 18+ | `ryuha_` |
| 윌로우 경영관리 | `willow-mgmt.ts` | 18+ | `willow_` |
| 텐소프트웍스 | `tensw-mgmt.ts` | 18+ | `tensw_` |

> 상세 문서: `docs/mcp.md`

## Notes
- 파일 업로드 시 service_role 키 사용 (RLS 우회)
- wiki-attachments 버킷은 public으로 설정됨

---

## Design System (디자인 시스템)

### ⚠️ 디자인 시스템 준수 규칙 (필독)

> **모든 UI 작업 시 디자인 시스템을 엄격하게 준수해야 합니다.**

**작업 전 필수 확인:**
1. `.claude/design-system.md` 문서 확인
2. `.claude/templates/` 디렉토리의 관련 템플릿 참조
3. `/admin/ui-guide` 페이지에서 컴포넌트 스타일 확인

**준수 체크리스트:**
- [ ] border, shadow, ring, outline 사용 금지 (색상으로 구분)
- [ ] 배지 스타일 통일 (상태: `rounded-full`, 우선순위: `rounded`)
- [ ] 색상 헬퍼 함수 사용 (getStatusColor, getPriorityColor 등)
- [ ] CardHeader `pb-2`, CardContent `pt-0 space-y-3` 패턴 준수
- [ ] 삭제 버튼은 수정 모달/인라인 내에서만 (단독 삭제 아이콘 금지)

**위반 시 즉시 수정 필요**

---

### 🚨 제1 원칙: 색상으로 구분
**테두리(border)와 그림자(shadow)를 사용하지 않고, 색상(color)으로 컴포넌트를 구분한다**

```
❌ 피해야 할 패턴: border, shadow, ring, outline
✅ 사용할 패턴: 배경색 차이로 계층 표현
```

### 배경색 계층
| 계층 | Light Mode | Dark Mode |
|------|------------|-----------|
| 페이지 배경 | `bg-slate-50` | `dark:bg-slate-900` |
| 카드 배경 | `bg-slate-100` | `dark:bg-slate-800` |
| 내부 영역 | `bg-white` | `dark:bg-slate-700` |
| 폼 필드 (Input/Textarea/Select) | `bg-slate-100` | `dark:bg-slate-700` |
| 폼 필드 포커스 | `bg-slate-50` | `dark:bg-slate-600` |

> **Note**: 모달 배경(bg-white)에서 폼 필드가 항상 구분되도록 포커스 시에도 slate-50 유지

### 상태 배지 색상 (Status Badge)
| 상태 | 색상 |
|------|------|
| pending (대기) | `bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400` |
| in_progress (진행중) | `bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400` |
| completed (완료) | `bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400` |

### 활동 카드 색상 (Activity Card)
카드 배경이 `slate-100`이므로, neutral 색상은 `slate-200` 사용:
| 활동 타입 | 색상 |
|----------|------|
| created | `bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400` |
| assigned | `bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400` |
| started | `bg-cyan-100 dark:bg-cyan-900/50 text-cyan-700 dark:text-cyan-400` |
| completed | `bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400` |
| commit | `bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400` |
| analysis | `bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400` |
| doc_created | `bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400` |
| schedule_* | `bg-teal-100 dark:bg-teal-900/50 text-teal-700 dark:text-teal-400` |
| discarded/default | `bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400` |

### 배지 스타일링
```jsx
<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium">
  <Icon className="h-4 w-4" />
  {label}
</span>
```

### 버튼 & 체크박스 패턴
> **Button, Checkbox는 slate 색상 사용 (primary 아님)**
> - Button default: `bg-slate-900 dark:bg-slate-600`
> - Button outline: `bg-slate-200 dark:bg-slate-700`
> - Button destructive: `bg-red-600`
> - Checkbox 체크: `bg-slate-900 dark:bg-slate-500`

```jsx
// 모달/인라인 폼 버튼 (size="sm" 필수)
<Button size="sm" variant="destructive">삭제</Button>
<Button size="sm" variant="outline">취소</Button>
<Button size="sm">저장</Button>

// 체크박스 (slate 색상)
<Checkbox />  // 미체크: slate-200, 체크: slate-900
```

### 모달 폼 전체 구조
```jsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-h-[90vh] flex flex-col">
    <DialogHeader className="flex-shrink-0 pb-4 border-b">
      <DialogTitle>항목 추가</DialogTitle>
    </DialogHeader>

    {/* 본문: px-1 -mx-1로 스크롤바 처리 */}
    <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
      <div>
        <label className="text-xs text-slate-500 mb-1 block">이름 *</label>
        <Input placeholder="이름을 입력하세요" />
      </div>
      <div>
        <label className="text-xs text-slate-500 mb-1 block">설명</label>
        <Textarea placeholder="설명..." rows={2} />
      </div>
    </div>

    {/* Footer: size="sm" 버튼 사용 */}
    <DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
      {/* 생성 모드: <div /> | 수정 모드: <Button variant="destructive" size="sm">삭제</Button> */}
      <div />
      <div className="flex gap-2">
        <Button variant="outline" size="sm">취소</Button>
        <Button size="sm">저장</Button>
      </div>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### 모달 폼 label 스타일
```jsx
// 기본 label (필수 아님)
<label className="text-xs text-slate-500 mb-1 block">설명</label>

// 필수 필드 label
<label className="text-xs text-slate-500 mb-1 block">이름 *</label>

// 폼 필드 wrapper (space-y-2 불필요, label에 mb-1 있음)
<div>
  <label className="text-xs text-slate-500 mb-1 block">필드명</label>
  <Input ... />
</div>
```

### 모달 Footer 패턴
> **모든 모달 버튼은 `size="sm"` 사용**

```jsx
// 생성 모드 (삭제 버튼 없음)
<DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
  <div />
  <div className="flex gap-2">
    <Button variant="outline" size="sm">취소</Button>
    <Button size="sm">저장</Button>
  </div>
</DialogFooter>

// 수정 모드 (삭제 버튼 좌측)
<DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
  <Button variant="destructive" size="sm">삭제</Button>
  <div className="flex gap-2">
    <Button variant="outline" size="sm">취소</Button>
    <Button size="sm">저장</Button>
  </div>
</DialogFooter>
```

### 인라인 폼 패턴 (위키 스타일)
카드 내에서 모달 대신 인라인으로 추가/수정하는 폼 패턴:
```jsx
// 배경색 규칙:
// - 폼 컨테이너: bg-white (카드 배경 bg-slate-100과 구분)
// - 입력 필드: bg-slate-100 (컴포넌트 기본값)
// - 파일 첨부 영역: bg-slate-100

// 추가 폼 (버튼 우측 정렬)
<div className="rounded-lg p-3 bg-white dark:bg-slate-700">
  <div className="space-y-3">
    <div>
      <label className="text-xs text-slate-500 mb-1 block">제목</label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
    </div>
    <div>
      <label className="text-xs text-slate-500 mb-1 block">내용</label>
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
    </div>
  </div>
  <div className="flex justify-end gap-2 mt-4 pt-3">
    <Button variant="outline" size="sm">취소</Button>
    <Button size="sm">저장</Button>
  </div>
</div>

// 수정 폼 (삭제 버튼 좌측)
<div className="flex justify-between gap-2 mt-4 pt-3">
  <Button variant="destructive" size="sm">삭제</Button>
  <div className="flex gap-2">
    <Button variant="outline" size="sm">취소</Button>
    <Button size="sm">저장</Button>
  </div>
</div>

// 파일 첨부 영역 (라벨 필수!)
<div>
  <label className="text-xs text-slate-500 mb-1 block">첨부 파일</label>
  <div className="rounded-lg p-2 text-center bg-slate-100 dark:bg-slate-700">
    <input type="file" id="file-input" multiple className="hidden" />
    <label htmlFor="file-input" className="flex items-center justify-center gap-1 text-xs text-slate-500 cursor-pointer hover:text-slate-700">
      <Paperclip className="h-3 w-3" />
      <span>파일 첨부</span>
    </label>
  </div>
</div>
```

### 숫자 포맷팅
```js
// 천 단위 콤마 (필수)
value.toLocaleString()  // 1234567 → "1,234,567"

// 금액
`₩${value.toLocaleString()}`  // ₩1,500,000
```

### 필터 배지 정렬
```js
// 가나다순 정렬 (한글)
items.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
```

### 간격 패턴
- 필터 배지와 컨텐츠 목록 사이: `mb-4`
- CardHeader: `pb-2`
- CardContent: `pt-0 space-y-3`

### 모달 패딩 패턴 (필수)
```
컨테이너: p-6 (전체 패딩)
├── Header: pb-4 border-b (하단 패딩 + border)
├── Body: py-4 -mx-6 px-6 (상하 패딩, 스크롤 시 좌우 유지)
└── Footer: pt-4 border-t (상단 패딩 + border)
```

### 아이콘 버튼 규칙
- 삭제 아이콘 단독 사용 금지
- 삭제는 수정 모달/인라인 내에서만 가능
- 수정 아이콘: `<Pencil className="h-4 w-4" />`

### 모달 X 닫기 버튼 (통일)
```jsx
// DialogContent에 기본 포함됨
// 커스텀 모달 사용 시:
<button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
  <X className="h-5 w-5" />
</button>
```

### UI 가이드 참조
- 전체 디자인 시스템: `/admin/ui-guide` 페이지
- 상세 디자인 문서: `.claude/design-system.md`
- 템플릿 파일: `.claude/templates/`
  - `page-template.tsx` - 페이지 기본 구조
  - `card-template.tsx` - 카드 컴포넌트
  - `form-template.tsx` - 폼/모달/인라인 폼 (Dialog 모달 포함)
  - `table-template.tsx` - 테이블
  - `button-template.tsx` - 버튼 variants/sizes
  - `badge-template.tsx` - 배지/상태 + 색상 헬퍼 함수
  - `skeleton-template.tsx` - 스켈레톤 로딩
  - `pattern-template.tsx` - 공통 UI 패턴 (로딩, 빈상태)
  - `pagination-template.tsx` - 페이지네이션 (드롭다운 + 쉐브론 네비게이션)
  - `collapsible-template.tsx` - 접기/펼치기
  - `calendar-template.tsx` - 캘린더 셀
  - `chart-template.tsx` - 차트 (recharts)
  - `dnd-template.tsx` - 드래그앤드롭 (dnd-kit)
  - `utilities-template.tsx` - 숫자 포맷, 날짜 등 유틸리티
  - `wiki-template.tsx` - 업무 위키 (인라인 폼, 파일 첨부 라벨)
  - `email-template.tsx` - 이메일 커뮤니케이션 (Gmail 연동, ComposeEmailModal)
  - `client-project-template.tsx` - 클라이언트/프로젝트 (필터 배지, 마일스톤)
