# 타이포그래피

## 기본 크기

| 용도 | 클래스 |
|------|--------|
| Stats 값 | `text-2xl font-bold` |
| 페이지 섹션 제목 | `text-xl font-bold` |
| CardTitle | `text-lg truncate` |
| 섹션 헤더, 라벨 | `text-sm font-medium` |
| 본문, 설명 | `text-sm` |
| 보조 정보 | `text-xs text-muted-foreground` |
| 매우 작은 (일정 상세) | `text-[10px]` |

---

## Label 스타일

```tsx
// 기본 label
<label className="text-xs text-slate-500 mb-1 block">필드명</label>

// 필수 필드 label
<label className="text-xs text-slate-500 mb-1 block">필드명 *</label>
```

---

## 오버플로우 처리

```tsx
// 한 줄 자르기
<span className="truncate">긴 텍스트...</span>

// 멀티라인 제한
<p className="line-clamp-1">한 줄 제한</p>
<p className="line-clamp-2">두 줄 제한</p>

// flex 컨테이너에서
<div className="flex items-center gap-2 min-w-0">
  <Icon className="h-4 w-4 flex-shrink-0" />
  <span className="truncate">긴 텍스트...</span>
</div>
```

---

## CardTitle/CardDescription

```tsx
<CardTitle className="text-lg truncate">{title}</CardTitle>
<CardDescription className="text-sm mt-0.5 line-clamp-1">{description}</CardDescription>
```

---

## 숫자 포맷

```tsx
// 천 단위 콤마 (필수!)
value.toLocaleString()  // 1234567 → "1,234,567"

// 소수점 포함
value.toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

// 통화 포맷
new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
}).format(value)

// 큰 숫자 축약
if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
```

---

## 모노스페이스

```tsx
// 코드, 심볼 등
<span className="font-mono font-medium">{symbol}</span>
```
