# 타이포그래피

## 공식 폰트

linear 대시보드는 `linear-tokens.ts`의 폰트 토큰을 사용한다.

| 용도 | Token |
|------|-------|
| 일반 UI | `t.font.sans` |
| 숫자, 축약 라벨, 표 헤더 | `t.font.mono` |

`t.font.sans`는 Inter Tight 기반이며 한글/Windows 폴백과 국기 폴리필 폰트를 포함한다.
`t.font.mono`는 JetBrains Mono 기반이며 숫자 정렬과 표 헤더에 사용한다.

## linear 크기 위계

| 용도 | 크기 |
|------|------|
| 상단 breadcrumb | 12px |
| 섹션 제목 | 15px, semibold |
| 섹션 meta | 9.5px |
| KPI label | 9.5px mono uppercase |
| KPI value | 13px, semibold, tabular nums |
| 표 헤더 | 9px mono uppercase |
| 표 셀 | 9px `t.type.tableCell` (조밀) · 11px `t.type.tableBody` |
| 배지 | 11px `t.badge.size` (표 셀 배지 포함) |
| 컨트롤(버튼·세그먼트·필터칩·셀렉트·검색) | 11px `t.type.control` — 크기(sm/md/lg)와 무관하게 단일 |
| 차트 축·데이터 라벨 | 8px `t.type.chartLabel` (차트 전용, 위계 밖) |
| 히어로 숫자 | 20px `t.type.display` (다이얼로그 금액·점수 한 칸) |

### 크기 단계 (2026-09-10)

단계는 넷이다. 0.5px 차이는 위계로 읽히지 않아 없앴다. 새 크기를 추가하지 말고 역할을 단계에 배정한다.

| 단계 | px | 토큰(역할) |
|---|---:|---|
| caption | 9 | tableHead · panelTitle · helper · label · tableCell |
| control | 11 | control · badge · tableBody |
| body | 13 | body(본문·KPI 값) |
| title | 15 | sectionTitle(섹션·다이얼로그 제목) |
| display | 20 | display(히어로 숫자) |

### 카드 내 위계 (2026-09-10 CEO 원칙: 역할을 먼저 고정하고 크기는 나중에 조정)

모든 LCard는 아래 역할표로 글자를 배정한다. 새 카드를 만들 때 크기를 고르지 말고 역할을 고른다.

| 카드 내 역할 | 토큰 | 굵기·서체 |
|---|---|---|
| 눈썹(예: SCHEDULE · 주간) | `panelTitle` | mono, 대문자, subtle |
| 카드 제목 | `sectionTitle` | semibold |
| 카드 메타·설명 | `helper` | regular, subtle |
| 컨트롤(세그먼트·칩·버튼·셀렉트) | `control` | regular/medium(활성) |
| KPI 라벨 / 값 / 보조 | `label` / `body` / `helper` | muted / semibold tabular / subtle |
| 목록·표 헤더 | `tableHead` | mono, 대문자 |
| 목록·표 1차 텍스트(제목·거래처·닉네임) | `tableBody` | medium |
| 목록·표 2차 텍스트(적요·설명) | `tableBody` | regular |
| 목록·표 메타(날짜·계좌·첨부 수) | `tableCell` | mono, subtle |
| 행 안 숫자 | `tableBody` | mono, tabular |
| 행 안 배지 | `LTableBadge` (`t.tableBadge`) | |
| 카드 밖 독립 배지(다이얼로그 헤더) | `LBadge` (`t.badge`) | |
| 본문 산문(위키 내용·노트·메시지) | `body` | regular, 행간 1.6~1.7 |
| 다이얼로그 제목 / 히어로 숫자 | `sectionTitle` / `display` | semibold / bold |

요약: **목록·표는 control 단계(11) + 메타 9, 산문과 KPI 값만 body(13), 제목만 15.** 목록 행 제목에 body를 쓰지 않는다.

### 렌더 배율

인라인 크기는 `calc(Npx * var(--fz))`로 쓰고, `globals.css`가 데스크톱 `--fz: 1.2`, 모바일 `1.3`을 준다. 토큰 값은 배율 전 기준값이다(body 13 → 데스크톱 15.6px). 표 셀 배지(`LTableBadge`)는 `t.tableBadge`(9px·1×5) 조밀 규격을 따른다.

### 서체

- 본문·UI: **Pretendard Variable** (한글·라틴·숫자 한 폰트, 가변 굵기 420/520/620/720, tabular-nums). `public/fonts/pretendard`에 동적 서브셋을 정적 서빙한다 — 파일은 `scripts/copy-pretendard.mjs`가 빌드·dev 전에 node_modules에서 복사하고 git에는 넣지 않는다.
- 숫자·코드·표 헤더: JetBrains Mono.

숫자에는 `fontVariantNumeric: 'tabular-nums'`를 우선 적용한다.
KPI label과 표 헤더는 대문자/mono를 허용하지만, 일반 본문과 버튼에는 과한 uppercase를 쓰지 않는다.

---

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
