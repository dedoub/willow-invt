# Willow Dashboard 디자인 시스템

## 목차

| 문서 | 설명 |
|------|------|
| [principles.md](./principles.md) | 디자인 원칙 (border/shadow 금지) |
| [colors.md](./colors.md) | 색상 시스템, 상태/우선순위/활동 색상 |
| [spacing.md](./spacing.md) | 간격 시스템 |
| [typography.md](./typography.md) | 타이포그래피 |
| [button.md](./button.md) | 버튼 variants, sizes, 로딩 상태 |
| [input.md](./input.md) | 입력 필드, 검색, 금액 입력 |
| [badge.md](./badge.md) | 상태/우선순위/활동/필터 배지 |
| [card.md](./card.md) | 카드 구조, 통계 카드, 활동 카드 |
| [table.md](./table.md) | 테이블 구조, 액션 버튼 |
| [modal.md](./modal.md) | Dialog 모달, 커스텀 모달 패턴 |
| [pagination.md](./pagination.md) | 페이지네이션 UI |
| [skeleton.md](./skeleton.md) | 스켈레톤 로딩 패턴 |
| [patterns.md](./patterns.md) | 공통 UI 패턴 (로딩, 빈 상태, 인라인 폼) |
| [calendar.md](./calendar.md) | 캘린더 주간/월간 뷰, 일정 아이템 |
| [chart.md](./chart.md) | recharts 차트 (Line, Bar, Pie, Area) |
| [dnd.md](./dnd.md) | 드래그앤드롭 (@dnd-kit) |
| [email.md](./email.md) | 이메일 커뮤니케이션, Gmail 연동 |
| [collapsible.md](./collapsible.md) | 접기/펼치기 카드, 아코디언 |
| [wiki.md](./wiki.md) | 업무 위키, 인라인 폼, 파일 첨부 |

---

## 핵심 원칙

> **테두리(border)와 그림자(shadow)를 사용하지 않고, 색상(color)으로 컴포넌트를 구분한다**

```
❌ border, shadow, ring, outline
✅ 배경색 차이로 계층 표현
```

---

## 배경색 계층

| 계층 | Light Mode | Dark Mode |
|------|------------|-----------|
| 페이지 배경 | `bg-slate-50` | `dark:bg-slate-900` |
| 카드 배경 | `bg-slate-100` | `dark:bg-slate-800` |
| 내부 영역 | `bg-white` | `dark:bg-slate-700` |
| 폼 필드 | `bg-slate-100` | `dark:bg-slate-700` |

---

## UI 컴포넌트 Import

```tsx
// 기본 컴포넌트
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

// 다이얼로그
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

// 셀렉트
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
```

---

## 사용 가능한 UI 컴포넌트

`@/components/ui/` 경로에서 import:

| 컴포넌트 | 설명 |
|---------|------|
| `Button` | 버튼 |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | 카드 |
| `Input` | 입력 |
| `Textarea` | 텍스트영역 |
| `Label` | 라벨 |
| `Checkbox` | 체크박스 |
| `Badge` | 배지 |
| `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` | 다이얼로그 |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | 탭 |
| `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | 셀렉트 |
| `Separator` | 구분선 |
| `Avatar`, `AvatarImage`, `AvatarFallback` | 아바타 |
| `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` | 드롭다운 |

---

## 참고

- 상세 디자인 문서: `.claude/design-system.md`
- 템플릿 파일: `.claude/templates/`
- UI 가이드 페이지: `/admin/ui-guide`
