/**
 * 폼 템플릿 모음
 *
 * 사용법:
 * 필요한 폼 패턴을 복사하여 사용
 *
 * 주의: border, shadow 없이 배경색으로 구분
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { Search, Loader2, X } from 'lucide-react'

// ============================================
// 1. 기본 폼 카드
// ============================================
export function BasicFormCard() {
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    // API 호출
    setIsLoading(false)
  }

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">폼 제목</CardTitle>
        <CardDescription className="text-sm mt-0.5">폼 설명</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-2 block">이름</Label>
            <Input placeholder="이름을 입력하세요" />
          </div>

          <div>
            <Label className="mb-2 block">이메일</Label>
            <Input type="email" placeholder="email@example.com" />
          </div>

          <div>
            <Label className="mb-2 block">설명</Label>
            <Textarea placeholder="설명을 입력하세요..." rows={3} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline">취소</Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              저장
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

// ============================================
// 2. 검색 폼
// ============================================
export function SearchForm() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filter, setFilter] = useState('all')

  const filters = ['all', '매출', '비용', '자산']

  return (
    <div className="space-y-2 max-w-md">
      {/* 검색 입력 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="검색..."
          className="pl-10 h-9"
        />
      </div>

      {/* 필터 뱃지 */}
      <div className="flex flex-wrap gap-1">
        {filters.map((item) => (
          <button
            key={item}
            onClick={() => setFilter(item)}
            className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
              filter === item
                ? 'bg-slate-900 text-white dark:bg-slate-600'
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
            }`}
          >
            {item === 'all' ? '전체' : item}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================
// 3. 금액 입력 폼
// ============================================
export function AmountForm() {
  const [amount, setAmount] = useState('')

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^\d]/g, '')
    setAmount(value ? parseInt(value).toLocaleString() : '')
  }

  // 저장 시 숫자로 변환: parseInt(amount.replace(/,/g, ''), 10)

  return (
    <div>
      <Label className="mb-2 block">금액</Label>
      <div className="max-w-xs">
        <Input
          value={amount}
          onChange={handleAmountChange}
          placeholder="0"
          className="text-right"
        />
      </div>
      <p className="text-xs text-muted-foreground mt-1">입력 시 자동으로 콤마 추가</p>
    </div>
  )
}

// ============================================
// 4. 셀렉트 폼
// ============================================
export function SelectForm() {
  return (
    <div>
      <Label className="mb-2 block">카테고리</Label>
      <Select>
        <SelectTrigger className="w-full max-w-xs">
          <SelectValue placeholder="카테고리 선택" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="category1">카테고리 1</SelectItem>
          <SelectItem value="category2">카테고리 2</SelectItem>
          <SelectItem value="category3">카테고리 3</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

// ============================================
// 5. 체크박스 그룹
// ============================================
export function CheckboxGroup() {
  return (
    <div>
      <Label className="mb-3 block">옵션 선택</Label>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox id="option1" />
          <label htmlFor="option1" className="text-sm">옵션 1</label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="option2" />
          <label htmlFor="option2" className="text-sm">옵션 2</label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="option3" defaultChecked />
          <label htmlFor="option3" className="text-sm">옵션 3 (기본 선택)</label>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 6. 모달 폼 (생성 모드)
// ============================================
/**
 * 모달 폼 스타일 가이드:
 *
 * DialogContent: className="max-h-[90vh] flex flex-col"
 * DialogHeader: className="flex-shrink-0 pb-4 border-b"
 * 본문 div: className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4"
 *   - px-1 -mx-1: 스크롤바가 내용과 겹치지 않도록 처리
 *   - py-4: 상하 여백
 * DialogFooter: className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t"
 *
 * label 스타일: className="text-xs text-slate-500 mb-1 block"
 *   - 필수 필드는 라벨 끝에 * 표시: "이름 *"
 *
 * 폼 필드 wrapper: <div> (space-y-2 불필요, label에 mb-1 있음)
 */
export function CreateModalForm() {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSave = async () => {
    setIsLoading(true)
    // API 호출
    setIsLoading(false)
    setOpen(false)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>모달 열기</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle>항목 추가</DialogTitle>
            <DialogDescription>새 항목의 정보를 입력하세요.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">이름 *</label>
              <Input placeholder="이름을 입력하세요" />
            </div>

            <div>
              <label className="text-xs text-slate-500 mb-1 block">설명</label>
              <Textarea placeholder="설명을 입력하세요..." rows={3} />
            </div>
          </div>

          {/* 생성 모드: 삭제 버튼 없음 */}
          <DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
            <div />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                저장
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================
// 7. 모달 폼 (수정 모드 - 삭제 버튼 포함)
// ============================================
export function EditModalForm() {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSave = async () => {
    setIsLoading(true)
    // API 호출
    setIsLoading(false)
    setOpen(false)
  }

  const handleDelete = async () => {
    // 삭제 로직
    setOpen(false)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>수정</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4 border-b">
            <DialogTitle>항목 수정</DialogTitle>
            <DialogDescription>항목 정보를 수정합니다.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1 py-4">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">이름 *</label>
              <Input defaultValue="기존 값" />
            </div>

            <div>
              <label className="text-xs text-slate-500 mb-1 block">설명</label>
              <Textarea defaultValue="기존 설명..." rows={3} />
            </div>
          </div>

          {/* 수정 모드: 삭제 버튼 좌측 */}
          <DialogFooter className="flex-row justify-between sm:justify-between flex-shrink-0 pt-4 border-t">
            <Button variant="destructive" onClick={handleDelete}>
              삭제
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                저장
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================
// 8. 인라인 추가 폼
// ============================================
export function InlineAddForm() {
  const [isAdding, setIsAdding] = useState(false)
  const [form, setForm] = useState({ name: '', date: '' })

  const handleSave = () => {
    // 저장 로직
    setIsAdding(false)
    setForm({ name: '', date: '' })
  }

  if (isAdding) {
    return (
      <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-2">
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="항목명"
          className="h-8 text-sm focus-visible:bg-white dark:focus-visible:bg-slate-700"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter' && form.name.trim()) handleSave()
            if (e.key === 'Escape') setIsAdding(false)
          }}
        />
        <div className="flex gap-2">
          <Input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="h-8 text-sm flex-1 focus-visible:bg-white dark:focus-visible:bg-slate-700"
          />
          <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => setIsAdding(false)}>
            취소
          </Button>
          <Button size="sm" className="h-8 px-3" disabled={!form.name.trim()} onClick={handleSave}>
            저장
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button size="sm" variant="ghost" onClick={() => setIsAdding(true)}>
      + 항목 추가
    </Button>
  )
}

// ============================================
// 9. 인라인 수정 폼 (삭제 버튼 포함)
// ============================================
export function InlineEditForm() {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', date: '' })

  const items = [
    { id: '1', name: '항목 1', date: '2025-03-15' },
    { id: '2', name: '항목 2', date: '2025-04-01' },
  ]

  const handleEdit = (item: typeof items[0]) => {
    setEditingId(item.id)
    setForm({ name: item.name, date: item.date })
  }

  const handleSave = () => {
    // 저장 로직
    setEditingId(null)
  }

  const handleDelete = () => {
    // 삭제 로직
    setEditingId(null)
  }

  return (
    <div className="space-y-2">
      {items.map((item) =>
        editingId === item.id ? (
          <div key={item.id} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-2">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="항목명"
              className="h-8 text-sm focus-visible:bg-white dark:focus-visible:bg-slate-700"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && form.name.trim()) handleSave()
                if (e.key === 'Escape') setEditingId(null)
              }}
            />
            <div className="flex gap-2">
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className="h-8 text-sm flex-1 focus-visible:bg-white dark:focus-visible:bg-slate-700"
              />
              {/* 버튼 크기 통일: h-8 px-3 */}
              <Button size="sm" variant="destructive" className="h-8 px-3" onClick={handleDelete}>
                삭제
              </Button>
              <Button size="sm" variant="outline" className="h-8 px-3" onClick={() => setEditingId(null)}>
                취소
              </Button>
              <Button size="sm" className="h-8 px-3" disabled={!form.name.trim()} onClick={handleSave}>
                저장
              </Button>
            </div>
          </div>
        ) : (
          <div
            key={item.id}
            onClick={() => handleEdit(item)}
            className="p-2 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{item.name}</span>
              <span className="text-sm text-muted-foreground">{item.date}</span>
            </div>
          </div>
        )
      )}
    </div>
  )
}

// ============================================
// 10. 커스텀 모달 (div 기반, 스크롤 지원)
// ============================================
/**
 * 커스텀 모달 패딩 패턴 (필수):
 *
 * 컨테이너: p-6 (전체 패딩)
 * ├── Header: pb-4 border-b (하단 패딩 + border)
 * ├── Body: py-4 -mx-6 px-6 (상하 패딩, 스크롤 시 좌우 유지)
 * └── Footer: pt-4 border-t (상단 패딩 + border)
 *
 * Input/Select/Textarea: border 없음, bg-slate-100 dark:bg-slate-700
 * 내부 필드 (카드 안): bg-white dark:bg-slate-600 (계층 구분)
 */
export function CustomModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleSave = async () => {
    setIsLoading(true)
    // API 호출
    setIsLoading(false)
    setIsOpen(false)
  }

  if (!isOpen) {
    return <Button onClick={() => setIsOpen(true)}>커스텀 모달 열기</Button>
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={() => setIsOpen(false)} />

      {/* Modal Container */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col overflow-hidden p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <h2 className="text-lg font-semibold">모달 제목</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body - 스크롤 가능 */}
        <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6 space-y-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">이름 *</label>
            <input
              type="text"
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none"
              placeholder="이름을 입력하세요"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">설명</label>
            <textarea
              className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-sm focus:bg-slate-50 dark:focus:bg-slate-600 focus:outline-none resize-none"
              rows={3}
              placeholder="설명을 입력하세요..."
            />
          </div>

          {/* 내부 카드 영역 (계층 구분 예시) */}
          <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-lg space-y-2">
            <span className="text-xs font-medium text-slate-500">항목</span>
            <select className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-600 rounded focus:bg-slate-50 dark:focus:bg-slate-500 focus:outline-none">
              <option>옵션 1</option>
              <option>옵션 2</option>
            </select>
            <input
              type="text"
              className="w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-600 rounded focus:bg-slate-50 dark:focus:bg-slate-500 focus:outline-none"
              placeholder="값 입력"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div />
          <div className="flex gap-2">
            <button
              onClick={() => setIsOpen(false)}
              className="px-4 py-2 text-sm bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={isLoading}
              className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50 flex items-center gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
