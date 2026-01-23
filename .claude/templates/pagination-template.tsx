/**
 * 페이지네이션 템플릿
 *
 * 통일된 스타일:
 * - 드롭다운: bg-white, appearance-none, ChevronDown 아이콘
 * - 네비게이션: h-7 w-7 아이콘 버튼, ChevronsLeft/Right + ChevronLeft/Right
 * - 컨테이너: border-t 구분선, justify-between
 */

import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown
} from 'lucide-react'

// ============================================================
// 1. 기본 페이지네이션 (State 포함)
// ============================================================

export function BasicPaginationExample() {
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(5)

  // 예시 데이터
  const items = Array.from({ length: 65 }, (_, i) => ({ id: i + 1 }))
  const totalPages = Math.ceil(items.length / perPage)

  // 현재 페이지 아이템
  const paginatedItems = items.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  )

  return (
    <div>
      {/* 목록 렌더링 */}
      <div className="space-y-2">
        {paginatedItems.map((item) => (
          <div key={item.id} className="p-3 rounded-lg bg-white dark:bg-slate-700">
            Item {item.id}
          </div>
        ))}
      </div>

      {/* 페이지네이션 */}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {items.length}개 중 {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, items.length)}
            </p>
            {/* 페이지당 개수 드롭다운 */}
            <div className="relative">
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(Number(e.target.value))
                  setCurrentPage(1)
                }}
                className="text-xs bg-white dark:bg-slate-800 rounded pl-2 pr-6 py-1 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <option value={5}>5개</option>
                <option value={10}>10개</option>
                <option value={25}>25개</option>
                <option value={50}>50개</option>
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
            </div>
          </div>
          {/* 페이지 네비게이션 */}
          {totalPages > 1 && (
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 py-1 text-xs font-medium">{currentPage}/{totalPages}</span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ============================================================
// 2. 페이지네이션 컴포넌트 (재사용)
// ============================================================

interface PaginationProps {
  totalItems: number
  currentPage: number
  perPage: number
  onPageChange: (page: number) => void
  onPerPageChange: (perPage: number) => void
  perPageOptions?: number[]
}

export function Pagination({
  totalItems,
  currentPage,
  perPage,
  onPageChange,
  onPerPageChange,
  perPageOptions = [5, 10, 25, 50],
}: PaginationProps) {
  const totalPages = Math.ceil(totalItems / perPage)
  const startItem = (currentPage - 1) * perPage + 1
  const endItem = Math.min(currentPage * perPage, totalItems)

  if (totalItems === 0) return null

  return (
    <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground whitespace-nowrap">
          {totalItems}개 중 {startItem}-{endItem}
        </p>
        {/* 페이지당 개수 드롭다운 */}
        <div className="relative">
          <select
            value={perPage}
            onChange={(e) => {
              onPerPageChange(Number(e.target.value))
              onPageChange(1)
            }}
            className="text-xs bg-white dark:bg-slate-800 rounded pl-2 pr-6 py-1 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            {perPageOptions.map((option) => (
              <option key={option} value={option}>{option}개</option>
            ))}
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
        </div>
      </div>
      {/* 페이지 네비게이션 */}
      {totalPages > 1 && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="px-2 py-1 text-xs font-medium">{currentPage}/{totalPages}</span>
          <button
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}

// 사용 예시:
// <Pagination
//   totalItems={items.length}
//   currentPage={page}
//   perPage={perPage}
//   onPageChange={setPage}
//   onPerPageChange={setPerPage}
//   perPageOptions={[5, 10, 25, 50, 100]}
// />


// ============================================================
// 3. 스타일 클래스 정리
// ============================================================

const PAGINATION_STYLES = {
  // 전체 컨테이너
  container: 'flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4',

  // 좌측 (정보 + 드롭다운)
  leftSection: 'flex items-center gap-2',

  // 카운트 텍스트
  countText: 'text-xs text-muted-foreground whitespace-nowrap',

  // 드롭다운 wrapper
  dropdownWrapper: 'relative',

  // 드롭다운 select
  dropdownSelect: 'text-xs bg-white dark:bg-slate-800 rounded pl-2 pr-6 py-1 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors',

  // 드롭다운 아이콘
  dropdownIcon: 'absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground',

  // 네비게이션 컨테이너
  navContainer: 'flex items-center gap-0.5',

  // 네비게이션 버튼
  navButton: 'h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors',

  // 네비게이션 아이콘
  navIcon: 'h-4 w-4',

  // 페이지 표시
  pageDisplay: 'px-2 py-1 text-xs font-medium',
}


// ============================================================
// 4. 모바일 반응형 (선택적)
// ============================================================

export function ResponsivePaginationExample() {
  const [currentPage, setCurrentPage] = useState(1)
  const [perPage, setPerPage] = useState(5)
  const items = Array.from({ length: 65 }, (_, i) => ({ id: i + 1 }))
  const totalPages = Math.ceil(items.length / perPage)

  return (
    <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-700 mt-4">
      <div className="flex items-center gap-2">
        {/* 모바일: 짧은 텍스트, 데스크톱: 긴 텍스트 */}
        <p className="hidden sm:block text-xs text-muted-foreground whitespace-nowrap">
          총 {items.length}개 중 {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, items.length)}
        </p>
        <p className="sm:hidden text-xs text-muted-foreground whitespace-nowrap">
          {items.length}개 중 {(currentPage - 1) * perPage + 1}-{Math.min(currentPage * perPage, items.length)}
        </p>
        <div className="relative">
          <select
            value={perPage}
            onChange={(e) => {
              setPerPage(Number(e.target.value))
              setCurrentPage(1)
            }}
            className="text-xs bg-white dark:bg-slate-800 rounded pl-2 pr-6 py-1 appearance-none cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <option value={5}>5개</option>
            <option value={10}>10개</option>
            <option value={25}>25개</option>
            <option value={50}>50개</option>
          </select>
          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 pointer-events-none text-muted-foreground" />
        </div>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-0.5">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <ChevronsLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          {/* 모바일: 좁은 패딩, 데스크톱: 넓은 패딩 */}
          <span className="px-2 sm:px-3 py-1 text-xs font-medium">{currentPage}/{totalPages}</span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="h-7 w-7 flex items-center justify-center rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            <ChevronsRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
