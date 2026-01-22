/**
 * 차트 템플릿 모음 (recharts)
 *
 * 사용법:
 * 1. recharts 설치: npm install recharts
 * 2. 필요한 패턴을 복사하여 사용
 *
 * 포함된 패턴:
 * 1. 기본 LineChart
 * 2. BarChart
 * 3. PieChart
 * 4. AreaChart
 * 5. 색상 팔레트
 */

'use client'

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

// ============================================
// 1. 색상 팔레트
// ============================================

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

// ============================================
// 2. 샘플 데이터
// ============================================

const lineChartData = [
  { date: '1월', value1: 4000, value2: 2400 },
  { date: '2월', value1: 3000, value2: 1398 },
  { date: '3월', value1: 2000, value2: 9800 },
  { date: '4월', value1: 2780, value2: 3908 },
  { date: '5월', value1: 1890, value2: 4800 },
  { date: '6월', value1: 2390, value2: 3800 },
]

const barChartData = [
  { name: '프로젝트 A', value: 400 },
  { name: '프로젝트 B', value: 300 },
  { name: '프로젝트 C', value: 500 },
  { name: '프로젝트 D', value: 200 },
]

const pieChartData = [
  { name: '진행중', value: 40 },
  { name: '완료', value: 35 },
  { name: '대기', value: 25 },
]

// ============================================
// 3. 기본 LineChart
// ============================================

export function BasicLineChart({ data = lineChartData }: { data?: typeof lineChartData }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="value1"
            name="데이터 1"
            stroke={CHART_COLORS.indigo}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="value2"
            name="데이터 2"
            stroke={CHART_COLORS.orange}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// 단일 라인 차트
export function SimpleLineChart({
  data,
  dataKey,
  color = CHART_COLORS.indigo,
}: {
  data: { name: string; value: number }[]
  dataKey?: string
  color?: string
}) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Line
            type="monotone"
            dataKey={dataKey || 'value'}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================
// 4. BarChart
// ============================================

export function BasicBarChart({ data = barChartData }: { data?: typeof barChartData }) {
  return (
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
  )
}

// ============================================
// 5. PieChart
// ============================================

export function BasicPieChart({ data = pieChartData }: { data?: typeof pieChartData }) {
  return (
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
  )
}

// ============================================
// 6. AreaChart
// ============================================

export function BasicAreaChart({ data = lineChartData }: { data?: typeof lineChartData }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip />
          <Area
            type="monotone"
            dataKey="value1"
            name="데이터 1"
            stroke={CHART_COLORS.indigo}
            fill={CHART_COLORS.indigo}
            fillOpacity={0.2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ============================================
// 7. 차트 컨테이너 (높이 지정)
// ============================================

export function ChartContainer({
  height = 'h-48',
  children,
}: {
  height?: string
  children: React.ReactNode
}) {
  return (
    <div className={`${height} bg-white dark:bg-slate-700 rounded-lg p-4`}>{children}</div>
  )
}

// ============================================
// 8. 빈 상태
// ============================================

export function ChartEmptyState() {
  return (
    <div className="h-48 flex items-center justify-center">
      <div className="text-center py-4 text-muted-foreground text-sm">데이터가 없습니다</div>
    </div>
  )
}

// ============================================
// 9. 사용 예시
// ============================================

/*
import { BasicLineChart, BasicBarChart, BasicPieChart, ChartContainer, CHART_COLORS } from '@/templates/chart-template'

// 기본 사용
<ChartContainer>
  <BasicLineChart data={myData} />
</ChartContainer>

// 커스텀 데이터
const data = [
  { date: '1월', revenue: 1000, cost: 400 },
  { date: '2월', revenue: 1500, cost: 600 },
]

<BasicLineChart data={data} />

// 빈 상태 처리
{data.length === 0 ? <ChartEmptyState /> : <BasicLineChart data={data} />}

// 색상 사용
<Line stroke={CHART_COLORS.emerald} />
*/
