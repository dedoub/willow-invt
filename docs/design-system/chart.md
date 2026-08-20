# 차트 (Chart)

## 대시보드 차트 원칙

linear 대시보드에서는 차트를 장식용 카드로 만들지 않는다. 차트는 KPI의 변화, 분포, 이상 신호를 빠르게 판단하게 해야 한다.

| 용도 | 우선 컴포넌트 |
|------|---------------|
| KPI 추세 | `LStat`의 `sparkline` |
| 작은 분포 | `DistributionPie` |
| 복합 시계열/막대 | Recharts 직접 사용 |
| 로딩 | `Bone`, `ChartSkeleton` |

## 색상

- 긍정/상승: `t.accent.pos`
- 부정/하락: `t.accent.neg`
- 주의/보조: `t.accent.warn`
- 주요 정보: `t.brand[600]`
- 기타/잔여: `t.neutrals.subtle` 또는 `#94a3b8`

기존 `CHART_COLORS` 팔레트는 레거시 recharts 예시로 유지한다. 신규 linear 화면에서는 토큰 색을 먼저 사용한다.

---

## Import

```tsx
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
```

---

## 색상 팔레트

```tsx
export const CHART_COLORS = {
  indigo: '#6366f1',
  orange: '#f97316',
  emerald: '#10b981',
  blue: '#3b82f6',
  rose: '#f43f5e',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  cyan: '#06b6d4',
}

export const CHART_COLOR_ARRAY = [
  '#6366f1', // indigo
  '#f97316', // orange
  '#10b981', // emerald
  '#3b82f6', // blue
  '#f43f5e', // rose
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
]
```

---

## 기본 LineChart

```tsx
<div className="h-48">
  <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
      <YAxis tick={{ fontSize: 10 }} />
      <Tooltip />
      <Legend />
      <Line
        type="monotone"
        dataKey="value"
        stroke={CHART_COLORS.indigo}
        strokeWidth={2}
        dot={{ r: 3 }}
        connectNulls
      />
    </LineChart>
  </ResponsiveContainer>
</div>
```

---

## BarChart

```tsx
<div className="h-48">
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={data}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
      <YAxis tick={{ fontSize: 10 }} />
      <Tooltip />
      <Bar dataKey="value" fill={CHART_COLORS.indigo} radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
</div>
```

---

## PieChart

```tsx
<div className="h-48">
  <ResponsiveContainer width="100%" height="100%">
    <PieChart>
      <Pie
        data={data}
        cx="50%"
        cy="50%"
        innerRadius={40}
        outerRadius={70}
        paddingAngle={2}
        dataKey="value"
        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
        labelLine={false}
      >
        {data.map((_, index) => (
          <Cell key={`cell-${index}`} fill={CHART_COLOR_ARRAY[index % CHART_COLOR_ARRAY.length]} />
        ))}
      </Pie>
      <Tooltip />
    </PieChart>
  </ResponsiveContainer>
</div>
```

---

## AreaChart

```tsx
<div className="h-48">
  <ResponsiveContainer width="100%" height="100%">
    <AreaChart data={data}>
      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
      <YAxis tick={{ fontSize: 10 }} />
      <Tooltip />
      <Area
        type="monotone"
        dataKey="value"
        stroke={CHART_COLORS.indigo}
        fill={CHART_COLORS.indigo}
        fillOpacity={0.2}
      />
    </AreaChart>
  </ResponsiveContainer>
</div>
```

---

## 차트 컨테이너

```tsx
<div className="h-48 bg-white dark:bg-slate-700 rounded-lg p-4">
  {/* 차트 */}
</div>
```

---

## 빈 상태

```tsx
<div className="h-48 flex items-center justify-center">
  <div className="text-center py-4 text-muted-foreground text-sm">
    데이터가 없습니다
  </div>
</div>
```

---

## 높이 규칙

| 차트 크기 | 클래스 |
|----------|--------|
| 기본 | `h-48` |
| 작은 | `h-32` |
| 큰 | `h-64` |

---

## 공통 스타일

| 요소 | 스타일 |
|------|--------|
| 그리드 | `strokeDasharray="3 3" className="stroke-muted"` |
| 축 라벨 | `tick={{ fontSize: 10 }}` |
| 선 두께 | `strokeWidth={2}` |
| 점 크기 | `dot={{ r: 3 }}` |
| 바 모서리 | `radius={[4, 4, 0, 0]}` |
