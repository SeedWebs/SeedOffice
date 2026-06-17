import {
  ArrowLeft,
  ChevronDown,
  Inbox as InboxIcon,
  Lock,
  Mail,
  Paperclip,
  PenLine,
  RefreshCw,
  Search,
  Send,
  Tag,
  UserPlus,
  X,
  Zap,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useDialog } from '../components/Dialog'
import { PageHeader } from '../components/PageHeader'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
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
  status: 'connected' | 'disconnected' | 'disabled'
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
  tags?: string[] | null
  snoozeUntil?: string | null
  lastMessageAt: string
  preview: string | null
  latestFrom: string | null
  hasAttachment: number
}
interface NoteItem {
  id: string
  body: string
  createdAt: string
  userId: string
  userName: string
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
  notes: NoteItem[]
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

const DOTS = ['bg-brand-500', 'bg-info-500', 'bg-warning-500', 'bg-violet-500', 'bg-danger-500']

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  open: { label: 'รอตอบ', cls: 'bg-warning-100 text-warning-700' },
  snoozed: { label: 'เลื่อนไว้', cls: 'bg-info-100 text-info-700' },
  closed: { label: 'ปิดแล้ว', cls: 'bg-divider text-soft' },
  spam: { label: 'สแปม', cls: 'bg-danger-100 text-danger-600' },
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
const waitLabelDate = (iso: string) => {
  const d = new Date(iso)
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
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-hover ${sel === key ? 'bg-hover' : ''}`}
    >
      <span className={`w-2 h-2 rounded-full ${dot}`} />
      <span className={`flex-1 text-left text-sm ${bold ? 'font-medium ' : ''}text-body`}>{name}</span>
      <span className={`text-[11px] ${unread ? 'bg-danger-100 text-danger-600' : 'text-border'} px-1.5 rounded-full`}>
        {unread}
      </span>
    </button>
  )
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-sm border border-border-subtle bg-white rounded-lg pl-3 pr-2 py-2 hover:bg-hover"
      >
        <InboxIcon className="w-4 h-4 text-muted" />
        <span className="font-medium text-body">{cur ? cur.name : 'ทั้งหมด'}</span>
        <span className="text-[11px] bg-danger-100 text-danger-600 px-1.5 rounded-full">
          {cur ? cur.unread : total}
        </span>
        <ChevronDown className="w-4 h-4 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-lg border border-border-subtle p-1.5 z-50">
          {row('all', 'bg-border', 'ทั้งหมด', total, true)}
          <div className="my-1 border-t border-divider" />
          {groups.map((g) => (
            <div key={g}>
              <div className="px-2.5 pt-2 pb-1 text-[10px] font-medium text-muted uppercase tracking-wide">
                {g}
              </div>
              {mailboxes
                .filter((m) => m.companyLabel === g)
                .map((m) => row(m.id, dotOf(m.id) ?? 'bg-border', m.name, m.unread))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** การ์ดอีเมล 1 ฉบับใน timeline */
function MessageCard({ m }: { m: Msg }) {
  return (
    <div
      className={`bg-white border rounded-xl p-4 max-w-3xl ${m.direction === 'out' ? 'border-brand-200 ml-6' : 'border-border-subtle'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-strong">
          {displayName(m.fromAddr)}
          {m.direction === 'out' && (
            <span className="ml-2 text-[10px] font-medium bg-brand-50 text-brand-600 px-1.5 py-0.5 rounded">
              ทีมเรา
            </span>
          )}
        </div>
        <div className="text-xs text-muted shrink-0">{dtLabel(m.sentAt)}</div>
      </div>
      <div className="text-xs text-muted mt-1">
        <span>ถึง</span> {m.toAddr || '—'}
      </div>
      {m.ccAddr && (
        <div className="text-xs text-muted mt-0.5">
          <span>Cc</span> {m.ccAddr}
        </div>
      )}
      <hr className="my-3 border-divider" />
      {m.body ? (
        m.body.contentType.includes('html') ? (
          <EmailFrame html={m.body.content} />
        ) : (
          <div className="text-sm text-body whitespace-pre-line leading-relaxed">{m.body.content}</div>
        )
      ) : (
        <div className="text-sm text-muted">{m.snippet || '(ไม่มีเนื้อหา)'}</div>
      )}
      {m.attachments.length > 0 && (
        <div className="mt-3">
          {m.attachments.map((a) => (
            <a
              key={a.id}
              href={`/api/inbox/attachments/${a.id}/download`}
              className="inline-flex items-center gap-2 border border-border-subtle rounded-lg px-3 py-2 text-sm text-brand-700 mt-1 mr-2 hover:bg-hover"
            >
              <Paperclip className="w-4 h-4 text-muted" />
              {a.filename}
              <span className="text-[10px] text-muted">{(a.sizeBytes / 1024).toFixed(0)} KB</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

/** 9:00 เช้าตามเวลาไทย (+plusDays วัน) — สำหรับเมนูเลื่อน (snooze) */
function bkkMorning(plusDays: number): Date {
  const bkkNow = new Date(Date.now() + 7 * 3_600_000)
  // 9:00 BKK = 02:00 UTC
  return new Date(
    Date.UTC(bkkNow.getUTCFullYear(), bkkNow.getUTCMonth(), bkkNow.getUTCDate() + plusDays, 2, 0, 0),
  )
}

/** เมนูเปลี่ยนสถานะ/เลื่อน + มอบหมาย + แท็ก ใน detail header */
function ThreadActions({
  thread,
  onChanged,
}: {
  thread: ThreadRow
  onChanged: () => void
}) {
  const [menu, setMenu] = useState<'status' | 'assign' | 'tags' | null>(null)
  const [tagInput, setTagInput] = useState('')
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
  const tags = thread.tags ?? []
  const setTags = async (next: string[]) => {
    await api.patch(`/api/inbox/threads/${thread.id}`, { tags: next })
    onChanged()
  }
  const pill = STATUS_PILL[thread.status] ?? STATUS_PILL.open!
  const team = (userOpts ?? []).filter((u) => u.role !== 'vendor')
  const assignee = team.find((u) => u.id === thread.assigneeId)
  const snoozeItems: { label: string; days: number }[] = [
    { label: 'เลื่อนถึงพรุ่งนี้ 9:00', days: 1 },
    { label: 'เลื่อนไปอีก 3 วัน', days: 3 },
    { label: 'เลื่อนไปสัปดาห์หน้า', days: 7 },
  ]
  const statusItems: { label: string; body: Record<string, unknown> }[] =
    thread.status === 'open'
      ? [
          { label: 'ปิดเรื่อง', body: { status: 'closed' } },
          ...snoozeItems.map((s) => ({
            label: s.label,
            body: { status: 'snoozed', snoozeUntil: bkkMorning(s.days).toISOString() },
          })),
          { label: 'ทำเครื่องหมายสแปม', body: { status: 'spam' } },
        ]
      : thread.status === 'spam'
        ? [{ label: 'ไม่ใช่สแปม — เปิดกลับ', body: { status: 'open' } }]
        : [{ label: 'เปิดเรื่องใหม่', body: { status: 'open' } }]
  const item = (label: string, onClick: () => void, active = false) => (
    <button
      key={label}
      onClick={onClick}
      className={`w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-hover ${active ? 'bg-hover font-medium' : 'text-body'}`}
    >
      {label}
    </button>
  )
  return (
    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="relative">
        <button
          onClick={() => setMenu(menu === 'status' ? null : 'status')}
          className={`flex items-center gap-1 text-sm rounded-full px-3 py-1.5 whitespace-nowrap ${pill.cls}`}
        >
          {pill.label}
          {thread.status === 'snoozed' && thread.snoozeUntil && (
            <span className="text-[10px] opacity-70">→ {waitLabelDate(thread.snoozeUntil)}</span>
          )}
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {menu === 'status' && (
          <div className="absolute right-0 mt-1.5 w-56 bg-white rounded-xl shadow-lg border border-border-subtle p-1.5 z-50">
            {statusItems.map((s) => item(s.label, () => void patch(s.body)))}
          </div>
        )}
      </div>
      <div className="relative">
        <button
          title="ติดแท็ก"
          onClick={() => setMenu(menu === 'tags' ? null : 'tags')}
          className={`h-8 px-2 grid place-items-center rounded-lg hover:bg-divider ${tags.length ? 'text-brand-600' : 'text-dim'}`}
        >
          <span className="flex items-center gap-1 text-sm">
            <Tag className="w-4 h-4" />
            {tags.length > 0 && <span className="text-xs">{tags.length}</span>}
          </span>
        </button>
        {menu === 'tags' && (
          <div className="absolute right-0 mt-1.5 w-60 bg-white rounded-xl shadow-lg border border-border-subtle p-2.5 z-50 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {tags.length === 0 && <span className="text-xs text-muted">ยังไม่มีแท็ก</span>}
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 text-[11px] bg-divider text-soft px-2 py-0.5 rounded-full"
                >
                  {t}
                  <button
                    onClick={() => void setTags(tags.filter((x) => x !== t))}
                    className="text-muted hover:text-danger-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.code === 'Enter' && tagInput.trim()) {
                  void setTags([...new Set([...tags, tagInput.trim()])])
                  setTagInput('')
                }
              }}
              placeholder="พิมพ์แท็กแล้ว Enter"
              className="w-full text-sm bg-hover rounded-lg px-2.5 py-1.5 focus:outline-hidden"
            />
          </div>
        )}
      </div>
      <div className="relative">
        <button
          title="มอบหมาย"
          onClick={() => setMenu(menu === 'assign' ? null : 'assign')}
          className={`h-8 px-2 grid place-items-center rounded-lg hover:bg-divider text-sm ${assignee ? 'text-body' : 'text-dim'}`}
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
          <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-lg border border-border-subtle p-1.5 z-50 max-h-72 overflow-y-auto">
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
  const { user: me } = useAuth()
  const { promptDialog, confirmDialog } = useDialog()
  const [draft, setDraft] = useState('')
  const [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply')
  const [cannedOpen, setCannedOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const { data: canned, reload: reloadCanned } = useLoad<{ items: { id: string; title: string; body: string }[] }>(
    () => api.get('/api/inbox/canned'),
  )
  useEffect(() => {
    if (data) onChanged() // เปิดแล้ว server mark read — ให้ list/badge รีเฟรช
  }, [data?.thread.id])
  useEffect(() => {
    setDraft('')
    setComposerMode('reply')
  }, [id]) // เปลี่ยน thread = เริ่มร่างใหม่

  // collision detection (SPEC §4.12) — WebSocket เข้า DO ราย thread: ใครกำลังดู/พิมพ์
  const [viewers, setViewers] = useState<{ userId: string; name: string; mode: string }[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const typingTimer = useRef<number | null>(null)
  useEffect(() => {
    let stopped = false
    let retry: number | null = null
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(`${proto}://${location.host}/api/inbox/threads/${id}/ws`)
      wsRef.current = ws
      ws.onmessage = (e) => {
        if (e.data === 'pong') return
        try {
          const msg = JSON.parse(String(e.data)) as { type?: string; viewers?: typeof viewers }
          if (msg.type === 'roster' && msg.viewers) setViewers(msg.viewers)
        } catch {
          // ข้อความนอกรูปแบบ
        }
      }
      ws.onclose = () => {
        if (!stopped) retry = window.setTimeout(connect, 5000) // server reload/หลุด → ต่อใหม่
      }
    }
    connect()
    const ping = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send('ping')
    }, 30_000)
    return () => {
      stopped = true
      if (retry) window.clearTimeout(retry)
      clearInterval(ping)
      wsRef.current?.close()
      wsRef.current = null
      setViewers([])
    }
  }, [id])
  const sendMode = (mode: 'view' | 'typing') => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'mode', mode }))
  }
  const onTyping = () => {
    sendMode('typing')
    if (typingTimer.current) window.clearTimeout(typingTimer.current)
    typingTimer.current = window.setTimeout(() => sendMode('view'), 2500)
  }
  const others = viewers.filter((v) => v.userId !== me?.id)
  const typers = others.filter((v) => v.mode === 'typing')
  const watchers = others.filter((v) => v.mode !== 'typing')

  const sendReply = async () => {
    setSending(true)
    setSendError('')
    try {
      if (composerMode === 'note') {
        await api.post(`/api/inbox/threads/${id}/notes`, { body: draft.trim() })
      } else {
        await api.post(`/api/inbox/threads/${id}/reply`, { body: draft.trim() })
      }
      setDraft('')
      await reload()
      onChanged()
    } catch (e) {
      setSendError(
        e instanceof ApiError && e.message === 'mailbox_disconnected'
          ? 'กล่องหลุดการเชื่อมต่อ — เชื่อมใหม่ที่ ตั้งค่า → อีเมลกลาง'
          : `${composerMode === 'note' ? 'บันทึกโน้ต' : 'ส่ง'}ไม่สำเร็จ — ลองอีกครั้ง`,
      )
    } finally {
      setSending(false)
    }
  }

  const saveDraftAsCanned = async () => {
    const title = await promptDialog({ title: 'ตั้งชื่อข้อความสำเร็จรูป', placeholder: 'เช่น ขอบคุณ + รับเรื่อง' })
    if (!title) return
    await api.post('/api/inbox/canned', { title, body: draft.trim() })
    await reloadCanned()
  }
  const removeCanned = async (cid: string, title: string) => {
    if (!(await confirmDialog({ title: `ลบข้อความสำเร็จรูป "${title}"?`, danger: true, confirmLabel: 'ลบ' }))) return
    await api.delete(`/api/inbox/canned/${cid}`)
    await reloadCanned()
  }
  if (loading || !data)
    return <div className="p-10 text-center text-sm text-muted">กำลังโหลดอีเมล…</div>
  const { thread, messages, notes, client, past } = data
  const mailbox = mailboxes.find((m) => m.id === thread.mailboxId)
  // timeline = อีเมล + โน้ตภายใน เรียงตามเวลา
  const timeline = [
    ...messages.map((m) => ({ kind: 'msg' as const, at: new Date(m.sentAt).getTime(), m })),
    ...(notes ?? []).map((n) => ({ kind: 'note' as const, at: new Date(n.createdAt).getTime(), n })),
  ].sort((a, b) => a.at - b.at)
  return (
    <div className="flex">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center gap-2">
          <button
            onClick={onBack}
            className="w-8 h-8 grid place-items-center rounded-lg hover:bg-divider text-dim"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="font-semibold text-ink truncate flex-1">
            {thread.subject || '(ไม่มีหัวข้อ)'}
            <span className="ml-2 text-xs font-normal text-muted tabular-nums">#{thread.number}</span>
            {(thread.tags ?? []).map((t) => (
              <span key={t} className="ml-1.5 text-[10px] font-normal bg-divider text-dim px-1.5 py-0.5 rounded-full">
                {t}
              </span>
            ))}
          </div>
          {/* collision: ใครกำลังดู/พิมพ์ thread นี้อยู่ (SPEC §4.12) */}
          {typers.length > 0 && (
            <span className="text-[11px] bg-danger-100 text-danger-600 px-2 py-1 rounded-full whitespace-nowrap animate-pulse">
              ✏️ {typers.map((v) => v.name).join(', ')} กำลังพิมพ์…
            </span>
          )}
          {watchers.length > 0 && (
            <span className="text-[11px] bg-warning-100 text-warning-700 px-2 py-1 rounded-full whitespace-nowrap">
              👀 {watchers.map((v) => v.name).join(', ')} กำลังดูอยู่
            </span>
          )}
          <ThreadActions
            thread={thread}
            onChanged={() => {
              void reload()
              onChanged()
            }}
          />
        </div>

        <div className="flex-1 p-5 bg-hover/40 space-y-4">
          {timeline.map((item) =>
            item.kind === 'note' ? (
              <div key={item.n.id} className="bg-warning-50 border border-warning-200 rounded-xl p-4 max-w-3xl ml-6">
                <div className="flex items-center gap-1.5 text-xs text-warning-700">
                  <Lock className="w-3.5 h-3.5" />
                  โน้ตภายใน · {item.n.userName}
                  <span className="ml-auto text-warning-600/70">{dtLabel(item.n.createdAt)}</span>
                </div>
                <div className="text-sm text-body whitespace-pre-line leading-relaxed mt-2">
                  {item.n.body}
                </div>
              </div>
            ) : (
              <MessageCard key={item.m.id} m={item.m} />
            ),
          )}
        </div>

        {/* ช่องตอบกว้าง / โน้ตภายใน — สลับด้วยปุ่มกุญแจ (mockup) */}
        <div className="p-3 border-t border-border-subtle">
          <div
            className={`border rounded-xl p-3 ${composerMode === 'note' ? 'border-warning-300 bg-warning-50/60' : 'border-border-subtle'}`}
          >
            <div className="text-[11px] text-muted mb-2">
              {composerMode === 'note' ? (
                <span className="text-warning-700">โน้ตภายใน — ทีมเห็นกันเอง ลูกค้าไม่เห็นข้อความนี้</span>
              ) : (
                <>
                  ตอบกลับ {thread.contactEmail ?? '—'} · ส่งจาก{' '}
                  <span className="text-dim">{mailbox?.emailAddress ?? mailbox?.name ?? '—'}</span>
                  {mailbox?.status !== 'connected' && (
                    <span className="ml-2 text-danger-500">— กล่องหลุดการเชื่อมต่อ ส่งไม่ได้ (เชื่อมใหม่ที่ ตั้งค่า)</span>
                  )}
                </>
              )}
            </div>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                onTyping()
              }}
              className="w-full h-28 resize-none text-sm bg-transparent focus:outline-hidden"
              placeholder={
                composerMode === 'note' ? 'จดโน้ตถึงทีม...' : 'เขียนคำตอบ... (เขียนยาวได้เต็มที่)'
              }
            />
            {sendError && <div className="text-xs text-danger-600 mb-1">{sendError}</div>}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1 text-muted">
                <button
                  title={composerMode === 'note' ? 'กลับไปโหมดตอบลูกค้า' : 'โน้ตภายใน (ลูกค้าไม่เห็น)'}
                  onClick={() => setComposerMode(composerMode === 'note' ? 'reply' : 'note')}
                  className={`w-7 h-7 grid place-items-center rounded hover:bg-divider ${composerMode === 'note' ? 'bg-warning-100 text-warning-700' : ''}`}
                >
                  <Lock className="w-4 h-4" />
                </button>
                <div className="relative">
                  <button
                    title="ข้อความสำเร็จรูป"
                    onClick={(e) => {
                      e.stopPropagation()
                      setCannedOpen((v) => !v)
                    }}
                    className="w-7 h-7 grid place-items-center rounded hover:bg-divider"
                  >
                    <Zap className="w-4 h-4" />
                  </button>
                  {cannedOpen && (
                    <div
                      className="absolute bottom-9 left-0 w-72 bg-white rounded-xl shadow-lg border border-border-subtle p-1.5 z-50 max-h-64 overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(canned?.items ?? []).length === 0 && (
                        <div className="text-xs text-muted px-2.5 py-2">
                          ยังไม่มีข้อความสำเร็จรูป — พิมพ์ร่างแล้วกด "บันทึกร่างนี้" ด้านล่าง
                        </div>
                      )}
                      {(canned?.items ?? []).map((cn) => (
                        <div key={cn.id} className="flex items-center group">
                          <button
                            onClick={() => {
                              setDraft((d) => (d.trim() ? `${d}\n\n${cn.body}` : cn.body))
                              setCannedOpen(false)
                            }}
                            className="flex-1 text-left text-sm px-2.5 py-2 rounded-lg hover:bg-hover text-body truncate"
                          >
                            {cn.title}
                          </button>
                          <button
                            onClick={() => void removeCanned(cn.id, cn.title)}
                            className="opacity-0 group-hover:opacity-100 text-border hover:text-danger-600 px-1.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {draft.trim() && (
                        <button
                          onClick={() => {
                            setCannedOpen(false)
                            void saveDraftAsCanned()
                          }}
                          className="w-full text-left text-xs px-2.5 py-2 mt-1 border-t border-divider text-brand-600 hover:bg-hover rounded-b-lg"
                        >
                          + บันทึกร่างนี้เป็นข้อความสำเร็จรูป
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => void sendReply()}
                disabled={
                  !draft.trim() || sending || (composerMode === 'reply' && mailbox?.status !== 'connected')
                }
                className={`${composerMode === 'note' ? 'bg-warning-600 hover:bg-warning-700' : 'bg-brand-600 hover:bg-brand-700'} disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded-lg flex items-center gap-1`}
              >
                {composerMode === 'note' ? (
                  <>
                    <Lock className="w-3.5 h-3.5" /> {sending ? 'กำลังบันทึก…' : 'บันทึกโน้ต'}
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" /> {sending ? 'กำลังส่ง…' : 'ส่ง'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* พาเนลขวา: การ์ดลูกค้า + อีเมลที่ผ่านมา */}
      <div className="hidden md:block w-72 border-l border-border-subtle p-4 shrink-0 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-linear-to-br from-info-200 to-violet-300 grid place-items-center text-lg shrink-0">
            {client?.logo ?? ''}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-strong truncate">
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
          <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">
            อีเมลที่ผ่านมา
          </div>
          {past.items.length === 0 && <div className="text-xs text-muted px-2 py-2">— ไม่มี</div>}
          {past.items.map((p) => (
            <button
              key={p.id}
              onClick={() => onOpenThread(p.id)}
              className="w-full flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-hover text-left text-xs text-soft"
            >
              <Mail className="w-3.5 h-3.5 text-muted mt-0.5 shrink-0" />
              <span className="line-clamp-2">{p.subject || '(ไม่มีหัวข้อ)'}</span>
            </button>
          ))}
          {past.total > past.items.length && (
            <div className="px-2 py-2 text-xs text-muted">ทั้งหมด {past.total} เรื่อง</div>
          )}
        </div>
      </div>
    </div>
  )
}

/** เขียนอีเมลใหม่ — สร้าง thread ใหม่ + มอบหมายให้คนส่ง */
function ComposeModal({
  mailboxes,
  onClose,
  onSent,
}: {
  mailboxes: MailboxOpt[]
  onClose: () => void
  onSent: (threadId: string) => void
}) {
  const connected = mailboxes.filter((m) => m.status === 'connected')
  const [form, setForm] = useState({ mailboxId: connected[0]?.id ?? '', to: '', subject: '', body: '' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const submit = async () => {
    setSending(true)
    setError('')
    try {
      const res = await api.post<{ threadId: string }>('/api/inbox/compose', form)
      onSent(res.threadId)
    } catch (e) {
      setError(e instanceof Error && e.message === 'invalid_body' ? 'กรอกอีเมลผู้รับให้ถูกต้อง' : 'ส่งไม่สำเร็จ — ลองอีกครั้ง')
      setSending(false)
    }
  }
  return (
    <div className="fixed inset-0 bg-ink/30 z-50 grid place-items-center p-4" onClick={onClose}>
      <div
        className="w-[36rem] max-w-full bg-white rounded-xl shadow-lg p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-semibold text-ink">เขียนอีเมลใหม่</div>
        {connected.length === 0 ? (
          <div className="text-sm text-muted py-4">ยังไม่มีกล่องที่เชื่อมอยู่ — เชื่อมที่ ตั้งค่า → อีเมลกลาง</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={form.mailboxId}
                onChange={(e) => setForm({ ...form, mailboxId: e.target.value })}
                className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
              >
                {connected.map((m) => (
                  <option key={m.id} value={m.id}>
                    ส่งจาก: {m.name} ({m.emailAddress})
                  </option>
                ))}
              </select>
              <input
                placeholder="ถึง (อีเมลผู้รับ)"
                value={form.to}
                onChange={(e) => setForm({ ...form, to: e.target.value })}
                className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
              />
            </div>
            <input
              placeholder="เรื่อง"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="w-full text-sm bg-white shadow-xs rounded-lg px-3 py-2"
            />
            <textarea
              placeholder="เนื้อหา..."
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className="w-full h-44 resize-none text-sm bg-white shadow-xs rounded-lg px-3 py-2 focus:outline-hidden"
            />
            {error && <div className="text-xs text-danger-600">{error}</div>}
            <div className="flex items-center justify-end gap-2">
              <button onClick={onClose} className="text-sm px-3.5 py-2 rounded-lg text-soft hover:bg-hover">
                ยกเลิก
              </button>
              <button
                onClick={() => void submit()}
                disabled={sending || !form.mailboxId || !form.to || !form.subject || !form.body}
                className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-1"
              >
                <Send className="w-3.5 h-3.5" /> {sending ? 'กำลังส่ง…' : 'ส่ง'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function InboxPage() {
  const [mb, setMb] = useState<string>('all')
  const [folder, setFolder] = useState<FolderKey>('unassigned')
  const [q, setQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

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
                      }}
              title="ค้นหา (⌘K)"
              className="w-9 h-9 grid place-items-center rounded-lg border border-border-subtle text-dim hover:bg-hover"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={() => setComposeOpen(true)}
              title="เขียนอีเมลใหม่"
              className="w-9 h-9 grid place-items-center rounded-lg border border-border-subtle bg-white text-dim hover:bg-hover"
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
        <div className="flex flex-nowrap items-center gap-1 bg-divider rounded-xl p-1 mb-4 w-full sm:w-fit overflow-x-auto">
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
                className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${act ? 'bg-white shadow-xs text-ink' : 'text-dim hover:text-body'}`}
              >
                {f.name}
                {n > 0 && (
                  <span className={`text-[11px] ${act ? 'text-brand-600' : 'text-muted'} tabular-nums`}>
                    {n}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {q && (
          <div className="mb-3 flex items-center gap-2 text-sm text-dim">
            ผลค้นหา: <span className="font-medium text-body">"{q}"</span>
            <button onClick={() => setQ('')} className="text-muted hover:text-soft">
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
            <div className="p-10 text-center text-sm text-muted">กำลังโหลด…</div>
          ) : (data?.threads.length ?? 0) === 0 ? (
            <div className="p-12 text-center text-sm text-muted">
              <Mail className="w-7 h-7 mx-auto mb-2 text-border" />
              {mailboxes.length === 0
                ? 'ยังไม่ได้เชื่อมกล่องเมล — เริ่มที่ ตั้งค่า → อีเมลกลาง'
                : 'ไม่มีอีเมลในกล่องนี้'}
            </div>
          ) : (
            <>
              <div className="hidden sm:grid sm:grid-cols-[22px_minmax(0,1.3fr)_minmax(0,3fr)_72px_72px] items-center gap-3 px-4 py-2.5 border-b border-border-subtle text-xs text-muted">
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
                    className={`grid grid-cols-[22px_minmax(0,1fr)_56px] sm:grid-cols-[22px_minmax(0,1.3fr)_minmax(0,3fr)_72px_72px] items-center gap-3 px-4 py-3 border-b border-divider hover:bg-hover cursor-pointer ${t.unread ? 'bg-brand-50/30' : ''}`}
                  >
                    <input
                      type="checkbox"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-xs border-border w-4 h-4 sm:order-1"
                    />
                    <div className="min-w-0 sm:contents">
                      <div
                        className={`text-[11px] font-medium text-dim truncate sm:order-2 sm:text-sm ${t.unread ? 'sm:font-bold' : 'sm:font-semibold'} sm:text-strong`}
                      >
                        {displayName(t.latestFrom) !== '—'
                          ? displayName(t.latestFrom)
                          : (t.contactEmail ?? '—')}
                      </div>
                      <div className="min-w-0 sm:order-3">
                        <div
                          className={`text-sm text-strong truncate flex items-center gap-1.5 ${t.unread ? 'font-bold' : 'font-semibold'}`}
                        >
                          {t.subject || '(ไม่มีหัวข้อ)'}
                          {t.hasAttachment ? (
                            <Paperclip className="w-3.5 h-3.5 text-muted shrink-0" />
                          ) : null}
                        </div>
                        <div className="text-xs text-dim truncate">
                          {mb === 'all' && (
                            <span
                              className={`inline-block w-1.5 h-1.5 rounded-full ${dotOf(t.mailboxId)} mr-1.5 align-middle`}
                            />
                          )}
                          {t.preview ?? ''}
                        </div>
                      </div>
                    </div>
                    <div className="hidden sm:block sm:order-4 text-sm text-muted tabular-nums">
                      {t.number}
                    </div>
                    <div className="text-[11px] sm:text-sm text-muted text-right sm:text-left whitespace-nowrap sm:order-5">
                      {waitLabel(t.lastMessageAt)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {composeOpen && (
        <ComposeModal
          mailboxes={mailboxes}
          onClose={() => setComposeOpen(false)}
          onSent={(threadId) => {
            setComposeOpen(false)
            setOpenId(threadId)
            void reload()
          }}
        />
      )}

      {/* ค้นหา ⌘K — hybrid: ในระบบ + Gmail ทั้งกล่องสด (SPEC §4.12) */}
      {searchOpen && (
        <SearchModal
          mb={mb}
          mailboxes={mailboxes}
          initial={q}
          onClose={() => setSearchOpen(false)}
          onOpen={(tid) => {
            setSearchOpen(false)
            setOpenId(tid)
            void reload()
          }}
          onApplyFilter={(t) => {
            setQ(t)
            setFolder('all')
            setOpenId(null)
            setSearchOpen(false)
          }}
        />
      )}
    </>
  )
}

interface SearchRemoteItem {
  mailboxId: string
  gmailThreadId: string
  localThreadId: string | null
  subject: string
  fromAddr: string
  sentAt: number
}
interface SearchResults {
  local: { id: string; mailboxId: string; subject: string; contactEmail: string | null; lastMessageAt: string }[]
  remote: SearchRemoteItem[]
  partial: string[]
}

/** modal ค้นหา: พิมพ์แล้วเห็นผล 2 ส่วนสด — กดผลจาก Gmail = ดูด thread นั้นเข้าระบบแล้วเปิดเลย */
function SearchModal({
  mb,
  mailboxes,
  initial,
  onClose,
  onOpen,
  onApplyFilter,
}: {
  mb: string
  mailboxes: MailboxOpt[]
  initial: string
  onClose: () => void
  onOpen: (threadId: string) => void
  onApplyFilter: (q: string) => void
}) {
  const [term, setTerm] = useState(initial)
  const [res, setRes] = useState<SearchResults | null>(null)
  const [searching, setSearching] = useState(false)
  const [importing, setImporting] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])

  // ค้นแบบ debounce — local เร็ว + Gmail ตามมาในชุดเดียว
  useEffect(() => {
    const t = term.trim()
    if (!t) {
      setRes(null)
      return
    }
    setSearching(true)
    const timer = window.setTimeout(() => {
      const p = new URLSearchParams({ q: t })
      if (mb !== 'all') p.set('mailbox', mb)
      api
        .get<SearchResults>(`/api/inbox/search?${p.toString()}`)
        .then(setRes)
        .catch(() => setRes(null))
        .finally(() => setSearching(false))
    }, 450)
    return () => window.clearTimeout(timer)
  }, [term, mb])

  const dotOf = (id: string) => DOTS[mailboxes.findIndex((m) => m.id === id) % DOTS.length]
  const openRemote = async (r: SearchRemoteItem) => {
    if (r.localThreadId) return onOpen(r.localThreadId)
    setImporting(r.gmailThreadId)
    try {
      const out = await api.post<{ threadId: string }>('/api/inbox/import-thread', {
        mailboxId: r.mailboxId,
        gmailThreadId: r.gmailThreadId,
      })
      onOpen(out.threadId)
    } catch {
      setImporting(null)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-ink/30 z-50 grid place-items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="w-[36rem] max-w-full bg-white rounded-xl shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-divider">
          <Search className="w-4 h-4 text-muted" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="ค้นหาอีเมล... (รองรับ from: before: แบบ Gmail)"
            className="flex-1 text-sm py-3 focus:outline-hidden"
            onKeyDown={(e) => {
              if (e.code === 'Enter' && term.trim()) onApplyFilter(term.trim())
            }}
          />
          <span className="text-[10px] text-border border border-border-subtle rounded px-1">
            Enter = กรองรายการ
          </span>
        </div>

        <div className="max-h-[26rem] overflow-y-auto p-2">
          {!term.trim() && (
            <div className="px-3 py-6 text-center text-sm text-muted">
              พิมพ์เพื่อค้น — ในระบบ + ย้อนหลังทั้งกล่องผ่าน Gmail
            </div>
          )}

          {res && res.local.length > 0 && (
            <>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wide">
                ในระบบ
              </div>
              {res.local.map((l) => (
                <button
                  key={l.id}
                  onClick={() => onOpen(l.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-hover text-left"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotOf(l.mailboxId)}`} />
                  <span className="text-sm text-strong truncate">{l.subject || '(ไม่มีหัวข้อ)'}</span>
                  <span className="ml-auto text-xs text-muted shrink-0">{l.contactEmail ?? ''}</span>
                </button>
              ))}
            </>
          )}

          {term.trim() && (
            <div className="px-3 pt-3 pb-1 text-[10px] font-semibold text-muted uppercase tracking-wide flex items-center gap-2">
              จาก Gmail ทั้งกล่อง
              {searching && <RefreshCw className="w-3 h-3 animate-spin text-border" />}
            </div>
          )}
          {res?.remote.map((r) => (
            <button
              key={`${r.mailboxId}:${r.gmailThreadId}`}
              onClick={() => void openRemote(r)}
              disabled={importing === r.gmailThreadId}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-hover text-left disabled:opacity-50"
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotOf(r.mailboxId)}`} />
              <span className="min-w-0">
                <span className="block text-sm text-strong truncate">{r.subject || '(ไม่มีหัวข้อ)'}</span>
                <span className="block text-xs text-muted truncate">
                  {displayName(r.fromAddr)} · {r.sentAt ? waitLabelDate(new Date(r.sentAt).toISOString()) : ''}
                </span>
              </span>
              <span className="ml-auto text-[10px] shrink-0">
                {importing === r.gmailThreadId ? (
                  <span className="text-brand-600">กำลังดึงเข้าระบบ…</span>
                ) : r.localThreadId ? (
                  <span className="text-muted">อยู่ในระบบแล้ว</span>
                ) : (
                  <span className="text-brand-600">ดึงเข้าระบบ →</span>
                )}
              </span>
            </button>
          ))}
          {res && term.trim() && !searching && res.remote.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted">— Gmail ไม่พบ —</div>
          )}
          {res && res.partial.length > 0 && (
            <div className="px-3 py-2 text-[11px] text-warning-600">
              ⚠️ ค้นไม่ครบ: กล่อง {res.partial.join(', ')} หลุดการเชื่อมต่อ
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
