import { Calendar, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import { useLoad } from '../lib/useLoad'
import { useDialog } from './Dialog'

interface CalEvent {
  id: string
  title: string
  startDate: string
  endDate?: string | null
  type: 'holiday' | 'leave' | 'meeting' | 'deadline' | 'other' | 'payroll'
  userId?: string | null
  userName?: string | null
}
interface UserOpt {
  id: string
  name: string
}

const TYPE_CLS: Record<CalEvent['type'], string> = {
  holiday: 'bg-emerald-100 text-emerald-700',
  leave: 'bg-orange-100 text-orange-700',
  meeting: 'bg-slate-100 text-slate-600',
  deadline: 'bg-rose-100 text-rose-600',
  other: 'bg-sky-100 text-sky-700',
  payroll: 'bg-brand-100 text-brand-700',
}
const TYPE_LABEL: Record<string, string> = {
  holiday: 'วันหยุด', leave: 'วันลา', meeting: 'ประชุม', deadline: 'กำหนดส่ง', other: 'อื่นๆ',
}

const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const DOWF = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์']
const THM = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
const THMF = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const iso = (d: Date) => d.toISOString().slice(0, 10)
const bkkNow = () => new Date(Date.now() + 7 * 3_600_000)
const todayISO = () => iso(bkkNow())
const be = (y: number) => y + 543

function AddEventModal({ defaultDate, onClose, onDone }: { defaultDate: string; onClose: () => void; onDone: () => void }) {
  const { data: userOpts } = useLoad<UserOpt[]>(() => api.get('/api/users'))
  const [form, setForm] = useState({ title: '', type: 'meeting', start: defaultDate, end: '', userId: '' })
  const input = 'w-full text-sm bg-white shadow-xs rounded-lg px-3 py-2'
  const submit = async () => {
    await api.post('/api/calendar', {
      title: form.title.trim(),
      type: form.type,
      startDate: form.start,
      ...(form.end && form.end > form.start ? { endDate: form.end } : {}),
      ...(form.type === 'leave' && form.userId ? { userId: form.userId } : {}),
    })
    onDone()
  }
  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/30 so-fade-in" />
      <div className="absolute inset-0 grid place-items-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5 so-pop-in">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-slate-900">เพิ่มกิจกรรม</div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="space-y-2">
            <input autoFocus placeholder="ชื่อ เช่น ประชุมทีม 10:00" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={input} />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={input} aria-label="ประเภท">
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {form.type === 'leave' && (
              <select value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} className={input} aria-label="ใครลา">
                <option value="">— ใครลา —</option>
                {(userOpts ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-400">เริ่ม<input type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className={input} /></label>
              <label className="text-[11px] text-slate-400">ถึง (ถ้าหลายวัน)<input type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className={input} /></label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void submit().then(onDone)} disabled={!form.title.trim() || (form.type === 'leave' && !form.userId)} className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-40">เพิ่ม</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function TeamCalendar() {
  const [view, setView] = useState<'day' | 'week' | 'month'>('month')
  const [ref, setRef] = useState(() => bkkNow())
  const [adding, setAdding] = useState(false)
  const { confirmDialog } = useDialog()

  // โหลดครอบทั้งช่วงที่มองเห็น (เดือน ±7 วัน)
  const range = useMemo(() => {
    const start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1))
    start.setUTCDate(start.getUTCDate() - 7)
    const end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 7))
    return { from: iso(start), to: iso(end) }
  }, [ref])
  const { data, reload } = useLoad<{ events: CalEvent[] }>(() => api.get(`/api/calendar?from=${range.from}&to=${range.to}`), [range.from, range.to])

  const eventsOn = (date: string) =>
    (data?.events ?? []).filter((e) => e.startDate <= date && (e.endDate ?? e.startDate) >= date)

  const removeEvent = async (e: CalEvent) => {
    if (e.type === 'payroll') return // virtual จาก config
    const yes = await confirmDialog({ title: 'ลบกิจกรรมนี้?', message: e.title, confirmLabel: 'ลบ', danger: true })
    if (yes) {
      await api.delete(`/api/calendar/${e.id}`)
      await reload()
    }
  }

  const nav = (dir: -1 | 1) => {
    const d = new Date(ref)
    if (view === 'month') d.setUTCMonth(d.getUTCMonth() + dir)
    else d.setUTCDate(d.getUTCDate() + dir * (view === 'week' ? 7 : 1))
    setRef(d)
  }

  const EventChip = ({ e, size }: { e: CalEvent; size: 'sm' | 'md' }) => (
    <div
      onClick={() => void removeEvent(e)}
      title={e.type === 'payroll' ? `${e.title} (อัตโนมัติจากรอบเงินเดือน)` : `${e.title} — คลิกเพื่อลบ`}
      className={`truncate rounded px-1 mt-0.5 ${TYPE_CLS[e.type]} ${size === 'sm' ? 'text-[10px]' : 'text-[11px] px-1.5 py-0.5'} ${e.type === 'payroll' ? '' : 'cursor-pointer hover:opacity-75'}`}
    >
      {e.type === 'leave' && e.userName ? `${e.userName}ลา` : e.title}
    </div>
  )

  const label =
    view === 'month'
      ? `${THMF[ref.getUTCMonth()]} ${be(ref.getUTCFullYear())}`
      : view === 'day'
        ? `${DOWF[ref.getUTCDay()]} ${ref.getUTCDate()} ${THM[ref.getUTCMonth()]} ${be(ref.getUTCFullYear())}`
        : (() => {
            const s = new Date(ref)
            s.setUTCDate(ref.getUTCDate() - ref.getUTCDay())
            const e = new Date(s)
            e.setUTCDate(s.getUTCDate() + 6)
            return `${s.getUTCDate()} ${THM[s.getUTCMonth()]} – ${e.getUTCDate()} ${THM[e.getUTCMonth()]} ${be(e.getUTCFullYear())}`
          })()

  return (
    <div className="mt-5 bg-white rounded-lg shadow-xs p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-600" />
          <span className="font-semibold text-slate-900">ปฏิทินทีมงาน</span>
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={() => nav(-1)} className="w-7 h-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="ก่อนหน้า"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setRef(bkkNow())} className="text-xs text-slate-500 hover:bg-slate-100 px-2 py-1 rounded-lg">วันนี้</button>
            <button onClick={() => nav(1)} className="w-7 h-7 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100" aria-label="ถัดไป"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <span className="text-sm text-slate-400">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-100 rounded-lg p-0.5 text-xs font-medium">
            {(['day', 'week', 'month'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-2.5 py-1 rounded-md capitalize ${view === v ? 'bg-white shadow-xs text-brand-700' : 'text-slate-500'}`}>
                {v === 'day' ? 'Day' : v === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>
          <button onClick={() => setAdding(true)} className="text-xs bg-brand-600 text-white rounded-lg px-2.5 py-1.5 hover:bg-brand-700 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> เพิ่ม
          </button>
        </div>
      </div>

      {view === 'month' && (
        <>
          <div className="grid grid-cols-7 text-[11px] text-slate-400 mb-1">{DOW.map((d) => <div key={d} className="px-2 py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
            {Array.from({ length: 42 }, (_, i) => {
              const first = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1))
              const start = new Date(first)
              start.setUTCDate(1 - first.getUTCDay() + i)
              const dIso = iso(start)
              const inMonth = start.getUTCMonth() === ref.getUTCMonth()
              const isToday = dIso === todayISO()
              return (
                <div key={i} className={`${inMonth ? 'bg-white' : 'bg-slate-50/60'} min-h-[58px] p-1`}>
                  {isToday ? (
                    <span className="bg-rose-500 text-white w-5 h-5 grid place-items-center rounded-full text-[11px]">{start.getUTCDate()}</span>
                  ) : (
                    <span className={`${inMonth ? 'text-slate-500' : 'text-slate-300'} text-[11px] px-1`}>{start.getUTCDate()}</span>
                  )}
                  {eventsOn(dIso).map((e) => <EventChip key={`${e.id}-${dIso}`} e={e} size="sm" />)}
                </div>
              )
            })}
          </div>
        </>
      )}

      {view === 'week' && (
        <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-lg overflow-hidden">
          {Array.from({ length: 7 }, (_, i) => {
            const start = new Date(ref)
            start.setUTCDate(ref.getUTCDate() - ref.getUTCDay() + i)
            const dIso = iso(start)
            const isToday = dIso === todayISO()
            return (
              <div key={i} className="bg-white min-h-[150px] p-1.5">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-[10px] text-slate-400">{DOW[i]}</span>
                  {isToday ? (
                    <span className="bg-rose-500 text-white w-5 h-5 grid place-items-center rounded-full text-[11px]">{start.getUTCDate()}</span>
                  ) : (
                    <span className="text-slate-600 text-sm">{start.getUTCDate()}</span>
                  )}
                </div>
                {eventsOn(dIso).map((e) => <EventChip key={`${e.id}-${dIso}`} e={e} size="md" />)}
              </div>
            )
          })}
        </div>
      )}

      {view === 'day' && (
        <div className="border border-slate-200 rounded-lg p-3">
          <div className="text-sm font-semibold text-slate-700 mb-2">{DOWF[ref.getUTCDay()]} {ref.getUTCDate()} {THMF[ref.getUTCMonth()]}</div>
          {eventsOn(iso(ref)).length === 0 ? (
            <div className="text-sm text-slate-400 py-8 text-center">ไม่มีกิจกรรม</div>
          ) : (
            eventsOn(iso(ref)).map((e) => (
              <div key={e.id} onClick={() => void removeEvent(e)} className={`rounded-lg px-3 py-2 mb-1.5 text-sm ${TYPE_CLS[e.type]} ${e.type === 'payroll' ? '' : 'cursor-pointer hover:opacity-75'}`}>
                {e.type === 'leave' && e.userName ? `${e.userName}ลา — ` : ''}{e.title}
              </div>
            ))
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 mt-2">วันลา/ประชุม/วันหยุด + ตัดรอบ/จ่ายเงินเดือน (อัตโนมัติจาก config) · คลิกกิจกรรมเพื่อลบ · sync Google Calendar = P3</p>
      {adding && <AddEventModal defaultDate={view === 'month' ? todayISO() : iso(ref)} onClose={() => setAdding(false)} onDone={() => { setAdding(false); void reload() }} />}
    </div>
  )
}
