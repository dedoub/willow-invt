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
import { Search, Loader2 } from 'lucide-react'

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
// 6. 모달 폼
// ============================================
export function ModalForm() {
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>항목 추가</DialogTitle>
            <DialogDescription>새 항목의 정보를 입력하세요.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">이름</Label>
              <Input placeholder="이름을 입력하세요" />
            </div>

            <div>
              <Label className="mb-2 block">설명</Label>
              <Textarea placeholder="설명을 입력하세요..." rows={3} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ============================================
// 7. 인라인 편집 폼 (카드 내)
// ============================================
export function InlineEditForm() {
  const [isEditing, setIsEditing] = useState(false)
  const [value, setValue] = useState('초기값')

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="flex-1"
        />
        <Button size="sm" onClick={() => setIsEditing(false)}>저장</Button>
        <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
          취소
        </Button>
      </div>
    )
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      className="p-2 rounded cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700"
    >
      {value}
    </div>
  )
}
