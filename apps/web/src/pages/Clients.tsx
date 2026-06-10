import { formatSatang } from '@seedoffice/core'
import { AlertCircle, CalendarClock, Plus, Repeat, Search, StickyNote, TrendingUp, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import { fmtThaiDate } from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'

export interface ClientRow {
  id: string
  name: string
  logo: string | null
  contactEmail: string | null
  projectCount: number
  quotedSatang: number
  paidSatang: number
  unpaidSatang: number
  overdueSatang: number
  paidPct: number | null
  mrrSatang: number
  nextExpiry: { nextDueDate: string; daysUntil: number } | null
  hasNotes: boolean
}
interface ClientList {
  rows: ClientRow[]
  summary: {
    salesThisYearSatang: number
    paidThisYearSatang: number
    mrrSatang: number
    arrSatang: number
    overdueSatang: number
    overdueClients: number
    expiringCount: number
  }
}

export const expiryCls = (days: number) =>
  days <= 7 ? 'text-rose-600 font-medium' : days <= 30 ? 'text-amber-600' : 'text-slate-500'

type Tab = 'all' | 'chase' | 'expiring'

function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({ name: '', logo: '', contactName: '', contactEmail: '', contactPhone: '' })
  const input = 'w-full text-sm bg-white shadow-xs rounded-lg px-3 py-2'
  const submit = async () => {
    const created = await api.post<{ id: string }>('/api/clients', {
      name: form.name,
      ...(form.logo ? { logo: form.logo } : {}),
      ...(form.contactName ? { contactName: form.contactName } : {}),
      ...(form.contactEmail ? { contactEmail: form.contactEmail } : {}),
      ...(form.contactPhone ? { contactPhone: form.contactPhone } : {}),
    })
    onCreated(created.id)
  }
  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <div className="absolute inset-x-0 top-24 mx-auto w-full max-w-md px-4">
        <div className="bg-white rounded-lg shadow-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-slate-900">เพิ่มลูกค้า</div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input placeholder="โลโก้" value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} className="w-20 text-sm bg-white shadow-xs rounded-lg px-3 py-2" />
              <input autoFocus placeholder="ชื่อลูกค้า/บริษัท" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
            </div>
            <input placeholder="ชื่อผู้ติดต่อ" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} className={input} />
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="อีเมล" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} className={input} />
              <input placeholder="โทร" value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} className={input} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void submit()} disabled={!form.name.trim()} className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-40">เพิ่มลูกค้า</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SearchModal({ rows, onClose }: { rows: ClientRow[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const hits = rows.filter((r) => (r.name + ' ' + (r.contactEmail ?? '')).toLowerCase().includes(q.trim().toLowerCase()))
  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
      <div className="absolute inset-x-0 top-20 mx-auto w-full max-w-xl px-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200">
            <Search className="w-4 h-4 text-slate-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาลูกค้า (ชื่อ/อีเมล)..." className="flex-1 text-sm bg-transparent focus:outline-hidden placeholder:text-slate-400" />
            <kbd className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">esc</kbd>
          </div>
          <div className="max-h-[52vh] overflow-y-auto p-2">
            {hits.length === 0 && <div className="text-sm text-slate-400 text-center py-8">ไม่พบลูกค้า</div>}
            {hits.map((r) => (
              <div key={r.id} onClick={() => { onClose(); navigate(`/clients/${r.id}`) }} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
                <span className="text-lg">{r.logo ?? '🏢'}</span>
                <span className="flex-1 min-w-0 truncate text-slate-800">{r.name}</span>
                <span className="text-[11px] text-slate-400 truncate max-w-[40%]">{r.contactEmail ?? ''}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function ClientsPage() {
  const { data, reload } = useLoad<ClientList>(() => api.get('/api/clients'))
  const [tab, setTab] = useState<Tab>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null
      const typing = ['input', 'textarea', 'select'].includes((el?.tagName ?? '').toLowerCase()) || !!el?.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') { e.preventDefault(); setSearchOpen(true) }
      else if (e.code === 'Slash' && !typing) { e.preventDefault(); setSearchOpen(true) }
      else if (e.code === 'Escape') { setSearchOpen(false); setNewOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rows = useMemo(() => {
    const all = data?.rows ?? []
    if (tab === 'chase') return all.filter((r) => r.overdueSatang > 0).sort((a, b) => b.overdueSatang - a.overdueSatang)
    if (tab === 'expiring')
      return all
        .filter((r) => r.nextExpiry && r.nextExpiry.daysUntil <= 30)
        .sort((a, b) => (a.nextExpiry?.daysUntil ?? 999) - (b.nextExpiry?.daysUntil ?? 999))
    return all
  }, [data, tab])

  const s = data?.summary
  const card = (icon: React.ReactNode, colorCls: string, label: string, big: React.ReactNode, sub: string) => (
    <div className="bg-white rounded-lg shadow-xs p-4 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-lg grid place-items-center shrink-0 ${colorCls}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-xl font-bold text-slate-900 tabular-nums leading-tight mt-0.5">{big}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>
      </div>
    </div>
  )
  const tabBtn = (k: Tab, name: string, n: number) => (
    <button onClick={() => setTab(k)} className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium ${tab === k ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
      {name} <span className={`text-[11px] tabular-nums ${tab === k ? 'text-brand-600' : 'text-slate-400'}`}>{n}</span>
    </button>
  )

  return (
    <>
      <PageHeader
        title="ลูกค้า"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setSearchOpen(true)} title="ค้นหา (⌘K)" className="w-9 h-9 grid place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"><Search className="w-4 h-4" /></button>
            <button onClick={() => setNewOpen(true)} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg"><Plus className="w-4 h-4" /> เพิ่มลูกค้า</button>
          </div>
        }
      />
      <div className="p-3 sm:p-6">
        {s && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {card(<TrendingUp className="w-5 h-5" />, 'bg-brand-50 text-brand-600', `ยอดขายปีนี้ (ปี ${new Date().getFullYear() + 543})`, formatSatang(s.salesThisYearSatang), s.salesThisYearSatang > 0 ? `เก็บแล้ว ${formatSatang(s.paidThisYearSatang)}` : 'ยังไม่มีโปรเจกต์เริ่มปีนี้')}
            {card(<Repeat className="w-5 h-5" />, 'bg-sky-50 text-sky-600', 'รายได้ต่อเนื่อง', <>{formatSatang(s.mrrSatang)}<span className="text-sm font-medium text-slate-400">/ด</span></>, `ARR ${formatSatang(s.arrSatang)}/ปี`)}
            {card(<AlertCircle className="w-5 h-5" />, 'bg-rose-50 text-rose-600', 'ต้องตามเงิน', formatSatang(s.overdueSatang), `${s.overdueClients} ราย เกินกำหนด`)}
            {card(<CalendarClock className="w-5 h-5" />, 'bg-amber-50 text-amber-600', 'ใกล้หมดอายุ', `${s.expiringCount} บริการ`, 'ต่ออายุภายใน 30 วัน')}
          </div>
        )}

        <div className="flex flex-nowrap items-center gap-1 bg-slate-100 rounded-xl p-1 mb-4 w-full sm:w-fit overflow-x-auto">
          {tabBtn('all', 'ลูกค้าทั้งหมด', (data?.rows ?? []).length)}
          {tabBtn('chase', 'ต้องตามเงิน', (data?.rows ?? []).filter((r) => r.overdueSatang > 0).length)}
          {tabBtn('expiring', 'ใกล้หมดอายุ', (data?.rows ?? []).filter((r) => r.nextExpiry && r.nextExpiry.daysUntil <= 30).length)}
        </div>

        <div className="bg-white rounded-lg shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[860px]">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left font-medium px-4 py-3">ลูกค้า</th>
                  <th className="text-center font-medium px-2 py-3">โปรเจกต์</th>
                  <th className="text-right font-medium px-3 py-3">เสนอราคา</th>
                  <th className="text-right font-medium px-3 py-3">จ่ายแล้ว</th>
                  <th className="text-right font-medium px-3 py-3">ค้างชำระ</th>
                  <th className="text-right font-medium px-3 py-3">ต่อเนื่อง</th>
                  <th className="text-left font-medium px-4 py-3">ต่ออายุถัดไป</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-slate-400 py-10 text-sm">{tab === 'all' ? 'ยังไม่มีลูกค้า — กด "เพิ่มลูกค้า" หรือสร้างพร้อมโปรเจกต์ใหม่' : 'ไม่มีลูกค้าในมุมมองนี้'}</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => navigate(`/clients/${r.id}`)} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg leading-none">{r.logo ?? '🏢'}</span>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-800 flex items-center gap-1.5 min-w-0">
                            <span className="truncate">{r.name}</span>
                            {r.hasNotes && <StickyNote className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">{r.contactEmail ?? ''}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 text-center text-slate-600 tabular-nums">{r.projectCount || '—'}</td>
                    <td className="px-3 text-right text-slate-700 tabular-nums">{r.quotedSatang ? formatSatang(r.quotedSatang) : '—'}</td>
                    <td className="px-3 text-right tabular-nums">
                      {r.paidPct != null ? (<><span className="text-slate-700">{formatSatang(r.paidSatang)}</span> <span className="text-[11px] text-slate-400">{r.paidPct}%</span></>) : '—'}
                    </td>
                    <td className="px-3 text-right tabular-nums">
                      {r.overdueSatang > 0 ? <span className="text-rose-600 font-medium">{formatSatang(r.overdueSatang)}</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className={`px-3 text-right tabular-nums ${r.mrrSatang > 0 ? 'text-slate-700' : 'text-slate-300'}`}>
                      {r.mrrSatang > 0 ? (<>{formatSatang(r.mrrSatang)}<span className="text-[11px] text-slate-400">/ด</span></>) : '—'}
                    </td>
                    <td className="px-4">
                      {r.nextExpiry ? (
                        <><span className={expiryCls(r.nextExpiry.daysUntil)}>{fmtThaiDate(r.nextExpiry.nextDueDate)}</span> <span className="text-[11px] text-slate-400">· อีก {r.nextExpiry.daysUntil}ว</span></>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 mt-3">มุมมองช่วยตามเอง — ระบบไม่ส่งอีเมลหาลูกค้าอัตโนมัติ (SPEC §4.17)</p>
      </div>
      {searchOpen && <SearchModal rows={data?.rows ?? []} onClose={() => setSearchOpen(false)} />}
      {newOpen && (
        <NewClientModal
          onClose={() => setNewOpen(false)}
          onCreated={(id) => { setNewOpen(false); void reload(); navigate(`/clients/${id}`) }}
        />
      )}
    </>
  )
}
