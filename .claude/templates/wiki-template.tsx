/**
 * 업무 위키 (Work Wiki) 템플릿
 *
 * 카드 내에서 노트를 추가/수정/삭제하는 인라인 폼 패턴
 * 파일 첨부 지원, 고정(pin) 기능, 검색, 페이지네이션 포함
 *
 * 사용 페이지:
 * - /etf/akros
 * - /etf/etc
 * - /tensoftworks/management
 */

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  StickyNote,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Paperclip,
  Pin,
  Pencil,
  X,
  Loader2,
} from 'lucide-react'

// ============================================
// 타입 정의
// ============================================
interface WikiNote {
  id: string
  title: string
  content: string
  is_pinned: boolean
  attachments?: { name: string; url: string }[]
  created_at: string
  updated_at: string
}

// ============================================
// 위키 카드 (전체 구조)
// ============================================
/**
 * 위키 카드 구조:
 * - CardHeader: 제목, 검색, 추가 버튼
 * - CardContent: 추가 폼 / 노트 목록 / 페이지네이션
 */
export function WikiCard() {
  // 상태
  const [wikiNotes, setWikiNotes] = useState<WikiNote[]>([])
  const [wikiSearch, setWikiSearch] = useState('')
  const [wikiPage, setWikiPage] = useState(1)
  const [isAddingNote, setIsAddingNote] = useState(false)
  const [editingNote, setEditingNote] = useState<WikiNote | null>(null)
  const [newNoteTitle, setNewNoteTitle] = useState('')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [newNoteFiles, setNewNoteFiles] = useState<File[]>([])
  const [isLoadingWiki, setIsLoadingWiki] = useState(false)
  const [isUploadingWiki, setIsUploadingWiki] = useState(false)

  const WIKI_PER_PAGE = 5

  // 필터링 및 페이지네이션
  const filteredWikiNotes = wikiNotes
    .filter((note) =>
      wikiSearch
        ? note.title.toLowerCase().includes(wikiSearch.toLowerCase()) ||
          note.content.toLowerCase().includes(wikiSearch.toLowerCase())
        : true
    )
    .sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })

  const totalWikiPages = Math.ceil(filteredWikiNotes.length / WIKI_PER_PAGE)
  const paginatedWikiNotes = filteredWikiNotes.slice(
    (wikiPage - 1) * WIKI_PER_PAGE,
    wikiPage * WIKI_PER_PAGE
  )

  // 핸들러 (실제 구현 시 API 호출)
  const handleAddNote = async () => {
    setIsUploadingWiki(true)
    // API 호출...
    setIsUploadingWiki(false)
    setIsAddingNote(false)
    setNewNoteTitle('')
    setNewNoteContent('')
    setNewNoteFiles([])
  }

  const handleUpdateNote = async (note: WikiNote) => {
    // API 호출...
    setEditingNote(null)
    setNewNoteFiles([])
  }

  const handleDeleteNote = async (id: string) => {
    // API 호출...
  }

  const handleTogglePin = async (note: WikiNote) => {
    // API 호출...
  }

  return (
    <Card className="bg-slate-100 dark:bg-slate-800">
      {/* 헤더 */}
      <CardHeader className="pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <StickyNote className="h-5 w-5" />
            <div>
              <CardTitle className="text-lg">업무 위키</CardTitle>
              <CardDescription className="text-sm">업무 관련 메모</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* 검색 */}
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="검색..."
                value={wikiSearch}
                onChange={(e) => {
                  setWikiSearch(e.target.value)
                  setWikiPage(1)
                }}
                className="pl-8 h-8 w-full sm:w-[150px]"
              />
            </div>
            {/* 추가 버튼 */}
            <Button
              size="sm"
              className="h-8"
              onClick={() => setIsAddingNote(true)}
              disabled={isAddingNote}
            >
              <Plus className="h-4 w-4 mr-1" />
              추가
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {/* 추가 폼 */}
        {isAddingNote && (
          <WikiAddForm
            title={newNoteTitle}
            setTitle={setNewNoteTitle}
            content={newNoteContent}
            setContent={setNewNoteContent}
            files={newNoteFiles}
            setFiles={setNewNoteFiles}
            onSave={handleAddNote}
            onCancel={() => {
              setIsAddingNote(false)
              setNewNoteTitle('')
              setNewNoteContent('')
              setNewNoteFiles([])
            }}
            isUploading={isUploadingWiki}
          />
        )}

        {/* 노트 목록 */}
        {isLoadingWiki ? (
          <div className="text-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-slate-400" />
          </div>
        ) : filteredWikiNotes.length === 0 && !isAddingNote ? (
          <WikiEmptyState hasSearch={!!wikiSearch} />
        ) : filteredWikiNotes.length > 0 ? (
          paginatedWikiNotes.map((note) => (
            <WikiNoteItem
              key={note.id}
              note={note}
              isEditing={editingNote?.id === note.id}
              editingNote={editingNote}
              setEditingNote={setEditingNote}
              newNoteFiles={newNoteFiles}
              setNewNoteFiles={setNewNoteFiles}
              onUpdate={handleUpdateNote}
              onDelete={handleDeleteNote}
              onTogglePin={handleTogglePin}
            />
          ))
        ) : null}

        {/* 페이지네이션 */}
        {filteredWikiNotes.length > 0 && (
          <WikiPagination
            currentPage={wikiPage}
            totalPages={totalWikiPages}
            totalItems={filteredWikiNotes.length}
            itemsPerPage={WIKI_PER_PAGE}
            onPageChange={setWikiPage}
          />
        )}
      </CardContent>
    </Card>
  )
}

