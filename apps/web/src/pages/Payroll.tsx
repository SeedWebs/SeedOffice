import { formatSatang, minutesToHoursLabel, type AdjustmentKind } from '@seedoffice/core'
import { Info, Lock, MessageSquare, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtThaiDate } from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'
import { PayrollOwnerPage } from './PayrollOwner'

export interface SelfPayroll {
  cycle: { start: string; end: string; payDate: string }
  minutesTotal: number
  manualRatio: number
  flagged: boolean
  todayMinutes: number
  byProject: { projectId: string; projectName: string; minutes: number }[]
  baseSatang: number
  adjustments: { id: string; kind: AdjustmentKind; amountSatang: number; note: string | null }[]
  incomeSatang: number
  deductionSatang: number
  netSatang: number
  ownerNote: string | null
  currentRateSatangPerHour: number | null
  role: 'owner' | 'member' | 'vendor'
  pendingReimburseSatang: number
  pendingReimburseItems: { description: string; amountSatang: number; status: 'pending' | 'approved' }[]
}

export const KIND_LABEL: Record<AdjustmentKind, string> = {
  allowance: 'เบี้ยเลี้ยง',
  depreciation: 'ค่าสึกหรอ',
  bonus: 'เงินพิเศษ',
  other_income: 'เงินได้อื่นๆ',
  sso: 'ประกันสังคม',
  wht: 'ภาษีหัก ณ ที่จ่าย',
  other_deduction: 'รายการหักอื่นๆ',
}
export const INCOME_ORDER: AdjustmentKind[] = ['allowance', 'depreciation', 'bonus', 'other_income']
export const DEDUCT_ORDER: AdjustmentKind[] = ['sso', 'wht', 'other_deduction']

export const cycleLabel = (c: { start: string; end: string }) =>
  `งวด ${fmtThaiDate(c.start)}–${fmtThaiDate(c.end)}`

