import { Markdown } from '@tiptap/markdown'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Image from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold, ChevronLeft, ChevronRight, Code, FilePlus, FileText, Heading2, Heading3, Heading4,
  Image as ImageIcon, Italic, Link2, List, ListChecks, ListOrdered, Minus, Plus,
  Strikethrough, TextQuote, Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import { useLoad } from '../lib/useLoad'

interface DocNode {
  id: string
  parentId: string | null
  sortOrder: number
  icon: string | null
  title: string
}
interface DocFull extends DocNode {
  contentMarkdown: string
  updatedAt: number
}

/** อัปรูปขึ้น R2 แล้วคืน url (ใช้ทั้งปุ่ม toolbar และ paste/drop) */
async function uploadImage(file: File, docId: string): Promise<string | null> {
  if (!/^image\/(png|jpeg|gif|webp|avif)$/.test(file.type)) return null
  const fd = new FormData()
  fd.append('file', file)
  fd.append('docId', docId)
  const res = await fetch('/api/docs/images', { method: 'POST', body: fd })
  if (!res.ok) return null
  return ((await res.json()) as { url: string }).url
}

function Toolbar({ editor, docId, saveState }: { editor: Editor; docId: string; saveState: 'saved' | 'saving' }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const btn = (active: boolean) =>
    `w-8 h-8 grid place-items-center rounded-lg shrink-0 ${active ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'}`
  const divider = <span className="w-px h-5 bg-slate-200 mx-1 shrink-0" />
  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('ลิงก์ (เว้นว่าง = เอาออก)', prev ?? 'https://')
    if (url === null) return
    if (url === '') editor.chain().focus().unsetLink().run()
    else editor.chain().focus().setLink({ href: url }).run()
  }
  const pickImage = () => fileRef.current?.click()
  const onFile = async (f: File) => {
    const url = await uploadImage(f, docId)
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }
  return (
    <div className="flex items-center gap-0.5 border-b border-slate-200 px-2 sm:px-3 h-12 shrink-0 overflow-x-auto">
      {([2, 3, 4] as const).map((lv) => (
        <button key={lv} title={`หัวข้อ h${lv}`} onClick={() => editor.chain().focus().toggleHeading({ level: lv }).run()} className={btn(editor.isActive('heading', { level: lv }))}>
          {lv === 2 ? <Heading2 className="w-4 h-4" /> : lv === 3 ? <Heading3 className="w-4 h-4" /> : <Heading4 className="w-4 h-4" />}
        </button>
      ))}
      {divider}
      <button title="ตัวหนา" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}><Bold className="w-4 h-4" /></button>
      <button title="ตัวเอียง" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}><Italic className="w-4 h-4" /></button>
      <button title="ขีดฆ่า" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive('strike'))}><Strikethrough className="w-4 h-4" /></button>
      <button title="โค้ด" onClick={() => editor.chain().focus().toggleCode().run()} className={btn(editor.isActive('code'))}><Code className="w-4 h-4" /></button>
      {divider}
      <button title="รายการ" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}><List className="w-4 h-4" /></button>
      <button title="รายการมีลำดับ" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}><ListOrdered className="w-4 h-4" /></button>
      <button title="เช็คลิสต์" onClick={() => editor.chain().focus().toggleList('taskList', 'taskItem').run()} className={btn(editor.isActive('taskList'))}><ListChecks className="w-4 h-4" /></button>
      {divider}
      <button title="อ้างอิง" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive('blockquote'))}><TextQuote className="w-4 h-4" /></button>
      <button title="ลิงก์" onClick={setLink} className={btn(editor.isActive('link'))}><Link2 className="w-4 h-4" /></button>
      <button title="แทรกรูป (หรือวาง/ลากรูปลงในเนื้อหา)" onClick={pickImage} className={btn(false)}><ImageIcon className="w-4 h-4" /></button>
      <button title="เส้นคั่น" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={btn(false)}><Minus className="w-4 h-4" /></button>
      <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-400 shrink-0 pl-3">
        {saveState === 'saving' ? 'กำลังบันทึก…' : <><span className="text-emerald-500">✓</span> บันทึกแล้ว</>}
      </span>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/avif" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
    </div>
  )
}