// ============================================
// 추가 폼
// ============================================
/**
 * 스타일 규칙:
 * - 컨테이너: bg-white dark:bg-slate-700 rounded-lg p-3
 * - 입력 필드: 컴포넌트 기본값 (bg-slate-100)
 * - 파일 첨부 영역: bg-slate-100 dark:bg-slate-700
 * - 버튼: 우측 정렬 (취소, 저장)
 */
interface WikiAddFormProps {
  title: string
  setTitle: (value: string) => void
  content: string
  setContent: (value: string) => void
  files: File[]
  setFiles: React.Dispatch<React.SetStateAction<File[]>>
  onSave: () => void
  onCancel: () => void
  isUploading: boolean
}

export function WikiAddForm({
  title,
  setTitle,
  content,
  setContent,
  files,
  setFiles,
  onSave,
  onCancel,
  isUploading,
}: WikiAddFormProps) {
  return (
    <div className="rounded-lg p-3 bg-white dark:bg-slate-700">
      <div className="space-y-3">
        {/* 제목 */}
        <div>
          <label className="text-xs text-slate-500 mb-1 block">제목</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
            autoFocus
          />
        </div>

        {/* 내용 */}
        <div>
          <label className="text-xs text-slate-500 mb-1 block">내용</label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용을 입력하세요"
            rows={3}
            className="resize-none"
          />
        </div>

        {/* 파일 첨부 영역 */}
        <WikiFileUpload
          inputId="wiki-file-input-add"
          files={files}
          setFiles={setFiles}
        />
      </div>

      {/* 버튼 (우측 정렬) */}
      <div className="flex justify-end gap-2 mt-4 pt-3">
        <Button variant="outline" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={(!title.trim() && !content.trim() && files.length === 0) || isUploading}
        >
          {isUploading && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          {isUploading ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  )
}

// ============================================
// 수정 폼
// ============================================
/**
 * 스타일 규칙:
 * - 컨테이너: bg-white dark:bg-slate-700 rounded-lg p-3 -m-3 (부모 패딩 상쇄)
 * - 버튼: 좌측에 삭제, 우측에 취소/저장
 */
interface WikiEditFormProps {
  note: WikiNote
  setNote: (note: WikiNote | null) => void
  files: File[]
  setFiles: React.Dispatch<React.SetStateAction<File[]>>
  onSave: (note: WikiNote) => void
  onDelete: (id: string) => void
}

export function WikiEditForm({
  note,
  setNote,
  files,
  setFiles,
  onSave,
  onDelete,
}: WikiEditFormProps) {
  return (
    <div className="rounded-lg p-3 bg-white dark:bg-slate-700 -m-3">
      <div className="space-y-3">
        {/* 제목 */}
        <div>
          <label className="text-xs text-slate-500 mb-1 block">제목</label>
          <Input
            value={note.title}
            onChange={(e) => setNote({ ...note, title: e.target.value })}
          />
        </div>

        {/* 내용 */}
        <div>
          <label className="text-xs text-slate-500 mb-1 block">내용</label>
          <Textarea
            value={note.content}
            onChange={(e) => setNote({ ...note, content: e.target.value })}
            rows={3}
            className="resize-none"
          />
        </div>

        {/* 기존 첨부파일 (삭제 가능) */}
        {note.attachments && note.attachments.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-1">기존 첨부파일:</p>
            <div className="space-y-1">
              {note.attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-600 rounded px-2 py-1.5"
                >
                  <Paperclip className="h-3 w-3 text-slate-400" />
                  <a
                    href={att.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 truncate text-blue-600 hover:underline"
                  >
                    {att.name}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      const newAttachments = note.attachments?.filter((_, i) => i !== idx) || []
                      setNote({ ...note, attachments: newAttachments })
                    }}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 새 파일 추가 */}
        <WikiFileUpload
          inputId={`wiki-file-input-edit-${note.id}`}
          files={files}
          setFiles={setFiles}
        />
      </div>

      {/* 버튼 (삭제 좌측, 취소/저장 우측) */}
      <div className="flex justify-between gap-2 mt-4 pt-3">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm('정말 삭제하시겠습니까?')) {
              onDelete(note.id)
              setNote(null)
            }
          }}
        >
          삭제
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setNote(null)}>
            취소
          </Button>
          <Button size="sm" onClick={() => onSave(note)}>
            저장
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============================================
// 파일 업로드 영역
// ============================================
/**
 * 스타일 규칙:
 * - 컨테이너: bg-slate-100 dark:bg-slate-700 rounded-lg p-2
 * - 드래그 상태: bg-purple-100 dark:bg-purple-900/40
 * - 파일 목록: mt-2 space-y-1
 */
