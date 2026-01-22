/**
 * 테이블 템플릿
 *
 * 사용법:
 * 필요한 테이블 패턴을 복사하여 사용
 *
 * 주의: border 없이 배경색 교차로 구분
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, RefreshCw, Pencil, Trash2 } from 'lucide-react'

// 샘플 데이터 타입
interface TableItem {
  id: string
  symbol: string
  country: string
  name: string
  aum: string
  arr: string
}

// 샘플 데이터
const sampleData: TableItem[] = [
  { id: '1', symbol: 'KDEF', country: 'KR', name: 'PLUS Korea Defense ETF', aum: '$123.5M', arr: '$1.2M' },
  { id: '2', symbol: 'KBAT', country: 'KR', name: 'PLUS Battery ETF', aum: '$89.2M', arr: '$890K' },
  { id: '3', symbol: 'KGLD', country: 'KR', name: 'PLUS Gold ETF', aum: '$45.0M', arr: '$450K' },
]

// ============================================
// 1. 기본 테이블 (카드 내)
// ============================================
export function BasicTable() {
  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2">
        <div>
          <CardTitle className="text-lg">상품 리스트</CardTitle>
          <CardDescription className="text-sm mt-0.5">ETF 상품 목록</CardDescription>
        </div>
        <button className="flex items-center justify-center gap-2 rounded-lg bg-white dark:bg-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 cursor-pointer">
          <RefreshCw className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr className="bg-slate-200 dark:bg-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
                <th className="py-2 px-3 font-medium first:rounded-l-lg">Symbol</th>
                <th className="py-2 px-3 font-medium">Country</th>
                <th className="py-2 px-3 font-medium">Fund Name</th>
                <th className="py-2 px-3 font-medium">AUM</th>
                <th className="py-2 px-3 font-medium last:rounded-r-lg">ARR</th>
              </tr>
            </thead>
            <tbody>
              {sampleData.map((item, index) => (
                <tr
                  key={item.id}
                  className={`whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                    index % 2 === 1 ? 'bg-slate-50 dark:bg-slate-700/30' : ''
                  }`}
                >
                  <td className="py-3 px-3 font-mono font-medium">{item.symbol}</td>
                  <td className="py-3 px-3 text-sm">{item.country}</td>
                  <td className="py-3 px-3 text-sm min-w-[220px]">{item.name}</td>
                  <td className="py-3 px-3">{item.aum}</td>
                  <td className="py-3 px-3 font-medium">{item.arr}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================
// 2. 액션 버튼 테이블
// ============================================
export function ActionTable() {
  const handleEdit = (id: string) => {
    console.log('Edit:', id)
  }

  const handleDelete = (id: string) => {
    console.log('Delete:', id)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="bg-slate-200 dark:bg-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
            <th className="py-2 px-3 font-medium first:rounded-l-lg">Symbol</th>
            <th className="py-2 px-3 font-medium">Fund Name</th>
            <th className="py-2 px-3 font-medium">AUM</th>
            <th className="py-2 px-3 font-medium last:rounded-r-lg text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sampleData.map((item, index) => (
            <tr
              key={item.id}
              className={`whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                index % 2 === 1 ? 'bg-slate-50 dark:bg-slate-700/30' : ''
              }`}
            >
              <td className="py-3 px-3 font-mono font-medium">{item.symbol}</td>
              <td className="py-3 px-3 text-sm">{item.name}</td>
              <td className="py-3 px-3">{item.aum}</td>
              <td className="py-3 px-3 text-right">
                <div className="flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleEdit(item.id)}
                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-600"
                  >
                    <Pencil className="h-4 w-4 text-slate-500" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================
// 3. 페이지네이션
// ============================================
export function Pagination() {
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = 10

  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm text-muted-foreground">
        총 100개 중 1-10 표시
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-3 text-sm">
          {currentPage} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ============================================
// 4. 상태 배지 포함 테이블
// ============================================
interface StatusItem {
  id: string
  name: string
  status: 'active' | 'pending' | 'completed' | 'closed'
  priority: 'low' | 'medium' | 'high' | 'critical'
}

const statusData: StatusItem[] = [
  { id: '1', name: '프로젝트 A', status: 'active', priority: 'high' },
  { id: '2', name: '프로젝트 B', status: 'pending', priority: 'medium' },
  { id: '3', name: '프로젝트 C', status: 'completed', priority: 'low' },
]

export function StatusTable() {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
      case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400'
      case 'completed': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400'
      case 'closed': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
      default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400'
      case 'high': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-400'
      case 'medium': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-400'
      case 'low': return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
      default: return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max">
        <thead>
          <tr className="bg-slate-200 dark:bg-slate-700 text-left text-sm text-muted-foreground whitespace-nowrap">
            <th className="py-2 px-3 font-medium first:rounded-l-lg">이름</th>
            <th className="py-2 px-3 font-medium">상태</th>
            <th className="py-2 px-3 font-medium last:rounded-r-lg">우선순위</th>
          </tr>
        </thead>
        <tbody>
          {statusData.map((item, index) => (
            <tr
              key={item.id}
              className={`whitespace-nowrap hover:bg-slate-50 dark:hover:bg-slate-700/50 ${
                index % 2 === 1 ? 'bg-slate-50 dark:bg-slate-700/30' : ''
              }`}
            >
              <td className="py-3 px-3 font-medium">{item.name}</td>
              <td className="py-3 px-3">
                <span className={`text-sm px-2.5 py-1 rounded-full ${getStatusColor(item.status)}`}>
                  {item.status}
                </span>
              </td>
              <td className="py-3 px-3">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(item.priority)}`}>
                  {item.priority}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
