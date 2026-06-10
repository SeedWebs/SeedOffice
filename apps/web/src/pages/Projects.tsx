import { Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  fmtBudgetK,
  fmtThaiDate,
  STATUS_CHIP,
  STATUS_LABEL,
  TH_MONTHS,
  yearPos,
  type ProjectRow,
} from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'

const THIS_YEAR = new Date(Date.now() + 7 * 3_600_000).getUTCFullYear()
const todayPos = () => yearPos(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10), THIS_YEAR)

function Timeline({ rows, showMoney }: { rows: ProjectRow[]; showMoney: boolean }) {
  const active = rows.filter((p) => p.type === 'project' && p.status !== 'archived' && p.startDate && p.dueDate)
  if (active.length === 0)
    return <div className="text-sm text-slate-400 text-center py-6">ยังไม่มีโปรเจกต์ที่มีช่วงเวลา — สร้างโปรเจกต์แรกแล้วใส่วันเริ่ม/กำหนดส่ง</div>
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1180px]">
        <div className="flex text-[11px] text-slate-400 mb-1">
          <div className="w-56 shrink-0 sticky left-0 bg-white z-20"></div>
          <div className="flex-1 flex">
            {TH_MONTHS.map((m) => (
              <div key={m} className="flex-1 text-center">{m}</div>
            ))}
          </div>
        </div>
        {active.map((p) => {
          const L = yearPos(p.startDate!, THIS_YEAR)
          const W = Math.max(2, yearPos(p.dueDate!, THIS_YEAR) - L)
          return (
            <div key={p.id} className="flex items-center py-1">
              <div className="w-56 shrink-0 sticky left-0 bg-white z-20 flex items-center gap-2 text-sm pr-3">
                <span>{p.logo ?? '📁'}</span>
                <Link to={`/projects/${p.id}`} className="font-medium text-slate-700 truncate hover:text-brand-600 hover:underline">
                  {p.name}
                </Link>
                {showMoney && p.quotedSatang != null && (
                  <span className="ml-auto text-xs text-slate-400 tabular-nums shrink-0">{fmtBudgetK(p.quotedSatang)}</span>
                )}
              </div>
              <div className="relative flex-1 h-7 bg-slate-50 rounded-md">
                <div className="absolute top-0 bottom-0 w-px bg-rose-400 z-10" style={{ left: `${todayPos()}%` }} />
                <div className={`group absolute inset-y-1 rounded-md ${STATUS_CHIP[p.status]}`} style={{ left: `${L}%`, width: `${W}%` }}>
                  <div className="flex items-center h-full px-2 text-[11px] font-medium truncate">{STATUS_LABEL[p.status]}</div>
                  <div className="absolute left-2 bottom-full mb-1 whitespace-nowrap bg-slate-900 text-white text-[11px] rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 pointer-events-none transition shadow-lg z-30">
                    {fmtThaiDate(p.startDate)} – {fmtThaiDate(p.dueDate, true)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Cards({ rows, showMoney }: { rows: ProjectRow[]; showMoney: boolean }) {
  const navigate = useNavigate()
  const list = rows.filter((p) => p.type === 'project' && p.status !== 'archived')
  if (list.length === 0)
    return <div className="bg-white rounded-lg shadow-xs p-8 text-center text-sm text-slate-400">ยังไม่มีงานโปรเจกต์ — กด "โปรเจกต์ใหม่" มุมขวาบน</div>
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {list.map((p) => (
        <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="bg-white rounded-lg shadow-xs p-5 cursor-pointer hover:shadow-sm transition">
          <div className="flex items-center gap-2">
            <span className="text-lg leading-none">{p.logo ?? '📁'}</span>
            <div className="flex-1 min-w-0 font-semibold text-slate-800 truncate">{p.name}</div>
          </div>
          <div className="flex items-center gap-2 mt-2.5">
            <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_CHIP[p.status]}`}>{STATUS_LABEL[p.status]}</span>
            {showMoney && p.paidPct != null && (
              <span className="text-xs text-slate-500 tabular-nums">
                {p.paidPct}% <span className="text-slate-400">จ่ายแล้ว</span>
              </span>
            )}
            <span className="ml-auto text-[11px] text-slate-400">{p.clientName ?? ''}</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-3">
            {p.startDate ? `${fmtThaiDate(p.startDate)} – ${fmtThaiDate(p.dueDate)}` : 'ยังไม่กำหนดช่วงเวลา'}
          </div>
        </div>
      ))}
    </div>
  )
}

function RecurringTable({ rows }: { rows: ProjectRow[] }) {
  const navigate = useNavigate()
  // เรียงตาม todo ที่ต้องส่งก่อน — รายที่ไม่มี todo ค้างไหลลงล่าง (SPEC §4.3B)
  const list = rows
    .filter((p) => p.type === 'recurring' && p.status !== 'archived')
    .sort((a, b) => (a.openTodo?.dueDate ?? '9999') < (b.openTodo?.dueDate ?? '9999') ? -1 : 1)
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
  const dueChip = (d: string | null) => {
    if (!d) return 'bg-slate-100 text-slate-500'
    if (d <= today) return 'bg-rose-100 text-rose-600'
    return 'bg-amber-100 text-amber-700'
  }
  return (
    <div className="bg-white rounded-lg shadow-xs overflow-x-auto">
      <table className="w-full text-sm min-w-[600px]">
        <thead className="bg-slate-50 text-slate-500 text-xs">
          <tr>
            <th className="text-left font-medium px-5 py-3">โปรเจกต์</th>
            <th className="text-left font-medium px-3 py-3">Todo ที่เปิดอยู่</th>
            <th className="text-left font-medium px-3 py-3 w-28">กำหนดส่ง</th>
            <th className="text-left font-medium px-5 py-3 w-28">ค้างที่</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {list.length === 0 && (
            <tr><td colSpan={4} className="text-center text-sm text-slate-400 py-8">ยังไม่มีงานต่อเนื่อง</td></tr>
          )}
          {list.map((p) => (
            <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="hover:bg-slate-50 cursor-pointer">
              <td className={`px-5 py-3 ${p.openTodo ? 'text-slate-700' : 'text-slate-500'}`}>{p.logo ?? '📁'} {p.name}</td>
              {p.openTodo ? (
                <>
                  <td className="px-3 text-slate-700">{p.openTodo.title}</td>
                  <td className="px-3"><span className={`text-[11px] px-2 py-0.5 rounded-full ${dueChip(p.openTodo.dueDate)}`}>{fmtThaiDate(p.openTodo.dueDate)}</span></td>
                  <td className="px-5 text-xs text-slate-500">{p.openTodo.assigneeName ?? '—'}</td>
                </>
              ) : (
                <>
                  <td className="px-3 text-slate-300">— ไม่มี todo ค้าง</td>
                  <td className="px-3 text-slate-300 text-xs">—</td>
                  <td className="px-5"></td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type Filter = 'all' | 'project' | 'recurring' | 'archived'
const FILTER_LABEL: Record<Filter, string> = { all: 'ทั้งหมด', project: 'กำลังทำ', recurring: 'งานต่อเนื่อง', archived: 'archived' }

function SearchModal({ rows, onClose }: { rows: ProjectRow[]; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const navigate = useNavigate()
  const hits = useMemo(() => {
    return rows.filter((p) => {
      if (filter === 'archived' && p.status !== 'archived') return false
      if (filter === 'project' && (p.type !== 'project' || p.status === 'archived')) return false
      if (filter === 'recurring' && (p.type !== 'recurring' || p.status === 'archived')) return false
      return p.name.toLowerCase().includes(q.trim().toLowerCase())
    })
  }, [rows, q, filter])

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
      <div className="absolute inset-x-0 top-20 mx-auto w-full max-w-xl px-4">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-200">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ค้นหาโปรเจกต์ (active + archived)..."
              className="flex-1 text-sm bg-transparent focus:outline-hidden placeholder:text-slate-400"
            />
            <kbd className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">esc</kbd>
          </div>
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-slate-200 text-xs flex-wrap">
            <span className="text-slate-400 mr-1">กรอง:</span>
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded-full ${filter === f ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}
              >
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
          <div className="max-h-[52vh] overflow-y-auto p-2">
            {hits.length === 0 && <div className="text-sm text-slate-400 text-center py-8">ไม่พบโปรเจกต์</div>}
            {hits.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  onClose()
                  navigate(`/projects/${p.id}`)
                }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm"
              >
                <span className="text-lg">{p.logo ?? '📁'}</span>
                <span className={`flex-1 min-w-0 truncate ${p.status === 'archived' ? 'text-slate-400' : 'text-slate-800'}`}>{p.name}</span>
                <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${STATUS_CHIP[p.status]}`}>{STATUS_LABEL[p.status]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: clientList } = useLoad<{ id: string; name: string }[]>(() => api.get('/api/clients'))
  const [form, setForm] = useState({
    name: '', logo: '', type: 'project' as 'project' | 'recurring', clientId: '', clientName: '',
    budgetBaht: '', startDate: '', dueDate: '', recurringPeriod: 'monthly' as 'monthly' | 'yearly',
  })
  const [error, setError] = useState('')
  const submit = async () => {
    try {
      await api.post('/api/projects', {
        name: form.name,
        logo: form.logo || undefined,
        type: form.type,
        ...(form.clientId ? { clientId: form.clientId } : form.clientName ? { clientName: form.clientName } : {}),
        ...(form.type === 'project'
          ? {
              ...(form.budgetBaht ? { quotedSatang: Math.round(Number(form.budgetBaht) * 100) } : {}),
              ...(form.startDate ? { startDate: form.startDate } : {}),
              ...(form.dueDate ? { dueDate: form.dueDate } : {}),
            }
          : { recurringPeriod: form.recurringPeriod }),
      })
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ผิดพลาด')
    }
  }
  const input = 'w-full text-sm bg-white shadow-xs rounded-lg px-3 py-2'
  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <div className="absolute inset-x-0 top-24 mx-auto w-full max-w-md px-4">
        <div className="bg-white rounded-lg shadow-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-slate-900">โปรเจกต์ใหม่</div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <input placeholder="โลโก้ (emoji)" value={form.logo} onChange={(e) => setForm({ ...form, logo: e.target.value })} className="w-24 text-sm bg-white shadow-xs rounded-lg px-3 py-2" />
              <input placeholder="ชื่อโปรเจกต์..." value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} autoFocus />
            </div>
            <div className="flex bg-slate-100 rounded-lg p-0.5 text-sm font-medium">
              {(['project', 'recurring'] as const).map((t) => (
                <button key={t} onClick={() => setForm({ ...form, type: t })} className={`flex-1 px-2.5 py-1.5 rounded-md ${form.type === t ? 'bg-white shadow-xs text-slate-900' : 'text-slate-500'}`}>
                  {t === 'project' ? 'งานโปรเจกต์ (fixed)' : 'งานต่อเนื่อง'}
                </button>
              ))}
            </div>
            <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} className={input}>
              <option value="">ลูกค้า: เลือก หรือพิมพ์ใหม่ด้านล่าง</option>
              {(clientList ?? []).map((cl) => (
                <option key={cl.id} value={cl.id}>{cl.name}</option>
              ))}
            </select>
            {!form.clientId && (
              <input placeholder="หรือพิมพ์ชื่อลูกค้าใหม่" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} className={input} />
            )}
            {form.type === 'project' ? (
              <>
                <input type="number" placeholder="ราคาขาย/งบ (บาท)" value={form.budgetBaht} onChange={(e) => setForm({ ...form, budgetBaht: e.target.value })} className={input} />
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs text-slate-400">เริ่ม<input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={input} /></label>
                  <label className="text-xs text-slate-400">กำหนดส่ง<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={input} /></label>
                </div>
              </>
            ) : (
              <select value={form.recurringPeriod} onChange={(e) => setForm({ ...form, recurringPeriod: e.target.value as 'monthly' | 'yearly' })} className={input}>
                <option value="monthly">รอบรายเดือน</option>
                <option value="yearly">รอบรายปี</option>
              </select>
            )}
          </div>
          {error && <div className="text-xs text-rose-600 mt-2">{error}</div>}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void submit()} disabled={!form.name} className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-40">สร้าง</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function ProjectsPage() {
  const { user } = useAuth()
  const showMoney = user?.role !== 'vendor'
  const { data, loading, reload } = useLoad<ProjectRow[]>(() => api.get('/api/projects'))
  const [searchOpen, setSearchOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['input', 'textarea', 'select'].includes((document.activeElement?.tagName ?? '').toLowerCase())
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') { e.preventDefault(); setSearchOpen(true) }
      else if (e.code === 'Slash' && !typing) { e.preventDefault(); setSearchOpen(true) }
      else if (e.code === 'Escape') { setSearchOpen(false); setNewOpen(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rows = data ?? []
  const projCount = rows.filter((p) => p.type === 'project' && p.status !== 'archived').length
  const maCount = rows.filter((p) => p.type === 'recurring' && p.status !== 'archived').length

  return (
    <>
      <PageHeader
        title="โปรเจกต์"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => setSearchOpen(true)} title="ค้นหา (⌘K)" className="w-9 h-9 grid place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
              <Search className="w-4 h-4" />
            </button>
            {showMoney && (
              <button onClick={() => setNewOpen(true)} className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg">
                <Plus className="w-4 h-4" /> โปรเจกต์ใหม่
              </button>
            )}
          </div>
        }
      />
      <div className="p-3 sm:p-6">
        {loading ? (
          <div className="bg-white rounded-lg shadow-xs p-10 text-center text-sm text-slate-400">กำลังโหลด…</div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow-xs p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-slate-900 text-sm">ไทม์ไลน์</span>
                <span className="text-[11px] text-slate-400">{showMoney ? 'งบ = ราคาขาย · ' : ''}เส้นแดง = วันนี้ · ปี {THIS_YEAR + 543}</span>
              </div>
              <Timeline rows={rows} showMoney={showMoney} />
            </div>

            <div className="font-semibold text-slate-900 mb-3">
              งานโปรเจกต์ <span className="text-xs font-normal text-slate-400">· มีกำหนดส่ง · {projCount} รายการ</span>
            </div>
            <Cards rows={rows} showMoney={showMoney} />

            <div className="mt-6">
              <div className="font-semibold text-slate-900 mb-3">
                งานต่อเนื่อง <span className="text-xs font-normal text-slate-400">· ดูแลรายเดือน/ปี · {maCount} ราย</span>
              </div>
              <RecurringTable rows={rows} />
            </div>
          </>
        )}
      </div>
      {searchOpen && <SearchModal rows={rows} onClose={() => setSearchOpen(false)} />}
      {newOpen && (
        <NewProjectModal
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false)
            void reload()
          }}
        />
      )}
    </>
  )
}
