'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { cn } from '@/lib/utils'
import { Bold, Italic, List, ListOrdered, Heading2, Undo, Redo, Minus } from 'lucide-react'

interface TiptapEditorProps {
  content: string
  onChange: (content: string) => void
  placeholder?: string
  className?: string
  editorClassName?: string
  minHeight?: string
}

const MenuButton = ({
  onClick,
  isActive = false,
  disabled = false,
  children
}: {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "p-1.5 rounded transition-colors",
      isActive
        ? "bg-slate-300 dark:bg-slate-500 text-slate-900 dark:text-white"
        : "hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-400",
      disabled && "opacity-50 cursor-not-allowed"
    )}
  >
    {children}
  </button>
)

const MenuBar = ({ editor }: { editor: Editor | null }) => {
  if (!editor) return null

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-1.5 bg-slate-50 dark:bg-slate-600 rounded-t-md">
      <MenuButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
      >
        <Bold className="h-4 w-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
      >
        <Italic className="h-4 w-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
      >
        <Heading2 className="h-4 w-4" />
      </MenuButton>
      <div className="w-px h-4 bg-slate-300 dark:bg-slate-500 mx-1" />
      <MenuButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
      >
        <List className="h-4 w-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
      >
        <ListOrdered className="h-4 w-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        <Minus className="h-4 w-4" />
      </MenuButton>
      <div className="w-px h-4 bg-slate-300 dark:bg-slate-500 mx-1" />
      <MenuButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
      >
        <Undo className="h-4 w-4" />
      </MenuButton>
      <MenuButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
      >
        <Redo className="h-4 w-4" />
      </MenuButton>
    </div>
  )
}

export function TiptapEditor({
  content,
  onChange,
  placeholder = '내용을 입력하세요...',
  className,
  editorClassName,
  minHeight = '100px'
}: TiptapEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: cn(
          'focus:outline-none text-xs',
          'min-h-[var(--editor-min-height)] px-3 py-2',
          editorClassName
        ),
      },
    },
  })

  return (
    <div
      className={cn(
        "!border-0 rounded-md bg-slate-100 dark:bg-slate-700 overflow-hidden transition-colors",
        "focus-within:bg-slate-50 dark:focus-within:bg-slate-600",
        className
      )}
      style={{ '--editor-min-height': minHeight } as React.CSSProperties}
    >
      <MenuBar editor={editor} />
      <EditorContent editor={editor} />
      <style jsx global>{`
        .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #94a3b8;
          pointer-events: none;
          height: 0;
        }
        .dark .tiptap p.is-editor-empty:first-child::before {
          color: #64748b;
        }
        .tiptap {
          outline: none;
          line-height: 1.5;
        }
        .tiptap p {
          margin: 0.375rem 0;
          min-height: 1.5em;
        }
        .tiptap h1 {
          font-size: 1rem;
          font-weight: 700;
          margin: 0.625rem 0 0.375rem;
        }
        .tiptap h2 {
          font-size: 0.875rem;
          font-weight: 600;
          margin: 0.5rem 0 0.25rem;
        }
        .tiptap h3 {
          font-size: 0.8125rem;
          font-weight: 600;
          margin: 0.5rem 0 0.25rem;
        }
        .tiptap ul {
          list-style-type: disc;
          padding-left: 1.25rem;
          margin: 0.375rem 0;
        }
        .tiptap ol {
          list-style-type: decimal;
          padding-left: 1.25rem;
          margin: 0.375rem 0;
        }
        .tiptap li {
          margin: 0.25rem 0;
        }
        .tiptap li p {
          margin: 0;
        }
        .tiptap strong {
          font-weight: 600;
        }
        .tiptap em {
          font-style: italic;
        }
        .tiptap s {
          text-decoration: line-through;
        }
        .tiptap code {
          background-color: #f1f5f9;
          color: #e11d48;
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-size: 0.6875rem;
          font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
        }
        .dark .tiptap code {
          background-color: #334155;
          color: #fb7185;
        }
        .tiptap pre {
          background-color: #f1f5f9;
          padding: 0.75rem;
          border-radius: 0.375rem;
          margin: 0.5rem 0;
          overflow-x: auto;
        }
        .dark .tiptap pre {
          background-color: #1e293b;
        }
        .tiptap pre code {
          background: none;
          color: inherit;
          padding: 0;
          font-size: 0.6875rem;
        }
        .tiptap blockquote {
          border-left: 3px solid #cbd5e1;
          padding-left: 0.75rem;
          margin: 0.5rem 0;
          color: #64748b;
        }
        .dark .tiptap blockquote {
          border-left-color: #475569;
          color: #94a3b8;
        }
        .tiptap hr {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 0.5rem 0;
        }
        .dark .tiptap hr {
          border-top-color: #475569;
        }
      `}</style>
    </div>
  )
}

// HTML을 일반 텍스트로 변환하는 유틸리티
export function htmlToPlainText(html: string): string {
  const tmp = document.createElement('div')
  tmp.innerHTML = html
  return tmp.textContent || tmp.innerText || ''
}

// 마크다운 감지 패턴
const MARKDOWN_PATTERNS = /^#{1,6}\s|^\*\*|^-{3,}|^\*\s|^-\s|^\d+\.\s|^>\s|```|^\|/m

// 일반 텍스트/마크다운을 HTML로 변환
export function plainTextToHtml(text: string): string {
  if (!text) return ''
  // 이미 HTML인 경우 그대로 반환
  if (text.startsWith('<')) return text
  // 마크다운 패턴이 있으면 마크다운으로 파싱
  if (MARKDOWN_PATTERNS.test(text)) {
    return markdownToHtml(text)
  }
  // 순수 텍스트: 줄바꿈을 <p> 태그로 변환
  return text
    .split('\n')
    .map(line => `<p>${line || '<br>'}</p>`)
    .join('')
}

// 마크다운을 HTML로 변환 (동기)
import { marked } from 'marked'

marked.setOptions({
  breaks: true,
  gfm: true,
})

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false }) as string
}