interface WikiFileUploadProps {
  inputId: string
  files: File[]
  setFiles: React.Dispatch<React.SetStateAction<File[]>>
  isDragging?: boolean
}

export function WikiFileUpload({ inputId, files, setFiles, isDragging }: WikiFileUploadProps) {
  return (
    <div>
      <span className="text-xs text-slate-500 mb-1 block">첨부 파일</span>
      {/* 업로드 버튼 */}
      <div
        className={`rounded-lg p-2 text-center transition-colors ${
          isDragging ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-slate-100 dark:bg-slate-700'
        }`}
      >
        <input
          type="file"
          id={inputId}
          multiple
          className="hidden"
          onChange={(e) => {
            const newFiles = Array.from(e.target.files || [])
            if (newFiles.length > 0) {
              setFiles((prev) => [...prev, ...newFiles])
            }
            e.target.value = ''
          }}
        />
        <label
          htmlFor={inputId}
          className="flex items-center justify-center gap-1 text-xs text-slate-500 cursor-pointer hover:text-slate-700 dark:hover:text-slate-300"
        >
          <Paperclip className="h-3 w-3" />
          <span>파일 첨부</span>
        </label>
      </div>

      {/* 새 파일 목록 */}
      {files.length > 0 && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-slate-400">새 첨부파일:</p>
          {files.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-600 rounded px-2 py-1.5"
            >
              <Paperclip className="h-3 w-3 text-slate-400" />
              <span className="flex-1 truncate">{file.name}</span>
              <span className="text-slate-400">({(file.size / 1024).toFixed(1)}KB)</span>
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, i) => i !== idx))}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================
// 노트 아이템 (보기 모드)
// ============================================
/**
 * 스타일 규칙:
 * - 컨테이너: bg-white dark:bg-slate-700 rounded-lg p-3
 * - 제목: font-medium text-sm
 * - 내용: text-xs text-slate-600 whitespace-pre-wrap line-clamp-3
 * - 첨부파일 배지: bg-slate-100 dark:bg-slate-600 rounded px-1.5 py-0.5
 * - 날짜: text-xs text-muted-foreground mt-2
 */
