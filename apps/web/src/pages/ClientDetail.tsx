import { formatSatang } from '@seedoffice/core'
import { ArrowLeft, Check, Cpu, Globe, Mail, Package, Phone, Pin, Plus, Server, ShieldCheck, Trash2, User, Wrench, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useDialog } from '../components/Dialog'
import { api } from '../lib/api'
import { fmtThaiDate, STATUS_CHIP, STATUS_LABEL } from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'
import { expiryCls } from './Clients'

interface Detail {
  id: string
  name: string
  logo: string | null
  contactName: string | null
  contactEmail: string | null
  contactPhone: string | null
  note: string | null
  today: string
  money: { quotedSatang: number; paidSatang: number; unpaidSatang: number; overdueSatang: number; paidPct: number | null }
  mrrSatang: number
  arrSatang: number
  projects: { id: string; name: string; logo: string | null; status: keyof typeof STATUS_CHIP; type: string; quotedSatang: number | null }[]
  payments: { id: string; label: string | null; installmentNo: number; amountSatang: number; dueDate: string | null; paidAt: string | null; projectName: string }[]
  services: { id: string; label: string; category: string; period: 'monthly' | 'yearly'; amountSatang: number; nextDueDate: string | null; status: string }[]
  notes: { id: string; body: string; byName: string; createdAt: string | number }[]
}

const noteDate = (v: string | number) =>
  new Date(v).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' })

const CAT_ICON: Record<string, ReactNode> = {
  hosting: <Server className="w-4 h-4" />,
  domain: <Globe className="w-4 h-4" />,
  ma: <Wrench className="w-4 h-4" />,
  server: <Cpu className="w-4 h-4" />,
  ssl: <ShieldCheck className="w-4 h-4" />,
  other: <Package className="w-4 h-4" />,
}
const CAT_LABEL: Record<string, string> = {
  hosting: 'Hosting', domain: 'โดเมน', ma: 'ดูแลระบบ (MA)', server: 'เซิร์ฟเวอร์', ssl: 'SSL', other: 'อื่นๆ',
}
const daysUntil = (today: string, d: string) => Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000)