function DocEditor({ doc, onMetaChanged }: { doc: DocFull; onMetaChanged: () => void }) {
  const [saveState, setSaveState] = useState<'saved' | 'saving'>('saved')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [title, setTitle] = useState(doc.title)

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Image,
        Placeholder.configure({ placeholder: 'เริ่มพิมพ์ได้เลย — ระบบบันทึกเป็น Markdown ให้อัตโนมัติ' }),
        Markdown,
      ],
      content: doc.contentMarkdown,
      contentType: 'markdown',
      editorProps: {
        attributes: { class: 'doc-editor focus:outline-hidden min-h-64' },
        handlePaste: (_view, event) => {
          const file = [...(event.clipboardData?.files ?? [])][0]
          if (file && file.type.startsWith('image/')) {
            void uploadImage(file, doc.id).then((url) => url && editor?.chain().focus().setImage({ src: url }).run())
            return true
          }
          return false
        },
        handleDrop: (_view, event) => {
          const file = [...(event.dataTransfer?.files ?? [])][0]
          if (file && file.type.startsWith('image/')) {
            event.preventDefault()
            void uploadImage(file, doc.id).then((url) => url && editor?.chain().focus().setImage({ src: url }).run())
            return true
          }
          return false
        },
      },
      onUpdate: ({ editor: ed }) => {
        setSaveState('saving')
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          void api
            .patch(`/api/docs/${doc.id}`, { contentMarkdown: ed.getMarkdown() })
            .then(() => setSaveState('saved'))
        }, 800)
      },
    },
    [doc.id],
  )

  // flush ก่อนสลับหน้า/ปิด (กัน autosave ค้าง)
  useEffect(() => {
    return () => {
      if (saveTimer.current && editor) {
        clearTimeout(saveTimer.current)
        void api.patch(`/api/docs/${doc.id}`, { contentMarkdown: editor.getMarkdown() })
      }
    }
  }, [doc.id, editor])

  useEffect(() => setTitle(doc.title), [doc.id, doc.title])
  const saveTitle = async () => {
    if (title.trim() && title !== doc.title) {
      await api.patch(`/api/docs/${doc.id}`, { title: title.trim() })
      onMetaChanged()
    }
  }

  if (!editor) return null
  return (
    <>
      <Toolbar editor={editor} docId={doc.id} saveState={saveState} />
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 sm:px-10 py-8">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => void saveTitle()}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            className="w-full text-3xl font-bold text-slate-900 leading-snug focus:outline-hidden"
            aria-label="ชื่อเอกสาร"
          />
          <div className="text-xs text-slate-400 mt-2 mb-5">บันทึกเป็น Markdown · แก้ล่าสุด {new Date(doc.updatedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
          <EditorContent editor={editor} />
        </div>
      </div>
    </>
  )
}

export function DocsPage() {
  const { data: nodes, reload: reloadTree } = useLoad<DocNode[]>(() => api.get('/api/docs'))
  const [selId, setSelId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [mobileView, setMobileView] = useState<'tree' | 'doc'>('tree')
  const { data: doc, reload: reloadDoc } = useLoad<DocFull | null>(
    () => (selId ? api.get(`/api/docs/${selId}`) : Promise.resolve(null)),
    [selId],
  )

  const children = useMemo(() => {
    const map = new Map<string | null, DocNode[]>()
    for (const n of nodes ?? []) {
      const key = n.parentId
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(n)
    }
    return map
  }, [nodes])

  const addDoc = useCallback(
    async (parentId: string | null) => {
      const title = window.prompt('ชื่อหน้าใหม่')
      if (!title?.trim()) return
      const created = await api.post<{ id: string }>('/api/docs', { title: title.trim(), ...(parentId ? { parentId } : {}) })
      if (parentId) setExpanded((s) => new Set(s).add(parentId))
      await reloadTree()
      setSelId(created.id)
      setMobileView('doc')
    },
    [reloadTree],
  )

  const deleteDoc = async () => {
    if (!doc) return
    if (!confirm(`ลบ "${doc.title}" และหน้าย่อยทั้งหมด?`)) return
    await api.delete(`/api/docs/${doc.id}`)
    setSelId(null)
    await reloadTree()
    setMobileView('tree')
  }

  const renderTree = (parentId: string | null, depth: number): React.ReactNode =>
    (children.get(parentId) ?? []).map((n) => {
      const kids = (children.get(n.id) ?? []).length > 0
      const open = expanded.has(n.id)
      const active = selId === n.id
      return (
        <div key={n.id}>
          <div
            onClick={() => { setSelId(n.id); setMobileView('doc') }}
            className={`group relative flex items-center gap-1.5 pr-7 py-1.5 rounded-lg cursor-pointer text-sm ${active ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-200/70'}`}
            style={{ paddingLeft: depth * 14 + 6 }}
          >
            {kids ? (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded((s) => { const next = new Set(s); if (next.has(n.id)) next.delete(n.id); else next.add(n.id); return next }) }}
                className="shrink-0 w-4 h-4 grid place-items-center text-slate-400 hover:text-slate-600"
                aria-label={open ? 'ยุบ' : 'กาง'}
              >
                <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}
            {n.icon ? <span className="shrink-0 text-sm leading-none">{n.icon}</span> : <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
            <span className="flex-1 min-w-0 truncate">{n.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); void addDoc(n.id) }}
              title="เพิ่มหน้าย่อย"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded text-slate-500 bg-slate-200 hover:bg-slate-300 opacity-0 group-hover:opacity-100"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {kids && open && renderTree(n.id, depth + 1)}
        </div>
      )
    })

  return (
    <>
      <PageHeader
        title="เอกสาร"
        action={
          <button onClick={() => void addDoc(null)} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg">
            <FilePlus className="w-4 h-4" /> เอกสารใหม่
          </button>
        }
      />
      <div className="p-3 sm:p-6">
        <div className="flex gap-4 sm:gap-5 h-[calc(100dvh-180px)] min-h-96">
          {/* tree บนพื้นหน้า (mockup) */}
          <div className={`${mobileView === 'doc' ? 'hidden' : 'flex'} lg:flex w-full lg:w-56 shrink-0 flex-col`}>
            <div className="flex items-center justify-between pl-1.5 pr-1 h-9 shrink-0">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">เอกสารทั้งหมด</span>
            </div>
            <div className="flex-1 overflow-y-auto py-1">
              {(nodes ?? []).length === 0 ? (
                <div className="text-sm text-slate-400 px-2 py-6">ยังไม่มีเอกสาร — กด "เอกสารใหม่" เริ่มหน้าแรก (เช่น คู่มือพนักงานใหม่)</div>
              ) : (
                renderTree(null, 0)
              )}
            </div>
          </div>
          {/* editor การ์ดขาว */}
          <div className={`${mobileView === 'tree' ? 'hidden' : 'flex'} lg:flex flex-1 min-w-0 flex-col bg-white rounded-lg shadow-xs overflow-hidden`}>
            {doc ? (
              <>
                <div className="lg:hidden flex items-center gap-1 px-2 pt-2">
                  <button onClick={() => setMobileView('tree')} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" aria-label="กลับไป tree">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button onClick={() => void deleteDoc()} className="ml-auto p-1.5 rounded-lg text-slate-300 hover:text-rose-600" title="ลบหน้านี้">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="hidden lg:flex justify-end px-3 pt-2 -mb-10 relative z-10">
                  <button onClick={() => void deleteDoc()} className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600" title="ลบหน้านี้ (รวมหน้าย่อย)">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <DocEditor key={doc.id} doc={doc} onMetaChanged={() => { void reloadTree(); void reloadDoc() }} />
              </>
            ) : (
              <div className="flex-1 grid place-items-center text-sm text-slate-400 p-10 text-center">
                เลือกหน้าเอกสารจากด้านซ้าย หรือสร้างหน้าใหม่<br />
                <span className="text-[11px]">เนื้อหาเก็บเป็น Markdown · แทน Notion ส่วนเอกสาร</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