interface WikiNoteItemProps {
  note: WikiNote
  isEditing: boolean
  editingNote: WikiNote | null
  setEditingNote: (note: WikiNote | null) => void
  newNoteFiles: File[]
  setNewNoteFiles: React.Dispatch<React.SetStateAction<File[]>>
  onUpdate: (note: WikiNote) => void
  onDelete: (id: string) => void
  onTogglePin: (note: WikiNote) => void
}

export function WikiNoteItem({
  note,
  isEditing,
  editingNote,
  setEditingNote,
  newNoteFiles,
  setNewNoteFiles,
  onUpdate,
  onDelete,
  onTogglePin,
}: WikiNoteItemProps) {
  return (
    <div className="rounded-lg bg-white dark:bg-slate-700 p-3">
      {isEditing && editingNote ? (
        <WikiEditForm
          note={editingNote}
          setNote={setEditingNote}
          files={newNoteFiles}
          setFiles={setNewNoteFiles}
          onSave={onUpdate}
          onDelete={onDelete}
        />
      ) : (
        <div>
          {/* 헤더 */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {note.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
              <p className="font-medium text-sm">{note.title}</p>
            </div>
            <div className="flex items-center gap-1">
              {/* 고정 버튼 */}
              <button
                onClick={() => onTogglePin(note)}
                className={`p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 cursor-pointer ${
                  note.is_pinned ? 'text-amber-500' : 'text-slate-400'
                }`}
              >
                <Pin className="h-3 w-3" />
              </button>
              {/* 수정 버튼 */}
              <button
                onClick={() => setEditingNote(note)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-600 text-slate-400 cursor-pointer"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* 내용 */}
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-wrap line-clamp-3">
            {note.content}
          </p>

          {/* 첨부파일 배지 */}
          {note.attachments && note.attachments.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {note.attachments.map((att, idx) => (
                <a
                  key={idx}
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 dark:hover:bg-slate-500 rounded px-1.5 py-0.5 text-slate-600 dark:text-slate-300"
                >
                  <Paperclip className="h-2.5 w-2.5" />
                  <span className="max-w-[100px] truncate">{att.name}</span>
                </a>
              ))}
            </div>
          )}

          {/* 날짜 */}
          <p className="text-xs text-muted-foreground mt-2">
            {new Date(note.updated_at).toLocaleDateString('ko-KR')}
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================
// 빈 상태
// ============================================
export function WikiEmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="text-center py-8 text-muted-foreground">
      <StickyNote className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      <p className="text-sm">{hasSearch ? '검색 결과가 없습니다' : '등록된 메모가 없습니다'}</p>
      <p className="text-xs">상단의 추가 버튼을 눌러 메모를 작성하세요</p>
    </div>
  )
}

// ============================================
// 페이지네이션
// ============================================
interface WikiPaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  itemsPerPage: number
  onPageChange: (page: number) => void
}

export function WikiPagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: WikiPaginationProps) {
  const start = (currentPage - 1) * itemsPerPage + 1
  const end = Math.min(currentPage * itemsPerPage, totalItems)

  return (
    <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-600 mt-3">
      <p className="text-xs text-muted-foreground whitespace-nowrap">
        {start}-{end} / {totalItems}
      </p>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            «
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs px-2">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="rounded p-1 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="rounded px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            »
          </button>
        </div>
      )}
    </div>
  )
}
