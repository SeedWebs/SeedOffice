import {
  ArrowLeft,
  ChevronDown,
  Inbox as InboxIcon,
  Mail,
  Paperclip,
  PenLine,
  Search,
  Send,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import { useLoad } from '../lib/useLoad'

/**
 * อีเมลกลาง (SPEC §4.12 · E3) — layout แนว Help Scout ตาม mockup
 * list ตาราง + folder bar + ตัวเลือกกล่อง · detail = อีเมลเต็ม + ช่องตอบกว้าง + พาเนลลูกค้า
 * body อีเมลเป็น HTML ภายนอก → render ใน iframe sandbox (กัน XSS — script รันไม่ได้)
 */

interface MailboxOpt {
  id: string
  name: string
  companyLabel: string
  emailAddress: string | null
  unread: number
}
interface ThreadRow {
  id: string
  number: number
  mailboxId: string
  subject: string
  contactEmail: string | null
  status: 'open' | 'snoozed' | 'closed' | 'spam'
  unread: boolean
  assigneeId: string | null
  lastMessageAt: string
  preview: string | null
  latestFrom: string | null
  hasAttachment: number
}
interface Counts {
  unassigned: number
  mine: number
  drafts: number
  assigned: number
  closed: number
  spam: number
  all: number
}
interface ListData {
  threads: ThreadRow[]
  counts: Counts
  mailboxes: MailboxOpt[]
}
interface Msg {
  id: string
  direction: 'in' | 'out'
  fromAddr: string
  toAddr: string
  ccAddr: string | null
  snippet: string
  sentAt: string
  body: { content: string; contentType: string } | null
  attachments: { id: string; filename: string; mime: string; sizeBytes: number }[]
}
interface DetailData {
  thread: ThreadRow
  messages: Msg[]
  client: { id: string; name: string; logo: string | null } | null
  past: { items: { id: string; subject: string; lastMessageAt: string }[]; total: number }
}
interface UserOpt {
  id: string
  name: string
  role: 'owner' | 'member' | 'vendor'
}

const FOLDERS = [
  { k: 'unassigned', name: 'ยังไม่มอบหมาย' },
  { k: 'mine', name: 'ของฉัน' },
  { k: 'drafts', name: 'ฉบับร่าง' },
  { k: 'assigned', name: 'มอบหมายแล้ว' },
  { k: 'closed', name: 'ปิดแล้ว' },
  { k: 'spam', name: 'สแปม' },
  { k: 'all', name: 'ทั้งหมด' },
] as const
type FolderKey = (typeof FOLDERS)[number]['k']

const DOTS = ['bg-brand-500', 'bg-sky-500', 'bg-amber-500', 'bg-violet-500', 'bg-rose-500']

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  open: { label: 'รอตอบ', cls: 'bg-amber-100 text-amber-700' },
  snoozed: { label: 'เลื่อนไว้', cls: 'bg-sky-100 text-sky-700' },
  closed: { label: 'ปิดแล้ว', cls: 'bg-slate-100 text-slate-600' },
  spam: { label: 'สแปม', cls: 'bg-rose-100 text-rose-600' },
}

/** "ชื่อ <a@b>" → ชื่อ (ไม่มีชื่อ = อีเมล) */
const displayName = (addr: string | null) => {
  if (!addr) return '—'
  const m = /^"?(.*?)"?\s*<[^>]+>$/.exec(addr.trim())
  return m?.[1] || addr.trim()
}