function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-white rounded-lg shadow-xs overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
        <span className="font-semibold text-slate-900 text-sm">{title}</span>
        {action}
      </div>
      {children}
    </div>
  )
}

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { confirmDialog, promptDialog } = useDialog()
  const { data: c, reload } = useLoad<Detail>(() => api.get(`/api/clients/${id}`), [id])
  const [noteDraft, setNoteDraft] = useState('')
  const [addingNote, setAddingNote] = useState(false)
  const [svcForm, setSvcForm] = useState({ open: false, label: '', category: 'ma', period: 'monthly' as 'monthly' | 'yearly', amountBaht: '', next: '' })

  if (!c) return <div className="p-6 text-sm text-slate-400">กำลังโหลด…</div>

  const addNote = async () => {
    if (!noteDraft.trim()) return
    await api.post(`/api/clients/${c.id}/notes`, { body: noteDraft.trim() })
    setNoteDraft('')
    setAddingNote(false)
    await reload()
  }
  const addService = async () => {
    await api.post(`/api/clients/${c.id}/services`, {
      label: svcForm.label,
      category: svcForm.category,
      period: svcForm.period,
      amountSatang: Math.round(Number(svcForm.amountBaht) * 100),
      ...(svcForm.next ? { nextDueDate: svcForm.next } : {}),
    })
    setSvcForm({ open: false, label: '', category: 'ma', period: 'monthly', amountBaht: '', next: '' })
    await reload()
  }
  const renewService = async (svcId: string, next: string | null) => {
    const input = await promptDialog({
      title: 'เลื่อนวันต่ออายุ',
      message: 'ใช้หลังเก็บเงิน/ต่อสัญญาแล้ว — ตั้งเป็นรอบถัดไป',
      inputType: 'date',
      initialValue: next ?? c.today,
      confirmLabel: 'บันทึก',
    })
    if (!input) return
    await api.patch(`/api/services/${svcId}`, { nextDueDate: input })
    await reload()
  }

  const sum = (label: string, val: ReactNode, sub?: string) => (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-lg font-bold text-slate-900 tabular-nums">{val}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  )
  const inputCls = 'text-sm bg-white shadow-xs rounded-lg px-2.5 py-1.5'

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4">
        <button onClick={() => navigate('/clients')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> กลับ
        </button>
      </div>

      {/* header */}
      <div className="bg-white rounded-lg shadow-xs p-5 mb-4">
        <div className="flex items-start gap-4">
          <span className="text-3xl leading-none">{c.logo ?? '🏢'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-bold text-slate-900">{c.name}</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 mt-1">
              {c.contactName && <span className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" />{c.contactName}</span>}
              {c.contactEmail && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{c.contactEmail}</span>}
              {c.contactPhone && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{c.contactPhone}</span>}
            </div>
            {c.note && <div className="text-sm text-slate-400 mt-1.5">{c.note}</div>}
          </div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {sum('เสนอราคารวม', formatSatang(c.money.quotedSatang))}
          {sum('รับชำระแล้ว', formatSatang(c.money.paidSatang), c.money.paidPct != null ? `${c.money.paidPct}%` : undefined)}
          {sum('ค้างชำระ', c.money.overdueSatang > 0 ? <span className="text-rose-600">{formatSatang(c.money.overdueSatang)}</span> : formatSatang(0))}
          {sum('รายได้ต่อเนื่อง', c.mrrSatang > 0 ? `${formatSatang(c.mrrSatang)}/ด` : '—', c.mrrSatang > 0 ? `${formatSatang(c.arrSatang)}/ปี` : undefined)}
        </div>
      </div>

      {/* โน้ต/ข้อควรจำ */}
      <div className="bg-white rounded-lg shadow-xs overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
          <span className="font-semibold text-slate-900 text-sm flex items-center gap-2">
            <Pin className="w-4 h-4 text-amber-500" /> โน้ต / ข้อควรจำ
          </span>
          <button onClick={() => setAddingNote((v) => !v)} className="text-xs text-brand-700 font-medium flex items-center gap-1 hover:text-brand-800">
            <Plus className="w-3.5 h-3.5" /> เพิ่มโน้ต
          </button>
        </div>
        {addingNote && (
          <div className="flex gap-2 px-5 py-3 bg-amber-50/40 border-b border-amber-100">
            <input autoFocus value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addNote() }} placeholder="เช่น วางบิลทุกวันที่ 7 / ที่อยู่ส่งเอกสาร..." className={`${inputCls} flex-1`} />
            <button onClick={() => void addNote()} className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg">บันทึก</button>
          </div>
        )}
        {c.notes.length === 0 && !addingNote ? (
          <div className="px-5 py-4 text-sm text-slate-400">ยังไม่มีโน้ต — แปะข้อควรจำ เช่น วันวางบิล, ที่อยู่ส่งเอกสาร</div>
        ) : (
          c.notes.map((n) => (
            <div key={n.id} className="group flex items-start gap-2.5 px-5 py-3 bg-amber-50/40 border-t border-amber-100 first:border-t-0">
              <Pin className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-700">{n.body}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">{n.byName} · {noteDate(n.createdAt)}</div>
              </div>
              <button onClick={() => { void confirmDialog({ title: 'ลบโน้ตนี้?', message: n.body, confirmLabel: 'ลบ', danger: true }).then((yes) => { if (yes) void api.delete(`/api/notes/${n.id}`).then(reload) }) }} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500" title="ลบโน้ต">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-4">
          <Section title="โปรเจกต์">
            {c.projects.length === 0 ? (
              <div className="px-5 py-4 text-sm text-slate-400">ไม่มีงานโปรเจกต์ (ลูกค้างานต่อเนื่อง)</div>
            ) : (
              c.projects.map((p) => (
                <Link key={p.id} to={`/projects/${p.id}`} className="flex items-center gap-3 px-5 py-3 border-t border-slate-100 first:border-t-0 hover:bg-slate-50">
                  <span className="flex-1 min-w-0 truncate text-slate-700">{p.logo} {p.name}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_CHIP[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  <span className="text-slate-600 tabular-nums w-24 text-right">{p.quotedSatang != null ? formatSatang(p.quotedSatang) : '—'}</span>
                </Link>
              ))
            )}
          </Section>

          <Section title="การชำระเงิน">
            {c.payments.length === 0 ? (
              <div className="px-5 py-4 text-sm text-slate-400">ไม่มีงวดชำระ (เก็บค่าบริการต่อเนื่อง)</div>
            ) : (
              c.payments.map((p) => {
                const overdue = !p.paidAt && p.dueDate != null && p.dueDate < c.today
                return (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3 border-t border-slate-100 first:border-t-0">
                    <span className={`flex-1 min-w-0 truncate ${p.paidAt ? 'text-slate-500' : 'text-slate-700'}`}>{p.label ?? `งวด ${p.installmentNo}`} <span className="text-[11px] text-slate-400">· {p.projectName}</span></span>
                    {p.dueDate && <span className="text-[11px] text-slate-400 w-24 text-right hidden sm:block">กำหนด {fmtThaiDate(p.dueDate)}</span>}
                    {p.paidAt ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">จ่ายแล้ว</span>
                    ) : overdue ? (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-600">เกินกำหนด</span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">รอชำระ</span>
                    )}
                    <span className="text-slate-700 tabular-nums w-24 text-right">{formatSatang(p.amountSatang)}</span>
                  </div>
                )
              })
            )}
          </Section>
        </div>

        <div className="space-y-4">
          <Section
            title="บริการต่อเนื่อง"
            action={
              <button onClick={() => setSvcForm({ ...svcForm, open: !svcForm.open })} className="text-xs text-slate-400 hover:text-brand-600 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> บริการ
              </button>
            }
          >
            {svcForm.open && (
              <div className="flex flex-wrap gap-2 px-5 py-3 bg-slate-50/70 border-b border-slate-100">
                <input autoFocus placeholder="ชื่อบริการ" value={svcForm.label} onChange={(e) => setSvcForm({ ...svcForm, label: e.target.value })} className={`${inputCls} flex-1 min-w-32`} />
                <select value={svcForm.category} onChange={(e) => setSvcForm({ ...svcForm, category: e.target.value })} className={inputCls} aria-label="หมวด">
                  {Object.entries(CAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={svcForm.period} onChange={(e) => setSvcForm({ ...svcForm, period: e.target.value as 'monthly' | 'yearly' })} className={inputCls} aria-label="รอบ">
                  <option value="monthly">รายเดือน</option>
                  <option value="yearly">รายปี</option>
                </select>
                <input type="number" placeholder="฿" value={svcForm.amountBaht} onChange={(e) => setSvcForm({ ...svcForm, amountBaht: e.target.value })} className={`${inputCls} w-24`} />
                <input type="date" value={svcForm.next} onChange={(e) => setSvcForm({ ...svcForm, next: e.target.value })} className={inputCls} title="วันต่ออายุถัดไป" />
                <button onClick={() => void addService()} disabled={!svcForm.label || !svcForm.amountBaht} className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">เพิ่ม</button>
              </div>
            )}
            {c.services.length === 0 ? (
              <div className="px-5 py-4 text-sm text-slate-400">ไม่มีบริการต่อเนื่อง</div>
            ) : (
              c.services.map((sv) => (
                <div key={sv.id} className={`group flex items-center gap-3 px-5 py-3 border-t border-slate-100 first:border-t-0 ${sv.status === 'cancelled' ? 'opacity-40' : ''}`}>
                  <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 grid place-items-center shrink-0">{CAT_ICON[sv.category] ?? CAT_ICON.other}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-slate-700 truncate text-sm">{sv.label}</div>
                    <div className="text-[11px] text-slate-400">{CAT_LABEL[sv.category] ?? 'อื่นๆ'}</div>
                  </div>
                  <span className="text-slate-600 tabular-nums text-sm">{formatSatang(sv.amountSatang)}<span className="text-[11px] text-slate-400">{sv.period === 'monthly' ? '/เดือน' : '/ปี'}</span></span>
                  {sv.nextDueDate ? (
                    <button onClick={() => void renewService(sv.id, sv.nextDueDate)} className={`w-28 text-right text-sm ${expiryCls(daysUntil(c.today, sv.nextDueDate))}`} title="คลิกเพื่อเลื่อนวันต่ออายุ (หลังเก็บเงิน/ต่อแล้ว)">
                      ต่อ {fmtThaiDate(sv.nextDueDate)}
                      <div className="text-[11px] text-slate-400">อีก {daysUntil(c.today, sv.nextDueDate)} วัน</div>
                    </button>
                  ) : (
                    <span className="w-28 text-right text-sm text-slate-300">—</span>
                  )}
                  <button onClick={() => { void confirmDialog({ title: 'ลบบริการต่อเนื่อง?', message: `"${sv.label}" จะหายจาก MRR/การแจ้งต่ออายุ — มีบันทึกใน audit log`, confirmLabel: 'ลบ', danger: true }).then((yes) => { if (yes) void api.delete(`/api/services/${sv.id}`).then(reload) }) }} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500" title="ลบบริการ">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </Section>

          <Section title="อีเมลที่ผ่านมา">
            <div className="px-5 py-6 text-center text-sm text-slate-400">
              <Mail className="w-6 h-6 mx-auto mb-2 text-slate-300" />
              จะเชื่อมประวัติอีเมลเมื่อเปิดใช้ <span className="font-medium text-slate-500">อีเมลกลาง</span> (P3)
            </div>
          </Section>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-4 flex items-center gap-1"><Check className="w-3 h-3" /> ยอดทั้งหมดคำนวณสดจากโปรเจกต์/งวดจ่าย/บริการ — ไม่เก็บซ้ำ</p>
    </div>
  )
}
