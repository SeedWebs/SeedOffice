import { formatSatang, minutesToHoursLabel, type AdjustmentKind } from '@seedoffice/core'
import { Download, Lock, MessageSquare, MessageSquarePlus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import { fmtThaiDate } from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'
import { cycleLabel, DEDUCT_ORDER, INCOME_ORDER, KIND_LABEL } from './Payroll'

interface Row {
  userId: string
  name: string
  role: string
  minutesTotal: number
  manualRatio: number
  baseSatang: number
  adjustments: { id: string; kind: AdjustmentKind; amountSatang: number; note: string | null }[]
  netSatang: number
  ownerNote: string | null
}
interface TeamPayroll {
  cycle: { start: string; end: string; payDate: string }
  rows: Row[]
  closed: boolean
}

const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

function RowEditor({ row, cycleStart, closed, onChanged }: { row: Row; cycleStart: string; closed: boolean; onChanged: () => void }) {
  const [form, setForm] = useState({ kind: 'allowance' as AdjustmentKind, amountBaht: '', note: '' })
  const [noteDraft, setNoteDraft] = useState(row.ownerNote ?? '')
  const add = async () => {
    await api.post('/api/admin/payroll/adjustments', {
      userId: row.userId,
      cycleStart,
      kind: form.kind,
      amountSatang: Math.round(Number(form.amountBaht) * 100),
      note: form.note || undefined,
    })
    setForm({ kind: 'allowance', amountBaht: '', note: '' })
    onChanged()
  }
  const saveNote = async () => {
    await api.put('/api/admin/payroll/notes', { userId: row.userId, cycleStart, body: noteDraft })
    onChanged()
  }
  const input = 'text-sm bg-white shadow-xs rounded-lg px-2.5 py-1.5'
  return (
    <div className="bg-slate-50/80 border-t border-slate-100 px-4 py-3 space-y-3">
      {!closed && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AdjustmentKind })} className={input} aria-label="ประเภทรายการ">
            <optgroup label="รายได้">
              {INCOME_ORDER.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </optgroup>
            <optgroup label="หัก">
              {DEDUCT_ORDER.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
            </optgroup>
          </select>
          <input type="number" placeholder="จำนวน ฿" value={form.amountBaht} onChange={(e) => setForm({ ...form, amountBaht: e.target.value })} className={`${input} w-28`} />
          <input placeholder="โน้ตเหตุผล (เช่น โบนัสปิดโปรเจกต์)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className={`${input} flex-1 min-w-40`} />
          <button onClick={() => void add()} disabled={!form.amountBaht} className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">เพิ่มรายการ</button>
        </div>
      )}
      {row.adjustments.length > 0 && (
        <div className="space-y-1">
          {row.adjustments.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <span className={`px-1.5 py-0.5 rounded ${INCOME_ORDER.includes(a.kind) ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}`}>{KIND_LABEL[a.kind]}</span>
              <span className="tabular-nums font-medium">{formatSatang(a.amountSatang)}</span>
              {a.note && <span className="text-slate-400 truncate">· {a.note}</span>}
              {!closed && (
                <button onClick={() => void api.delete(`/api/admin/payroll/adjustments/${a.id}`).then(onChanged)} className="ml-auto text-slate-300 hover:text-rose-500" title="ลบรายการ">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-start gap-2">
        <MessageSquare className="w-4 h-4 text-amber-500 mt-1.5 shrink-0" />
        <textarea
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          placeholder="โน้ตถึงเจ้าตัว (เตือน/ชม) — เห็นเฉพาะเจ้าตัวกับคุณ"
          disabled={closed}
          className="flex-1 text-sm bg-white shadow-xs rounded-lg px-3 py-2 min-h-9 disabled:opacity-50"
        />
        {!closed && (
          <button onClick={() => void saveNote()} className="text-xs bg-slate-800 text-white px-3 py-2 rounded-lg self-end">บันทึกโน้ต</button>
        )}
      </div>
    </div>
  )
}

export function PayrollOwnerPage() {
  const [date, setDate] = useState(bkkToday())
  const { data, reload } = useLoad<TeamPayroll>(() => api.get(`/api/admin/payroll?date=${date}`), [date])
  const [openRow, setOpenRow] = useState<string | null>(null)

  if (!data) return (
    <>
      <PageHeader title="ค่าตอบแทน" />
      <div className="p-6 text-sm text-slate-400">กำลังโหลด…</div>
    </>
  )

  const kindSum = (r: Row, kind: AdjustmentKind) => r.adjustments.filter((a) => a.kind === kind).reduce((s, a) => s + a.amountSatang, 0)
  const money = (satang: number, accent = '') =>
    satang === 0 ? <span className="text-slate-300">—</span> : <span className={accent}>{formatSatang(satang)}</span>

  const active = data.rows.filter((r) => r.minutesTotal > 0 || r.netSatang !== 0)
  const closeCycle = async () => {
    if (!confirm(`ปิด${cycleLabel(data.cycle)}? หลังปิดจะแก้เวลา/รายการย้อนหลังไม่ได้ และระบบจะ snapshot payslip ไว้เป็นหลักฐาน`)) return
    await api.post('/api/admin/payroll/close', { date })
    await reload()
  }
  const shiftCycle = (dir: -1 | 1) => {
    const base = new Date(Date.parse(`${dir === -1 ? data.cycle.start : data.cycle.end}T00:00:00Z`))
    base.setUTCDate(base.getUTCDate() + dir * 3)
    setDate(base.toISOString().slice(0, 10))
  }

  return (
    <>
      <PageHeader
        title="ค่าตอบแทน"
        action={
          <div className="flex items-center gap-2">
            <button onClick={() => window.open(`/api/admin/payroll/export?date=${date}`, '_blank')} className="flex items-center gap-2 text-sm shadow-xs bg-white rounded-lg px-3 py-2 hover:bg-slate-50">
              <Download className="w-4 h-4" /> Export CSV
            </button>
            {data.closed ? (
              <span className="flex items-center gap-1.5 text-sm bg-slate-100 text-slate-500 rounded-lg px-3 py-2"><Lock className="w-4 h-4" /> ปิดงวดแล้ว</span>
            ) : (
              <button onClick={() => void closeCycle()} className="flex items-center gap-2 text-sm bg-slate-800 text-white rounded-lg px-3 py-2 hover:bg-slate-900">
                <Lock className="w-4 h-4" /> ปิดงวด
              </button>
            )}
          </div>
        }
      />
      <div className="p-3 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 mb-4 text-sm text-slate-500">
          <button onClick={() => shiftCycle(-1)} className="px-2 py-1 rounded-lg hover:bg-slate-100">‹</button>
          <span>{cycleLabel(data.cycle)} · ตัดรอบ {fmtThaiDate(data.cycle.end)} · จ่าย {fmtThaiDate(data.cycle.payDate)}</span>
          <button onClick={() => shiftCycle(1)} className="px-2 py-1 rounded-lg hover:bg-slate-100">›</button>
        </div>
        <div className="bg-white rounded-lg shadow-xs overflow-x-auto">
          <table className="w-full text-sm min-w-[1120px]">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th rowSpan={2} className="text-left font-medium px-4 py-2 sticky left-0 bg-slate-50 z-10">คน</th>
                <th rowSpan={2} className="text-right font-medium px-2 py-2">ชม.</th>
                <th rowSpan={2} className="text-right font-medium px-2 py-2">manual%</th>
                <th colSpan={5} className="text-center font-semibold px-2 py-1.5 border-l border-slate-200 text-emerald-700">รายได้</th>
                <th colSpan={3} className="text-center font-semibold px-2 py-1.5 border-l border-slate-200 text-rose-600">หัก</th>
                <th rowSpan={2} className="text-right font-semibold px-4 py-2 border-l border-slate-200 text-slate-700">สุทธิ</th>
                <th rowSpan={2} className="text-center font-medium px-3 py-2 border-l border-slate-200">โน้ต</th>
              </tr>
              <tr>
                <th className="text-right font-normal px-2 pb-1.5 border-l border-slate-200">เงินเดือน</th>
                <th className="text-right font-normal px-2 pb-1.5">เบี้ยเลี้ยง</th>
                <th className="text-right font-normal px-2 pb-1.5">ค่าสึกหรอ</th>
                <th className="text-right font-normal px-2 pb-1.5 text-amber-600">เงินพิเศษ 🔒</th>
                <th className="text-right font-normal px-2 pb-1.5">อื่นๆ</th>
                <th className="text-right font-normal px-2 pb-1.5 border-l border-slate-200">ปกส.</th>
                <th className="text-right font-normal px-2 pb-1.5">ภาษี</th>
                <th className="text-right font-normal px-2 pb-1.5">อื่นๆ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {active.length === 0 && (
                <tr><td colSpan={13} className="text-center text-sm text-slate-400 py-10">ยังไม่มีเวลา/รายการในงวดนี้</td></tr>
              )}
              {active.map((r) => {
                const flagged = r.manualRatio > 0.1
                return (
                  <RowGroup key={r.userId}>
                    <tr onClick={() => setOpenRow(openRow === r.userId ? null : r.userId)} className={`cursor-pointer hover:bg-slate-50 ${flagged ? 'bg-orange-50/40' : ''}`}>
                      <td className={`px-4 py-2.5 text-slate-700 sticky left-0 z-10 ${flagged ? 'bg-orange-50' : 'bg-white'}`}>
                        <span className="inline-flex items-center gap-1.5">
                          {flagged && <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />}
                          {r.name}
                          {r.role === 'vendor' && <span className="text-[10px] text-slate-400">(vendor)</span>}
                        </span>
                      </td>
                      <td className="text-right px-2">{minutesToHoursLabel(r.minutesTotal)}</td>
                      <td className={`text-right px-2 ${flagged ? 'text-orange-600 font-semibold' : 'text-slate-400'}`}>{Math.round(r.manualRatio * 100)}%</td>
                      <td className="text-right px-2 border-l border-slate-100">{money(r.baseSatang)}</td>
                      <td className="text-right px-2">{money(kindSum(r, 'allowance'))}</td>
                      <td className="text-right px-2">{money(kindSum(r, 'depreciation'))}</td>
                      <td className="text-right px-2">{money(kindSum(r, 'bonus'), 'text-amber-700')}</td>
                      <td className="text-right px-2">{money(kindSum(r, 'other_income'))}</td>
                      <td className="text-right px-2 border-l border-slate-100">{money(kindSum(r, 'sso'), 'text-rose-500')}</td>
                      <td className="text-right px-2">{money(kindSum(r, 'wht'), 'text-rose-500')}</td>
                      <td className="text-right px-2">{money(kindSum(r, 'other_deduction'), 'text-rose-500')}</td>
                      <td className="text-right px-4 border-l border-slate-100 font-semibold">{formatSatang(r.netSatang)}</td>
                      <td className="text-center px-3 border-l border-slate-100">
                        {r.ownerNote ? (
                          <span title={r.ownerNote} className="inline-grid w-7 h-7 place-items-center rounded-lg text-amber-500"><MessageSquare className="w-4 h-4" /></span>
                        ) : (
                          <span className="inline-grid w-7 h-7 place-items-center rounded-lg text-slate-300"><MessageSquarePlus className="w-4 h-4" /></span>
                        )}
                      </td>
                    </tr>
                    {openRow === r.userId && (
                      <tr>
                        <td colSpan={13} className="p-0">
                          <RowEditor row={r} cycleStart={data.cycle.start} closed={data.closed} onChanged={() => void reload()} />
                        </td>
                      </tr>
                    )}
                  </RowGroup>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          รายได้ − หัก = สุทธิ · คลิกแถวเพื่อใส่รายการ/โน้ต · เงินพิเศษ 🔒 เห็นเฉพาะ owner+เจ้าตัว · manual% &gt;10% = สีส้ม · ปิดงวดแล้วระบบ snapshot payslip และล็อกการแก้ย้อนหลัง · SeedOffice ไม่จ่ายเงินเอง
        </p>
      </div>
    </>
  )
}

// fragment ที่รับ key ได้ (กลุ่มแถวหลัก + แถว editor)
function RowGroup({ children }: { children: ReactNode }) {
  return <>{children}</>
}
