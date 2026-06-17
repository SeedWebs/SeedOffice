import { formatSatang } from '@seedoffice/core'
import { Camera, Check, Download, FileText, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useDialog } from '../components/Dialog'
import { PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtThaiDate } from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'

interface ExpenseRow {
  id: string
  expenseDate: string
  amountSatang: number
  category: string
  description: string
  receiptKey: string | null
  paidBy: 'company' | 'self'
  status: 'pending' | 'approved' | 'rejected' | 'reimbursed'
  userName: string | null
  projectName: string | null
}
interface ExpenseList {
  month: string
  rows: ExpenseRow[]
  owedSatang: number
}

const CATEGORY_LABEL: Record<string, string> = {
  hosting: 'ค่าโฮสต์/โดเมน',
  travel: 'เดินทาง',
  equipment: 'อุปกรณ์',
  software: 'ซอฟต์แวร์',
  other: 'อื่นๆ',
}
const STATUS_CHIP: Record<ExpenseRow['status'], { label: string; cls: string }> = {
  pending: { label: 'รออนุมัติ', cls: 'bg-warning-100 text-warning-700' },
  approved: { label: 'อนุมัติ', cls: 'bg-brand-50 text-brand-700' },
  rejected: { label: 'ปฏิเสธ', cls: 'bg-danger-100 text-danger-600' },
  reimbursed: { label: 'คืนแล้ว', cls: 'bg-divider text-dim' },
}

const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
const thisMonth = () => bkkToday().slice(0, 7)
const monthLabel = (m: string) => fmtThaiDate(`${m}-01`, true).replace(/^1 /, '')

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const { data: projectsRes } = useLoad<{ id: string; name: string; status: string; statusKind: string }[]>(() => api.get('/api/projects'))
  const [form, setForm] = useState({ description: '', amountBaht: '', category: 'hosting', date: bkkToday(), paidBy: 'self' as 'self' | 'company', projectId: '' })
  const [receipt, setReceipt] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const submit = async () => {
    try {
      setBusy(true)
      setError('')
      const fd = new FormData()
      fd.append('expenseDate', form.date)
      fd.append('amountSatang', String(Math.round(Number(form.amountBaht) * 100)))
      fd.append('category', form.category)
      fd.append('description', form.description.trim())
      fd.append('paidBy', form.paidBy)
      if (form.projectId) fd.append('projectId', form.projectId)
      if (receipt) fd.append('receipt', receipt)
      const res = await fetch('/api/expenses', { method: 'POST', body: fd })
      if (!res.ok) throw new Error(((await res.json()) as { message?: string }).message ?? 'ผิดพลาด')
      setForm({ description: '', amountBaht: '', category: 'hosting', date: bkkToday(), paidBy: 'self', projectId: '' })
      setReceipt(null)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ผิดพลาด')
    } finally {
      setBusy(false)
    }
  }

  const input = 'w-full text-sm bg-white shadow-xs rounded-lg px-3 py-2'
  const activeProjects = (projectsRes ?? []).filter((p) => p.statusKind !== 'archived')
  return (
    <div className="bg-white rounded-lg shadow-xs p-5">
      <div className="font-semibold text-ink mb-3">ลงค่าใช้จ่าย</div>
      <div className="space-y-2">
        <input placeholder="รายละเอียด เช่น ค่า domain" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" placeholder="จำนวน ฿" value={form.amountBaht} onChange={(e) => setForm({ ...form, amountBaht: e.target.value })} className={input} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className={input} aria-label="หมวด">
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className={input} aria-label="วันที่" />
          <select value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value as 'self' | 'company' })} className={input} aria-label="จ่ายโดย">
            <option value="self">ออกเอง (รอเบิกคืน)</option>
            <option value="company">บริษัทจ่าย</option>
          </select>
        </div>
        <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className={input} aria-label="โปรเจกต์">
          <option value="">— ไม่ผูกโปรเจกต์ —</option>
          {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => fileRef.current?.click()} className="w-full text-sm border-2 border-dashed border-border-subtle rounded-lg py-3 text-muted hover:border-brand-300 hover:text-brand-600 flex items-center justify-center gap-1">
          <Camera className="w-4 h-4" /> {receipt ? receipt.name : 'แนบรูปใบเสร็จ'}
          {receipt && <X className="w-3.5 h-3.5 ml-1" onClick={(e) => { e.stopPropagation(); setReceipt(null) }} />}
        </button>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { setReceipt(e.target.files?.[0] ?? null); e.target.value = '' }} />
        {error && <div className="text-xs text-danger-600">{error}</div>}
        <button onClick={() => void submit()} disabled={busy || !form.description.trim() || !form.amountBaht} className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg">
          ส่งขออนุมัติ
        </button>
      </div>
    </div>
  )
}

