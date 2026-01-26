# 업무 위키 (Wiki)

카드 내에서 노트를 추가/수정/삭제하는 인라인 폼 패턴

## 사용 페이지

- `/etf/akros`
- `/etf/etc`
- `/tensoftworks/management`

---

## 위키 카드 구조

```tsx
<Card className="bg-slate-100 dark:bg-slate-800">
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
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="검색..." className="pl-8 h-8 w-[150px]" />
        </div>
        {/* 추가 버튼 */}
        <Button size="sm" className="h-8">
          <Plus className="h-4 w-4 mr-1" />
          추가
        </Button>
      </div>
    </div>
  </CardHeader>
  <CardContent className="pt-0 space-y-3">
    {/* 추가 폼 / 노트 목록 / 페이지네이션 */}
  </CardContent>
</Card>
```

---

## 추가 폼

> **배경색**: `bg-white dark:bg-slate-700`
> **버튼 정렬**: 우측 (취소, 저장)

```tsx
<div className="rounded-lg p-3 bg-white dark:bg-slate-700">
  <div className="space-y-3">
    <div>
      <label className="text-xs text-slate-500 mb-1 block">제목</label>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} />
    </div>
    <div>
      <label className="text-xs text-slate-500 mb-1 block">내용</label>
      <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} />
    </div>
    {/* 파일 첨부 영역 */}
    <WikiFileUpload />
  </div>

  {/* 버튼 (우측 정렬) */}
  <div className="flex justify-end gap-2 mt-4 pt-3">
    <Button variant="outline" size="sm">취소</Button>
    <Button size="sm">저장</Button>
  </div>
</div>
```

---

## 수정 폼

> **배경색**: `bg-white dark:bg-slate-700`
> **버튼 정렬**: 삭제 좌측, 취소/저장 우측

```tsx
<div className="rounded-lg p-3 bg-white dark:bg-slate-700 -m-3">
  <div className="space-y-3">
    {/* 입력 필드들 */}
  </div>

  {/* 버튼 (삭제 좌측, 취소/저장 우측) */}
  <div className="flex justify-between gap-2 mt-4 pt-3">
    <Button variant="destructive" size="sm">삭제</Button>
    <div className="flex gap-2">
      <Button variant="outline" size="sm">취소</Button>
      <Button size="sm">저장</Button>
    </div>
  </div>
</div>
```

---

## 파일 첨부 영역

```tsx
<div>
  <span className="text-xs text-slate-500 mb-1 block">첨부 파일</span>
  <div className={cn(
    'rounded-lg p-2 text-center transition-colors',
    isDragging ? 'bg-purple-100 dark:bg-purple-900/40' : 'bg-slate-100 dark:bg-slate-700'
  )}>
    <input type="file" id={inputId} multiple className="hidden" />
    <label
      htmlFor={inputId}
      className="flex items-center justify-center gap-1 text-xs text-slate-500 cursor-pointer hover:text-slate-700"
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
        <div className="flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-600 rounded px-2 py-1.5">
          <Paperclip className="h-3 w-3 text-slate-400" />
          <span className="flex-1 truncate">{file.name}</span>
          <span className="text-slate-400">({(file.size / 1024).toFixed(1)}KB)</span>
          <button onClick={() => removeFile(idx)}>
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )}
</div>
```

---

## 노트 아이템 (보기 모드)

```tsx
<div className="rounded-lg bg-white dark:bg-slate-700 p-3">
  {/* 헤더 */}
  <div className="flex items-start justify-between gap-2">
    <div className="flex items-center gap-2">
      {note.is_pinned && <Pin className="h-3 w-3 text-amber-500" />}
      <p className="font-medium text-sm">{note.title}</p>
    </div>
    <div className="flex items-center gap-1">
      <button className={cn('p-1 rounded hover:bg-slate-100', note.is_pinned ? 'text-amber-500' : 'text-slate-400')}>
        <Pin className="h-3 w-3" />
      </button>
      <button className="p-1 rounded hover:bg-slate-100 text-slate-400">
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  </div>

  {/* 내용 */}
  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-wrap line-clamp-3">
    {note.content}
  </p>

  {/* 첨부파일 배지 */}
  {note.attachments?.length > 0 && (
    <div className="mt-2 flex flex-wrap gap-1">
      {note.attachments.map((att) => (
        <a
          href={att.url}
          target="_blank"
          className="inline-flex items-center gap-1 text-xs bg-slate-100 dark:bg-slate-600 hover:bg-slate-200 rounded px-1.5 py-0.5"
        >
          <Paperclip className="h-2.5 w-2.5" />
          <span>{att.name}</span>  {/* truncate 하지 않음 */}
        </a>
      ))}
    </div>
  )}

  {/* 날짜 */}
  <p className="text-xs text-muted-foreground mt-2">
    {new Date(note.updated_at).toLocaleDateString('ko-KR')}
  </p>
</div>
```

---

## 빈 상태

```tsx
<div className="text-center py-8 text-muted-foreground">
  <StickyNote className="h-8 w-8 mx-auto mb-2 text-slate-300" />
  <p className="text-sm">{hasSearch ? '검색 결과가 없습니다' : '등록된 메모가 없습니다'}</p>
  <p className="text-xs">상단의 추가 버튼을 눌러 메모를 작성하세요</p>
</div>
```

---

## 스타일 규칙

| 요소 | 규칙 |
|------|------|
| 첨부파일명 | **truncate 하지 않음** (사용자가 파일 이름 확인 필요) |
| 추가 폼 버튼 | 우측 정렬 (취소, 저장) |
| 수정 폼 버튼 | 좌측 삭제, 우측 취소/저장 |
| 고정(pin) 아이콘 | `text-amber-500` (고정됨), `text-slate-400` (미고정) |
| 드래그 오버 상태 | `bg-purple-100 dark:bg-purple-900/40` |

---

## 정렬 규칙

```tsx
// 고정 노트 우선, 최신 수정순
notes.sort((a, b) => {
  if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
})
```
