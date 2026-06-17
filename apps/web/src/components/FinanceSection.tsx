import { formatSatang } from '@seedoffice/core'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../lib/api'
import { fmtThaiDate } from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'
import { useDialog } from './Dialog'

interface Milestone {
  id: string
  name: string
  budgetSatang: number | null
  dueDate: string | null
  status: 'planned' | 'active' | 'done'
}
interface Payment {
  id: string
  installmentNo: number
  label: string | null
  amountSatang: number
  dueDate: string | null
  paidAt: string | null
}
interface Finance {
  milestones: Milestone[]
  payments: Payment[]
  totalSatang: number
  paidSatang: number
  paidPct: number | null
}

const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
const MS_STATUS: Record<Milestone['status'], { label: string; cls: string }> = {
  planned: { label: 'รอเริ่ม', cls: 'bg-divider text-dim' },
  active: { label: 'กำลังทำ', cls: 'bg-warning-100 text-warning-700' },
  done: { label: 'เสร็จ', cls: 'bg-success-100 text-success-700' },
}

/** งวดงาน + การชำระเงิน (owner/member เท่านั้น — ผู้เรียกกรอง role แล้ว) */
export function FinanceSection({ projectId }: { projectId: string }) {
  const { data, reload } = useLoad<Finance>(() => api.get(`/api/projects/${projectId}/finance`), [projectId])
  const { confirmDialog } = useDialog()
  const [msForm, setMsForm] = useState({ open: false, name: '', budgetBaht: '', due: '' })
  const [payForm, setPayForm] = useState({ open: false, label: '', amountBaht: '', due: '' })
  const today = bkkToday()
  if (!data) return null

  const addMilestone = async () => {
    await api.post(`/api/projects/${projectId}/milestones`, {
      name: msForm.name,
      ...(msForm.budgetBaht ? { budgetSatang: Math.round(Number(msForm.budgetBaht) * 100) } : {}),
      ...(msForm.due ? { dueDate: msForm.due } : {}),
    })
    setMsForm({ open: false, name: '', budgetBaht: '', due: '' })
    await reload()
  }
  const addPayment = async () => {
    await api.post(`/api/projects/${projectId}/payments`, {
      ...(payForm.label ? { label: payForm.label } : {}),
      amountSatang: Math.round(Number(payForm.amountBaht) * 100),
      ...(payForm.due ? { dueDate: payForm.due } : {}),
    })
    setPayForm({ open: false, label: '', amountBaht: '', due: '' })
    await reload()
  }
  const togglePaid = async (p: Payment) => {
    await api.patch(`/api/payments/${p.id}`, { paidAt: p.paidAt ? null : today })
    await reload()
  }
  const cycleMsStatus = async (m: Milestone) => {
    const next = m.status === 'planned' ? 'active' : m.status === 'active' ? 'done' : 'planned'
    await api.patch(`/api/milestones/${m.id}`, { status: next })
    await reload()
  }

  const input = 'text-sm bg-white shadow-xs rounded-lg px-2.5 py-1.5'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
      {/* งวดงาน */}
      <div className="bg-white rounded-lg shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-sm font-semibold text-body">งวดงาน (milestones)</span>
          <button onClick={() => setMsForm({ ...msForm, open: !msForm.open })} className="text-xs text-muted hover:text-brand-600 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> งวด
          </button>
        </div>
        {msForm.open && (
          <div className="flex flex-wrap gap-2 px-4 py-2.5 bg-hover/70">
            <input autoFocus placeholder="ชื่องวด" value={msForm.name} onChange={(e) => setMsForm({ ...msForm, name: e.target.value })} className={`${input} flex-1 min-w-32`} />
            <input type="number" placeholder="งบ ฿" value={msForm.budgetBaht} onChange={(e) => setMsForm({ ...msForm, budgetBaht: e.target.value })} className={`${input} w-24`} />
            <input type="date" value={msForm.due} onChange={(e) => setMsForm({ ...msForm, due: e.target.value })} className={input} />
            <button onClick={() => void addMilestone()} disabled={!msForm.name} className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">เพิ่ม</button>
          </div>
        )}
        <div className="divide-y divide-hover">
          {data.milestones.length === 0 && <div className="px-4 py-4 text-sm text-border">ยังไม่แบ่งงวดงาน</div>}
          {data.milestones.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
              <button onClick={() => void cycleMsStatus(m)} className={`text-[11px] px-2 py-0.5 rounded-full ${MS_STATUS[m.status].cls}`} title="คลิกเปลี่ยนสถานะ">
                {MS_STATUS[m.status].label}
              </button>
              <span className="flex-1 min-w-0 truncate text-body">{m.name}</span>
              {m.dueDate && <span className="text-[11px] text-muted">{fmtThaiDate(m.dueDate)}</span>}
              <span className="tabular-nums text-soft w-20 text-right">{m.budgetSatang != null ? formatSatang(m.budgetSatang) : '—'}</span>
              <button onClick={() => { void confirmDialog({ title: 'ลบงวดงานนี้?', message: `"${m.name}" จะถูกลบออกจากการคิด P&L ต่องวด`, confirmLabel: 'ลบ', danger: true }).then((yes) => { if (yes) void api.delete(`/api/milestones/${m.id}`).then(reload) }) }} className="text-border-subtle hover:text-danger-500" title="ลบงวด">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* การชำระเงิน */}
      <div className="bg-white rounded-lg shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
          <span className="text-sm font-semibold text-body">
            การชำระเงิน {data.paidPct != null && <span className="text-xs font-normal text-muted">· จ่ายแล้ว {data.paidPct}% ({formatSatang(data.paidSatang)} / {formatSatang(data.totalSatang)})</span>}
          </span>
          <button onClick={() => setPayForm({ ...payForm, open: !payForm.open })} className="text-xs text-muted hover:text-brand-600 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> งวดจ่าย
          </button>
        </div>
        {payForm.open && (
          <div className="flex flex-wrap gap-2 px-4 py-2.5 bg-hover/70">
            <input autoFocus placeholder="ป้าย เช่น งวด 1 · มัดจำ 40%" value={payForm.label} onChange={(e) => setPayForm({ ...payForm, label: e.target.value })} className={`${input} flex-1 min-w-36`} />
            <input type="number" placeholder="ยอด ฿" value={payForm.amountBaht} onChange={(e) => setPayForm({ ...payForm, amountBaht: e.target.value })} className={`${input} w-28`} />
            <input type="date" value={payForm.due} onChange={(e) => setPayForm({ ...payForm, due: e.target.value })} className={input} />
            <button onClick={() => void addPayment()} disabled={!payForm.amountBaht} className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">เพิ่ม</button>
          </div>
        )}
        <div className="divide-y divide-hover">
          {data.payments.length === 0 && <div className="px-4 py-4 text-sm text-border">ยังไม่มีงวดชำระ</div>}
          {data.payments.map((p) => {
            const overdue = !p.paidAt && p.dueDate != null && p.dueDate < today
            return (
              <div key={p.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <button
                  onClick={() => void togglePaid(p)}
                  title={p.paidAt ? `รับเงินแล้ว ${p.paidAt} (คลิกยกเลิก)` : 'ติ๊กเมื่อรับเงินแล้ว'}
                  className={`w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 ${p.paidAt ? 'border-success-400 bg-success-400 text-white' : 'border-border'}`}
                >
                  {p.paidAt && <Check className="w-2.5 h-2.5" />}
                </button>
                <span className={`flex-1 min-w-0 truncate ${p.paidAt ? 'text-muted' : 'text-body'}`}>{p.label ?? `งวด ${p.installmentNo}`}</span>
                {overdue && <span className="text-[11px] bg-danger-100 text-danger-600 px-2 py-0.5 rounded-full">เกินกำหนด</span>}
                {p.dueDate && !overdue && !p.paidAt && <span className="text-[11px] text-muted">กำหนด {fmtThaiDate(p.dueDate)}</span>}
                <span className="tabular-nums text-body w-24 text-right">{formatSatang(p.amountSatang)}</span>
                <button onClick={() => { void confirmDialog({ title: 'ลบงวดจ่ายนี้?', message: `${p.label ?? `งวด ${p.installmentNo}`} (${formatSatang(p.amountSatang)}) จะถูกลบ — มีบันทึกใน audit log`, confirmLabel: 'ลบ', danger: true }).then((yes) => { if (yes) void api.delete(`/api/payments/${p.id}`).then(reload) }) }} className="text-border-subtle hover:text-danger-500" title="ลบงวดจ่าย">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
