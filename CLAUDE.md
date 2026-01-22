# Willow Dashboard

## Project Overview
Next.js 기반 대시보드 애플리케이션. ETF 관리, 업무 관리 등 다양한 기능 제공.

## Supabase Projects

### experiment-apps (주 프로젝트)
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

## Environment Variables
```
# Main Supabase (experiment-apps)
NEXT_PUBLIC_SUPABASE_URL=https://axcfvieqsaphhvbkyzzv.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=... (service_role)

# Akros DB (Supernova)
AKROS_SUPABASE_URL=https://iiicccnrnwdfawsvbacu.supabase.co
AKROS_SUPABASE_SERVICE_KEY=...
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
| discarded/commit/default | `bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400` |

### 배지 스타일링
```jsx
<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium">
  <Icon className="h-4 w-4" />
  {label}
</span>
```

### 버튼 패턴
```jsx
// 인라인 폼 버튼 (동일 크기)
<Button size="sm" variant="destructive" className="h-8 px-3">삭제</Button>
<Button size="sm" variant="outline" className="h-8 px-3">취소</Button>
<Button size="sm" className="h-8 px-3">저장</Button>
```

### 모달 Footer 패턴
```jsx
// 생성 모드 (삭제 버튼 없음)
<DialogFooter className="flex-row justify-between pt-4 border-t">
  <div />
  <div className="flex gap-2">
    <Button variant="outline">취소</Button>
    <Button>저장</Button>
  </div>
</DialogFooter>

// 수정 모드 (삭제 버튼 좌측)
<DialogFooter className="flex-row justify-between pt-4 border-t">
  <Button variant="destructive">삭제</Button>
  <div className="flex gap-2">
    <Button variant="outline">취소</Button>
    <Button>저장</Button>
  </div>
</DialogFooter>
```

### 인라인 폼 패턴
간단한 항목(1-2개 필드)은 모달 대신 인라인 폼 사용:
```jsx
<div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-2">
  <Input
    className="h-8 text-sm focus-visible:bg-white dark:focus-visible:bg-slate-700"
    autoFocus
    onKeyDown={(e) => {
      if (e.key === 'Enter') save()
      if (e.key === 'Escape') cancel()
    }}
  />
  <div className="flex gap-2">
    <Input type="date" className="h-8 text-sm flex-1" />
    <Button size="sm" variant="destructive" className="h-8 px-3">삭제</Button>
    <Button size="sm" variant="outline" className="h-8 px-3">취소</Button>
    <Button size="sm" className="h-8 px-3">저장</Button>
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

### 아이콘 버튼 규칙
- 삭제 아이콘 단독 사용 금지
- 삭제는 수정 모달/인라인 내에서만 가능
- 수정 아이콘: `<Pencil className="h-4 w-4" />`

### UI 가이드 참조
- 전체 디자인 시스템: `/admin/ui-guide` 페이지
- 상세 디자인 문서: `.claude/design-system.md`
- 템플릿 파일: `.claude/templates/`
  - `page-template.tsx` - 페이지 기본 구조
  - `card-template.tsx` - 카드 컴포넌트
  - `form-template.tsx` - 폼/모달/인라인 폼
  - `table-template.tsx` - 테이블
  - `button-template.tsx` - 버튼 variants/sizes
  - `badge-template.tsx` - 배지/상태 + 색상 헬퍼 함수
  - `skeleton-template.tsx` - 스켈레톤 로딩
  - `pattern-template.tsx` - 공통 UI 패턴 (로딩, 빈상태, 페이지네이션)
  - `collapsible-template.tsx` - 접기/펼치기
  - `calendar-template.tsx` - 캘린더 셀
  - `chart-template.tsx` - 차트 (recharts)
  - `dnd-template.tsx` - 드래그앤드롭 (dnd-kit)
  - `utilities-template.tsx` - 숫자 포맷, 날짜 등 유틸리티
