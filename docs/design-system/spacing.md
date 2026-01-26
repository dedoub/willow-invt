# 간격 시스템

## 기본 간격

| 용도 | 클래스 |
|------|--------|
| 섹션 간 | `space-y-8` / `mb-8` |
| 카드 간 | `space-y-6` / `gap-6` |
| 요소 간 | `space-y-4` / `gap-4` |
| 작은 간격 | `space-y-2` / `gap-2` |
| 최소 간격 | `gap-1` |

---

## 카드 내부 간격

| 요소 | 클래스 |
|------|--------|
| CardHeader | `pb-2` |
| CardContent | `pt-0 space-y-3` |
| 필터-목록 간격 | `mb-4` |

---

## 그리드 패턴

| 용도 | 클래스 |
|------|--------|
| Stats 카드 (ETF) | `grid gap-4 md:grid-cols-3` |
| Stats Grid (색상) | `grid grid-cols-2 sm:grid-cols-4 gap-2` |
| 프로젝트 카드 | `grid sm:grid-cols-1 lg:grid-cols-2 gap-4` |
| POC 카드 | `grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` |
| Management (1:2) | `grid grid-cols-1 lg:grid-cols-3 gap-6` |
| 카드 내 2컬럼 | `grid grid-cols-1 sm:grid-cols-2 gap-3` |

---

## 모달 패딩 패턴

```
컨테이너: p-6 (전체 패딩)
├── Header: pb-4 border-b
├── Body: py-4 -mx-6 px-6 (스크롤 시 좌우 유지)
└── Footer: pt-4 border-t
```

---

## 인라인 폼 간격

```tsx
// 폼 컨테이너
<div className="rounded-lg p-3 bg-white dark:bg-slate-700">
  <div className="space-y-3">
    {/* 입력 필드들 */}
  </div>
  <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
    {/* 버튼들 */}
  </div>
</div>
```

---

## 페이지네이션 간격

```tsx
<div className="pt-4 border-t mt-4">
  {/* 페이지네이션 UI */}
</div>
```