/** รอแล้วนานเท่าไหร่ — แบบ mockup ("4 ชม." / "6 มิ.ย.") */
const THM = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function waitLabel(iso: string): string {
  const d = new Date(iso)
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60_000))
  if (mins < 60) return `${mins} นาที`
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} ชม.`
  return `${d.getDate()} ${THM[d.getMonth()]}`
}
function dtLabel(iso: string): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return `วันนี้ ${time}`
  return `${d.getDate()} ${THM[d.getMonth()]} ${time}`
}

/** body อีเมล (HTML ภายนอก) — iframe sandbox: script รันไม่ได้ ลิงก์เปิดแท็บใหม่ */
function EmailFrame({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(120)
  const doc = `<!doctype html><html><head><base target="_blank"><style>
    body{margin:0;font:14px/1.6 -apple-system,'Segoe UI',sans-serif;color:#334155;word-break:break-word}
    img{max-width:100%;height:auto} a{color:#0d9488}
  </style></head><body>${html}</body></html>`
  return (
    <iframe
      ref={ref}
      title="เนื้อหาอีเมล"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
      className="w-full border-0"
      style={{ height }}
      onLoad={() => {
        const h = ref.current?.contentDocument?.body?.scrollHeight
        if (h) setHeight(Math.min(h + 24, 1600))
      }}
    />
  )
}

function MailboxSelector({
  mailboxes,
  sel,
  onPick,
}: {
  mailboxes: MailboxOpt[]
  sel: string
  onPick: (k: string) => void
}) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const close = () => setOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])
  const total = mailboxes.reduce((s, m) => s + m.unread, 0)
  const cur = mailboxes.find((m) => m.id === sel)
  const dotOf = (id: string) => DOTS[mailboxes.findIndex((m) => m.id === id) % DOTS.length]
  const groups = [...new Set(mailboxes.map((m) => m.companyLabel))]
  const row = (key: string, dot: string, name: string, unread: number, bold = false) => (
    <button
      key={key}
      onClick={() => {
        onPick(key)
        setOpen(false)
      }}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-slate-50 ${sel === key ? 'bg-slate-50' : ''}`}
    >
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className={`flex-1 text-left text-sm ${bold ? 'font-medium ' : ''}text-slate-700`}>{name}</span>
      <span className={`text-[11px] ${unread ? 'bg-rose-100 text-rose-600' : 'text-slate-300'} px-1.5 rounded-full`}>
        {unread}
      </span>
    </button>
  )
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm border border-slate-200 bg-white rounded-lg pl-3 pr-2 py-2 hover:bg-slate-50"
      >
        <InboxIcon className="w-4 h-4 text-slate-400" />
        <span className="font-medium text-slate-700">{cur ? cur.name : 'ทั้งหมด'}</span>
        <span className="text-[11px] bg-rose-100 text-rose-600 px-1.5 rounded-full">
          {cur ? cur.unread : total}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-lg border border-slate-200 p-1.5 z-50">
          {row('all', 'bg-slate-300', 'ทั้งหมด', total, true)}
          <div className="my-1 border-t border-slate-100" />
          {groups.map((g) => (
            <div key={g}>
              <div className="px-2.5 pt-2 pb-1 text-[10px] font-medium text-slate-400 uppercase tracking-wide">
                {g}
              </div>
              {mailboxes
                .filter((m) => m.companyLabel === g)
                .map((m) => row(m.id, dotOf(m.id) ?? 'bg-slate-300', m.name, m.unread))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** เมนูเปลี่ยนสถานะ + มอบหมาย ใน detail header */
function ThreadActions({
  thread,
  onChanged,
}: {
  thread: ThreadRow
  onChanged: () => void
}) {
  const [menu, setMenu] = useState<'status' | 'assign' | null>(null)
  const { data: userOpts } = useLoad<UserOpt[]>(() => api.get('/api/users'))
  useEffect(() => {
    const close = () => setMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])
  const patch = async (body: Record<string, unknown>) => {
    await api.patch(`/api/inbox/threads/${thread.id}`, body)
    setMenu(null)
    onChanged()
  }
  const pill = STATUS_PILL[thread.status] ?? STATUS_PILL.open!
  const team = (userOpts ?? []).filter((u) => u.role !== 'vendor')
  const assignee = team.find((u) => u.id === thread.assigneeId)
  const statusItems: { label: string; body: Record<string, unknown> }[] =
    thread.status === 'open'
      ? [
          { label: 'ปิดเรื่อง', body: { status: 'closed' } },
          { label: 'ทำเครื่องหมายสแปม', body: { status: 'spam' } },
        ]
      : thread.status === 'spam'
        ? [{ label: 'ไม่ใช่สแปม — เปิดกลับ', body: { status: 'open' } }]
        : [{ label: 'เปิดเรื่องใหม่', body: { status: 'open' } }]
  const item = (label: string, onClick: () => void, active = false) => (
    <button
      key={label}
      onClick={onClick}
      className={`w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-slate-50 ${active ? 'bg-slate-50 font-medium' : 'text-slate-700'}`}
    >
      {label}
    </button>
  )
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="relative">
        <button
          onClick={() => setMenu(menu === 'status' ? null : 'status')}
          className={`flex items-center gap-1 text-sm rounded-full px-3 py-1.5 ${pill.cls}`}
        >
          {pill.label} <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {menu === 'status' && (
          <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-lg border border-slate-200 p-1.5 z-50">
            {statusItems.map((s) => item(s.label, () => void patch(s.body)))}
          </div>
        )}
      </div>
      <div className="relative">
        <button
          title="มอบหมาย"
          onClick={() => setMenu(menu === 'assign' ? null : 'assign')}
          className={`h-8 px-2 grid place-items-center rounded-lg hover:bg-slate-100 text-sm ${assignee ? 'text-slate-700' : 'text-slate-500'}`}
        >
          {assignee ? (
            <span className="flex items-center gap-1">
              <UserPlus className="w-4 h-4" /> {assignee.name}
            </span>
          ) : (
            <UserPlus className="w-4 h-4" />
          )}
        </button>
        {menu === 'assign' && (
          <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-lg border border-slate-200 p-1.5 z-50 max-h-72 overflow-y-auto">
            {item('— ไม่มอบหมาย', () => void patch({ assigneeId: null }), !thread.assigneeId)}
            {team.map((u) =>
              item(u.name, () => void patch({ assigneeId: u.id }), u.id === thread.assigneeId),
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ThreadDetail({
  id,
  mailboxes,
  onBack,
  onOpenThread,
  onChanged,
}: {
  id: string
  mailboxes: MailboxOpt[]
  onBack: () => void
  onOpenThread: (id: string) => void
  onChanged: () => void
}) {
  const { data, loading, reload } = useLoad<DetailData>(
    () => api.get(`/api/inbox/threads/${id}`),
    [id],
  )
  useEffect(() => {
    if (data) onChanged() // เปิดแล้ว server mark read — ให้ list/badge รีเฟรช
  }, [data?.thread.id])
  if (loading || !data)
    return <div className="p-10 text-center text-sm text-slate-400">กำลังโหลดอีเมล…</div>
  const { thread, messages, client, past } = data
  const mailbox = mailboxes.find((m) => m.id === thread.mailboxId)
  return (
    <div className="flex">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
          <button
            onClick={onBack}
            className="w-8 h-8 grid place-items-center rounded-lg hover:bg-slate-100 text-slate-500"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="font-semibold text-slate-900 truncate flex-1">
            {thread.subject || '(ไม่มีหัวข้อ)'}
            <span className="ml-2 text-xs font-normal text-slate-400 tabular-nums">#{thread.number}</span>
          </div>
          <ThreadActions
            thread={thread}
            onChanged={() => {
              void reload()
              onChanged()
            }}
          />
        </div>

        <div className="flex-1 p-5 bg-slate-50/40 space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`bg-white border rounded-xl p-4 max-w-3xl ${m.direction === 'out' ? 'border-brand-200 ml-6' : 'border-slate-200'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-slate-800">
                  {displayName(m.fromAddr)}
                  {m.direction === 'out' && (
                    <span className="ml-2 text-[10px] font-medium bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded">
                      ทีมเรา
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400 shrink-0">{dtLabel(m.sentAt)}</div>
              </div>
              <div className="text-xs text-slate-400 mt-1">
                <span>ถึง</span> {m.toAddr || '—'}
              </div>
              {m.ccAddr && (
                <div className="text-xs text-slate-400 mt-0.5">
                  <span>Cc</span> {m.ccAddr}
                </div>
              )}
              <hr className="my-3 border-slate-100" />
              {m.body ? (
                m.body.contentType.includes('html') ? (
                  <EmailFrame html={m.body.content} />
                ) : (
                  <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
                    {m.body.content}
                  </div>
                )
              ) : (
                <div className="text-sm text-slate-400">{m.snippet || '(ไม่มีเนื้อหา)'}</div>
              )}
              {m.attachments.length > 0 && (
                <div className="mt-3">
                  {m.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/inbox/attachments/${a.id}/download`}
                      className="inline-flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 text-sm text-brand-700 mt-1 mr-2 hover:bg-slate-50"
                    >
                      <Paperclip className="w-4 h-4 text-slate-400" />
                      {a.filename}
                      <span className="text-[10px] text-slate-400">
                        {(a.sizeBytes / 1024).toFixed(0)} KB
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ช่องตอบกว้าง — ปุ่มส่งเปิดใช้ใน E4 */}
        <div className="p-3 border-t border-slate-200">
          <div className="border border-slate-200 rounded-xl p-3">
            <div className="text-[11px] text-slate-400 mb-2">
              ตอบกลับ {thread.contactEmail ?? '—'} · ส่งจาก{' '}
              <span className="text-slate-500">{mailbox?.emailAddress ?? mailbox?.name ?? '—'}</span>
            </div>
            <textarea
              className="w-full h-28 resize-none text-sm focus:outline-hidden"
              placeholder="เขียนคำตอบ... (เขียนยาวได้เต็มที่)"
            />
            <div className="flex items-center justify-end pt-1">
              <button
                disabled
                title="การส่งอีเมลเปิดใช้ในเฟสถัดไป (E4)"
                className="bg-brand-600 disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" /> ส่ง
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* พาเนลขวา: การ์ดลูกค้า + อีเมลที่ผ่านมา */}
      <div className="hidden md:block w-72 border-l border-slate-200 p-4 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-linear-to-br from-sky-200 to-violet-300 grid place-items-center text-lg shrink-0">
            {client?.logo ?? ''}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 truncate">
              {client?.name ?? displayName(messages.find((m) => m.direction === 'in')?.fromAddr ?? thread.contactEmail)}
            </div>
            {client && (
              <Link to={`/clients/${client.id}`} className="text-[11px] text-brand-600 hover:underline">
                เปิดหน้าลูกค้า →
              </Link>
            )}
          </div>
        </div>
        <div className="mt-2">
          <span className="text-sm text-brand-600 break-all">{thread.contactEmail ?? '—'}</span>
        </div>
        <div className="mt-5">
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">
            อีเมลที่ผ่านมา
          </div>
          {past.items.length === 0 && <div className="text-xs text-slate-400 px-2 py-2">— ไม่มี</div>}
          {past.items.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpenThread(p.id)}
              className="w-full flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 text-left text-xs text-slate-600"
            >
              <Mail className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
              <span className="line-clamp-2">{p.subject || '(ไม่มีหัวข้อ)'}</span>
            </button>
          ))}
          {past.total > past.items.length && (
            <div className="px-2 py-2 text-xs text-slate-400">ทั้งหมด {past.total} เรื่อง</div>
          )}
        </div>
      </div>
    </div>
  )
}

export function InboxPage() {
  const [mb, setMb] = useState<string>('all')
  const [folder, setFolder] = useState<FolderKey>('unassigned')
  const [q, setQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const params = new URLSearchParams({ folder })
  if (mb !== 'all') params.set('mailbox', mb)
  if (q) params.set('q', q)
  const { data, loading, reload } = useLoad<ListData>(
    () => api.get(`/api/inbox/threads?${params.toString()}`),
    [mb, folder, q],
  )

  // ⌘K / Ctrl+K — เช็คจาก e.code กันแป้นไทย (CLAUDE.md)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchRef.current?.focus(), 50)
      }
      if (e.code === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const mailboxes = data?.mailboxes ?? []
  const counts = data?.counts
  const curBox = mailboxes.find((m) => m.id === mb)
  const dotOf = (id: string) => DOTS[mailboxes.findIndex((m) => m.id === id) % DOTS.length]

  return (
    <>
      <PageHeader
        title={curBox?.name ?? 'อีเมลกลาง'}
        action={
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSearchOpen(true)
                setTimeout(() => searchRef.current?.focus(), 50)
              }}
              title="ค้นหา (⌘K)"
              className="w-9 h-9 grid place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              disabled
              title="เขียนอีเมลใหม่ — เปิดใช้ใน E4"
              className="w-9 h-9 grid place-items-center rounded-lg border border-slate-200 bg-white text-slate-300"
            >
              <PenLine className="w-4 h-4" />
            </button>
            <MailboxSelector
              mailboxes={mailboxes}
              sel={mb}
              onPick={(k) => {
                setMb(k)
                setOpenId(null)
              }}
            />
          </div>
        }
      />
      <div className="p-3 sm:p-6">
        {/* folder bar (segmented ใต้ h1 — SPEC §4.12) */}
        <div className="flex flex-nowrap items-center gap-1 bg-slate-100 rounded-xl p-1 mb-4 w-full sm:w-fit overflow-x-auto">
          {FOLDERS.map((f) => {
            const n = counts?.[f.k] ?? 0
            const act = folder === f.k
            return (
              <button
                key={f.k}
                onClick={() => {
                  setFolder(f.k)
                  setOpenId(null)
                }}
                className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${act ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {f.name}
                {n > 0 && (
                  <span className={`text-[11px] ${act ? 'text-brand-600' : 'text-slate-400'} tabular-nums`}>
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {q && (
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
            ผลค้นหา: <span className="font-medium text-slate-700">"{q}"</span>
            <button onClick={() => setQ('')} className="text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-xs overflow-hidden">
          {openId ? (
            <ThreadDetail
              id={openId}
              mailboxes={mailboxes}
              onBack={() => setOpenId(null)}
              onOpenThread={setOpenId}
              onChanged={() => void reload()}
            />
          ) : loading ? (
            <div className="p-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
          ) : (data?.threads.length ?? 0) === 0 ? (
            <div className="p-12 text-center text-sm text-slate-400">
              <Mail className="w-7 h-7 mx-auto mb-2 text-slate-300" />
              {mailboxes.length === 0
                ? 'ยังไม่ได้เชื่อมกล่องเมล — เริ่มที่ ตั้งค่า → อีเมลกลาง'
                : 'ไม่มีอีเมลในกล่องนี้'}
            </div>
          ) : (
            <>
              <div className="hidden sm:grid sm:grid-cols-[22px_minmax(0,1.3fr)_minmax(0,3fr)_72px_72px] items-center gap-3 px-4 py-2.5 border-b border-slate-200 text-xs text-slate-400">
                <span />
                <span>ลูกค้า</span>
                <span>เรื่อง</span>
                <span>เลขที่</span>
                <span>รอแล้ว</span>
              </div>
              <div>
                {(data?.threads ?? []).map((t) => (
                  <div
                    key={t.id}
                    onClick={() => setOpenId(t.id)}
                    className={`grid grid-cols-[22px_minmax(0,1fr)_56px] sm:grid-cols-[22px_minmax(0,1.3fr)_minmax(0,3fr)_72px_72px] items-center gap-3 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${t.unread ? 'bg-brand-50/30' : ''}`}
                  >
                    <input
                      type="checkbox"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-xs border-slate-300 w-4 h-4 sm:order-1"
                    />
                    <div className="min-w-0 sm:contents">
                      <div
                        className={`text-[11px] font-medium text-slate-500 truncate sm:order-2 sm:text-sm ${t.unread ? 'sm:font-bold' : 'sm:font-semibold'} sm:text-slate-800`}
                      >
                        {displayName(t.latestFrom) !== '—'
                          ? displayName(t.latestFrom)
                          : (t.contactEmail ?? '—')}
                      </div>
                      <div className="min-w-0 sm:order-3">
                        <div
                          className={`text-sm text-slate-800 truncate flex items-center gap-1.5 ${t.unread ? 'font-bold' : 'font-semibold'}`}
                        >
                          {t.subject || '(ไม่มีหัวข้อ)'}
                          {t.hasAttachment ? (
                            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {mb === 'all' && (
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full ${dotOf(t.mailboxId)} mr-1.5 align-middle`}
                            />
                          )}
                          {t.preview ?? ''}
                        </div>
                      </div>
                    </div>
                    <div className="hidden sm:block sm:order-4 text-sm text-slate-400 tabular-nums">
                      {t.number}
                    </div>
                    <div className="text-[11px] sm:text-sm text-slate-400 text-right sm:text-left whitespace-nowrap sm:order-5">
                      {waitLabel(t.lastMessageAt)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ค้นหา ⌘K */}
      {searchOpen && (
        <div
          className="fixed inset-0 bg-slate-900/30 z-50 grid place-items-start justify-center pt-28"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-[34rem] max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-2">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                ref={searchRef}
                defaultValue={q}
                placeholder="ค้นหาอีเมล (เรื่อง/ผู้ส่ง)..."
                className="flex-1 text-sm py-2.5 focus:outline-hidden"
                onKeyDown={(e) => {
                  if (e.code === 'Enter') {
                    setQ((e.target as HTMLInputElement).value.trim())
                    setFolder('all')
                    setOpenId(null)
                    setSearchOpen(false)
                  }
                }}
              />
              <span className="text-[10px] text-slate-300 border border-slate-200 rounded px-1">Enter</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