export function ExpensesPage() {
  const { user } = useAuth()
  const isOwner = user?.role === 'owner'
  const [month, setMonth] = useState(thisMonth())
  const { data, reload } = useLoad<ExpenseList>(() => api.get(`/api/expenses?month=${month}`), [month])
  const { confirmDialog } = useDialog()

  const setStatus = async (row: ExpenseRow, status: 'approved' | 'rejected' | 'reimbursed') => {
    if (status === 'rejected') {
      const yes = await confirmDialog({ title: 'ปฏิเสธรายการนี้?', message: `${row.description} (${formatSatang(row.amountSatang)}) โดย ${row.userName}`, confirmLabel: 'ปฏิเสธ', danger: true })
      if (!yes) return
    }
    await api.patch(`/api/expenses/${row.id}/status`, { status })
    await reload()
  }
  const shiftMonth = (dir: -1 | 1) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(Date.UTC(y!, m! - 1 + dir, 1))
    setMonth(d.toISOString().slice(0, 7))
  }

  return (
    <>
      <PageHeader
        title="เงินสดย่อย"
        action={isOwner ? (
          <button onClick={() => window.open(`/api/expenses/export?month=${month}`, '_blank')} className="flex items-center gap-2 text-sm shadow-xs bg-white rounded-lg px-3 py-2 hover:bg-hover">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        ) : undefined}
      />
      <div className="p-3 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <ExpenseForm onDone={() => void reload()} />
          <div className="lg:col-span-2 bg-white rounded-lg shadow-xs p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="font-semibold text-ink flex items-center gap-1">
                เงินสดย่อย
                <button onClick={() => shiftMonth(-1)} className="px-1.5 py-0.5 rounded hover:bg-divider text-muted">‹</button>
                <span className="text-sm font-normal text-dim">{monthLabel(month)}</span>
                <button onClick={() => shiftMonth(1)} className="px-1.5 py-0.5 rounded hover:bg-divider text-muted">›</button>
              </div>
              <span className="text-sm text-dim">
                ค้างคืน{isOwner ? ' (ทั้งทีม)' : ''} <b className="text-strong tabular-nums">{formatSatang(data?.owedSatang ?? 0)}</b>
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="text-muted text-xs border-b border-border-subtle">
                  <tr>
                    <th className="text-left font-medium py-2">รายการ</th>
                    {isOwner && <th className="text-left font-medium py-2">คน</th>}
                    <th className="text-right font-medium py-2">จำนวน</th>
                    <th className="text-right font-medium py-2">สถานะ</th>
                    {isOwner && <th className="text-right font-medium py-2 w-36"></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hover">
                  {(data?.rows ?? []).length === 0 && (
                    <tr><td colSpan={5} className="text-center text-sm text-border py-8">ยังไม่มีรายการเดือนนี้ — ลงค่าใช้จ่ายจากฟอร์มซ้ายมือ</td></tr>
                  )}
                  {(data?.rows ?? []).map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate text-body">{r.description}</span>
                          {r.receiptKey && (
                            <a href={`/api/expenses/${r.id}/receipt`} target="_blank" rel="noreferrer" title="ดูใบเสร็จ" className="text-border hover:text-brand-600 shrink-0">
                              <FileText className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="text-[11px] text-muted">
                          {fmtThaiDate(r.expenseDate)} · {CATEGORY_LABEL[r.category]} · {r.paidBy === 'self' ? 'ออกเอง' : 'บริษัท'}{r.projectName ? ` · ${r.projectName}` : ''}
                        </div>
                      </td>
                      {isOwner && <td className="py-2.5 text-dim">{r.userName}</td>}
                      <td className="py-2.5 text-right tabular-nums text-body">{formatSatang(r.amountSatang)}</td>
                      <td className="py-2.5 text-right">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${STATUS_CHIP[r.status].cls}`}>{STATUS_CHIP[r.status].label}</span>
                      </td>
                      {isOwner && (
                        <td className="py-2.5 text-right">
                          {r.status === 'pending' && (
                            <span className="inline-flex gap-1">
                              <button onClick={() => void setStatus(r, 'approved')} title="อนุมัติ" className="w-7 h-7 grid place-items-center rounded-lg text-success-600 hover:bg-success-50"><Check className="w-4 h-4" /></button>
                              <button onClick={() => void setStatus(r, 'rejected')} title="ปฏิเสธ" className="w-7 h-7 grid place-items-center rounded-lg text-danger-500 hover:bg-danger-50"><X className="w-4 h-4" /></button>
                            </span>
                          )}
                          {r.status === 'approved' && r.paidBy === 'self' && (
                            <button onClick={() => void setStatus(r, 'reimbursed')} className="text-[11px] text-dim hover:text-brand-700 underline">คืนเงินแล้ว</button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted mt-3">สรุปเดือนนี้ → Export CSV เข้า FlowAccount · ค้างคืน = อนุมัติแล้ว (จ่ายเอง) ที่ยังไม่คืนเงิน</p>
          </div>
        </div>
      </div>
    </>
  )
}