function SelfView() {
  const { data: d } = useLoad<SelfPayroll>(() => api.get('/api/payroll/me'))
  if (!d) return <div className="p-6 text-sm text-muted">กำลังโหลด…</div>

  const isVendor = d.role === 'vendor'
  const sumByKind = (kind: AdjustmentKind) =>
    d.adjustments.filter((a) => a.kind === kind).reduce((s, a) => s + a.amountSatang, 0)
  const maxProjectMinutes = Math.max(1, ...d.byProject.map((p) => p.minutes))

  return (
    <div className="p-3 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl items-start">
        {/* ซ้าย: สรุปเวลาของฉัน */}
        <div className="bg-white rounded-lg shadow-xs p-6">
          <div className="text-sm text-muted">สรุปเวลาของฉัน — {cycleLabel(d.cycle)}</div>
          <div className="flex items-start gap-3 mt-3">
            <div>
              <div className="text-3xl font-bold tabular-nums text-ink">{minutesToHoursLabel(d.minutesTotal)}</div>
              <div className="text-[11px] text-muted">ชั่วโมงงวดนี้</div>
            </div>
            <span className={`ml-auto text-[11px] px-2 py-1 rounded-full ${d.flagged ? 'bg-orange-100 text-orange-700' : 'bg-success-50 text-success-600'}`}>
              manual {Math.round(d.manualRatio * 100)}% · {d.flagged ? 'สูงกว่าปกติ' : 'ปกติ'}
            </span>
          </div>
          <div className="text-[11px] text-muted mt-1.5">วันนี้ {minutesToHoursLabel(d.todayMinutes)} ชม. · เป้า 8 ชม./วัน</div>
          <div className="mt-4 space-y-2">
            <div className="text-[11px] font-medium text-muted uppercase tracking-wide">ตามโปรเจกต์</div>
            {d.byProject.length === 0 && <div className="text-sm text-border">ยังไม่มีเวลาในงวดนี้ — กดจับเวลาจากงานได้เลย</div>}
            {d.byProject.map((p) => (
              <div key={p.projectId} className="flex items-center gap-2">
                <span className="text-sm text-soft flex-1 truncate">{p.projectName}</span>
                <div className="w-16 h-1.5 bg-divider rounded-full overflow-hidden">
                  <div className="h-full bg-brand-400" style={{ width: `${(p.minutes / maxProjectMinutes) * 100}%` }} />
                </div>
                <span className="text-xs text-dim tabular-nums w-16 text-right">{minutesToHoursLabel(p.minutes)} ชม.</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-3 flex items-center gap-1">
            <Info className="w-3 h-3" /> ตรวจชั่วโมงให้ตรงก่อนตัดรอบ {fmtThaiDate(d.cycle.end)} (cross-check)
          </p>
        </div>

        {/* ขวา: เงิน */}
        <div className="space-y-4">
          {d.ownerNote && (
            <div className="bg-warning-50 border border-warning-100 rounded-lg p-4">
              <div className="text-xs font-medium text-warning-700 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4" /> โน้ตจากหัวหน้า · งวดนี้
              </div>
              <p className="text-sm text-body mt-1.5">{d.ownerNote}</p>
            </div>
          )}
          <div className="bg-white rounded-lg shadow-xs p-6">
            <div className="text-sm text-muted">{isVendor ? 'ค่าจ้างของฉัน' : 'ค่าตอบแทนของฉัน'} — {cycleLabel(d.cycle)}</div>
            <div className="mt-4 space-y-2">
              <div className="text-[11px] font-medium text-success-700 uppercase tracking-wide">รายได้</div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-dim">
                  {isVendor ? 'ค่าจ้าง' : 'เงินเดือน'} ({minutesToHoursLabel(d.minutesTotal)} ชม.
                  {d.currentRateSatangPerHour != null ? ` × ${formatSatang(d.currentRateSatangPerHour)}` : ''})
                </span>
                <span className="tabular-nums">{formatSatang(d.baseSatang)}</span>
              </div>
              {INCOME_ORDER.filter((k) => !isVendor || sumByKind(k) > 0).map((kind) => {
                const amt = sumByKind(kind)
                return (
                  <div key={kind} className="flex items-center justify-between">
                    <span className="text-sm text-dim flex items-center gap-1">
                      {KIND_LABEL[kind]} {kind === 'bonus' && <Lock className="w-3 h-3 text-border" />}
                    </span>
                    <span className={`tabular-nums ${amt === 0 ? 'text-border' : kind === 'bonus' ? 'text-warning-700' : ''}`}>
                      {amt === 0 ? '—' : formatSatang(amt)}
                    </span>
                  </div>
                )
              })}
              <div className="text-[11px] font-medium text-danger-600 uppercase tracking-wide pt-2">หัก</div>
              {DEDUCT_ORDER.filter((k) => !isVendor || k === 'wht' || sumByKind(k) > 0).map((kind) => {
                const amt = sumByKind(kind)
                return (
                  <div key={kind} className="flex items-center justify-between">
                    <span className="text-sm text-dim">{KIND_LABEL[kind]}</span>
                    <span className={`tabular-nums ${amt === 0 ? 'text-border' : 'text-danger-500'}`}>
                      {amt === 0 ? '—' : `-${formatSatang(amt)}`}
                    </span>
                  </div>
                )
              })}
              <div className="flex items-center justify-between pt-3 border-t border-border-subtle">
                <span className="text-sm font-medium text-body">รวมสุทธิ</span>
                <span className="text-xl font-bold tabular-nums text-ink">{formatSatang(d.netSatang)}</span>
              </div>
            </div>
            <p className="text-[11px] text-muted mt-4 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {isVendor
                ? `vendor หัก ณ ที่จ่าย 3% (ไม่มี ปกส./สวัสดิการ) · จ่าย ${fmtThaiDate(d.cycle.payDate)}`
                : `เงินพิเศษ + ยอดสุทธิ เห็นเฉพาะคุณกับ owner · จ่าย ${fmtThaiDate(d.cycle.payDate)}`}
            </p>
          </div>

          {/* เงินสดย่อยรอเบิกของฉัน (mockup §4.7) — vendor ไม่มี petty cash */}
          {!isVendor && (
            <div className="bg-white rounded-lg shadow-xs p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-dim">เงินสดย่อยรอเบิกของฉัน</span>
                <span className="text-lg font-bold tabular-nums text-ink">{formatSatang(d.pendingReimburseSatang)}</span>
              </div>
              <div className="text-xs text-muted mt-1">
                {d.pendingReimburseItems.length === 0
                  ? 'ไม่มีรายการรอเบิก'
                  : d.pendingReimburseItems
                      .slice(0, 3)
                      .map((i) => `${i.description} ${formatSatang(i.amountSatang)} · ${i.status === 'pending' ? 'รออนุมัติ' : 'รอคืนเงิน'}`)
                      .join(' · ')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function PayrollPage() {
  const { user } = useAuth()
  if (user?.role === 'owner') return <PayrollOwnerPage />
  return (
    <>
      <PageHeader title="ค่าตอบแทน" />
      <SelfView />
    </>
  )
}
