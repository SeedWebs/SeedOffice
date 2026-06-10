import { formatSatang } from '@seedoffice/core'
import { UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import { useLoad } from '../lib/useLoad'

interface AdminUser {
  id: string
  email: string
  name: string
  role: 'owner' | 'member' | 'vendor'
  status: 'active' | 'disabled'
  currentRateSatangPerHour: number | null
}
interface Config {
  cutoffDay: number
  workHourCapMinutes: number
}
interface RateRow {
  id: string
  rateSatangPerHour: number
  effectiveFrom: string
  note: string | null
}

const ROLE_BADGE: Record<AdminUser['role'], string> = {
  owner: 'bg-brand-100 text-brand-700',
  member: 'bg-slate-100 text-slate-600',
  vendor: 'bg-amber-100 text-amber-700',
}

const todayISO = () => {
  const d = new Date(Date.now() + 7 * 3_600_000)
  return d.toISOString().slice(0, 10)
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ email: '', name: '', role: 'member', rateBaht: '' })
  const [error, setError] = useState('')
  const submit = async () => {
    try {
      await api.post('/api/admin/users', {
        email: form.email,
        name: form.name,
        role: form.role,
        ...(form.rateBaht
          ? { rateSatangPerHour: Math.round(Number(form.rateBaht)) * 100, rateEffectiveFrom: todayISO() }
          : {}),
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ผิดพลาด')
    }
  }
  return (
    <div className="p-4 bg-slate-50 rounded-lg space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input
          placeholder="ชื่อ"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
        <input
          placeholder="อีเมล"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
        <select
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        >
          <option value="member">member</option>
          <option value="vendor">vendor</option>
          <option value="owner">owner</option>
        </select>
        <input
          placeholder="rate ฿/ชม. (ใส่ทีหลังได้)"
          type="number"
          value={form.rateBaht}
          onChange={(e) => setForm({ ...form, rateBaht: e.target.value })}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
      </div>
      {error && <div className="text-xs text-rose-600">{error}</div>}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => void submit()}
          disabled={!form.email || !form.name}
          className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg"
        >
          เพิ่มผู้ใช้
        </button>
      </div>
      <p className="text-[11px] text-slate-400">
        member = โดเมน seedwebs.com (login ได้เองอยู่แล้ว) · vendor = allowlist อีเมลภายนอก
      </p>
    </div>
  )
}

function RatePanel({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const { data } = useLoad<{ history: RateRow[] }>(
    () => api.get(`/api/users/${user.id}/rates`),
    [user.id],
  )
  const [rateBaht, setRateBaht] = useState('')
  const [from, setFrom] = useState(todayISO())
  const [note, setNote] = useState('')
  const save = async () => {
    await api.post(`/api/admin/users/${user.id}/rates`, {
      rateSatangPerHour: Math.round(Number(rateBaht) * 100),
      effectiveFrom: from,
      note: note || undefined,
    })
    onSaved()
  }
  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-slate-700">rate ของ {user.name}</div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          type="number"
          placeholder="฿/ชม."
          value={rateBaht}
          onChange={(e) => setRateBaht(e.target.value)}
          className="w-28 text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
        <input
          placeholder="โน้ต (เช่น ปรับประจำปี)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="flex-1 min-w-40 text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
        <button
          onClick={() => void save()}
          disabled={!rateBaht}
          className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg"
        >
          ตั้ง rate ใหม่
        </button>
      </div>
      <div className="text-[11px] text-slate-400 mb-1">
        ประวัติ (เปลี่ยน rate ไม่แก้ของเก่า — เวลาเดิมใช้ rate snapshot เดิม)
      </div>
      <div className="space-y-1">
        {(data?.history ?? [])
          .slice()
          .reverse()
          .map((r) => (
            <div key={r.id} className="flex items-center gap-3 text-sm">
              <span className="tabular-nums text-slate-700 w-24">
                {formatSatang(r.rateSatangPerHour)}/ชม.
              </span>
              <span className="text-xs text-slate-400">มีผล {r.effectiveFrom}</span>
              {r.note && <span className="text-xs text-slate-400">· {r.note}</span>}
            </div>
          ))}
        {data && data.history.length === 0 && (
          <div className="text-sm text-slate-400">ยังไม่ตั้ง rate — ลงเวลาไม่ได้จนกว่าจะมี rate</div>
        )}
      </div>
    </div>
  )
}

export function AdminPage() {
  const { data: usersList, loading, reload } = useLoad<AdminUser[]>(() => api.get('/api/admin/users'))
  const { data: cfg, reload: reloadCfg } = useLoad<Config>(() => api.get('/api/config'))
  const [adding, setAdding] = useState(false)
  const [rateUser, setRateUser] = useState<AdminUser | null>(null)

  const saveCfg = async (patch: Partial<Config>) => {
    await api.patch('/api/admin/config', patch)
    await reloadCfg()
  }
  const toggleStatus = async (u: AdminUser) => {
    await api.patch(`/api/admin/users/${u.id}`, {
      status: u.status === 'active' ? 'disabled' : 'active',
    })
    await reload()
  }

  return (
    <>
      <PageHeader
        title="ตั้งค่า"
        action={
          <button
            onClick={() => setAdding((v) => !v)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg"
          >
            <UserPlus className="w-4 h-4" /> เพิ่มผู้ใช้
          </button>
        }
      />
      <div className="p-3 sm:p-6 space-y-5">
        {adding && (
          <AddUserForm
            onDone={() => {
              setAdding(false)
              void reload()
            }}
          />
        )}

        <div className="bg-white rounded-lg shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-200">
            <div className="font-semibold text-slate-900">ผู้ใช้ & rate</div>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">กำลังโหลด…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="bg-slate-50 text-slate-500 text-xs">
                  <tr>
                    <th className="text-left font-medium px-5 py-3">ชื่อ</th>
                    <th className="text-left font-medium px-3 py-3">อีเมล</th>
                    <th className="text-left font-medium px-3 py-3">role</th>
                    <th className="text-right font-medium px-3 py-3">rate</th>
                    <th className="text-right font-medium px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(usersList ?? []).map((u) => (
                    <>
                      <tr
                        key={u.id}
                        onClick={() => setRateUser(rateUser?.id === u.id ? null : u)}
                        className={`hover:bg-slate-50 cursor-pointer ${u.status === 'disabled' ? 'opacity-40' : ''}`}
                      >
                        <td className="px-5 py-3">{u.name}</td>
                        <td className="px-3 text-slate-400">{u.email}</td>
                        <td className="px-3">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full ${ROLE_BADGE[u.role]}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="text-right px-3 tabular-nums">
                          {u.currentRateSatangPerHour != null
                            ? `${formatSatang(u.currentRateSatangPerHour)}/ชม.`
                            : '—'}
                        </td>
                        <td className="text-right px-5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              void toggleStatus(u)
                            }}
                            className="text-[11px] text-slate-400 hover:text-slate-600 underline"
                          >
                            {u.status === 'active' ? 'ปิดการใช้งาน' : 'เปิดใช้งาน'}
                          </button>
                        </td>
                      </tr>
                      {rateUser?.id === u.id && (
                        <tr key={`${u.id}-rate`}>
                          <td colSpan={5} className="p-0">
                            <RatePanel
                              user={u}
                              onClose={() => setRateUser(null)}
                              onSaved={() => {
                                setRateUser(null)
                                void reload()
                              }}
                            />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-400 px-5 py-3 border-t border-slate-100">
            คลิกแถวเพื่อดู/ตั้ง rate (เก็บประวัติ effective-dated) · ปิดการใช้งาน = login ไม่ได้ทันที
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-xs p-5 max-w-md">
          <div className="font-semibold text-slate-900 mb-3">ค่าบริษัท</div>
          {cfg && (
            <div className="space-y-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span className="text-slate-600">วันตัดรอบเงินเดือน (งวด = วันนี้ → วันก่อนหน้าเดือนถัดไป)</span>
                <input
                  type="number"
                  min={1}
                  max={28}
                  defaultValue={cfg.cutoffDay}
                  onBlur={(e) => {
                    const v = Number(e.target.value)
                    if (v !== cfg.cutoffDay) void saveCfg({ cutoffDay: v })
                  }}
                  className="w-20 text-sm shadow-xs bg-white rounded-lg px-3 py-2 text-right tabular-nums"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-slate-600">เพดานชั่วโมงทำงาน/วัน (นาที)</span>
                <input
                  type="number"
                  min={60}
                  max={1440}
                  step={30}
                  defaultValue={cfg.workHourCapMinutes}
                  onBlur={(e) => {
                    const v = Number(e.target.value)
                    if (v !== cfg.workHourCapMinutes) void saveCfg({ workHourCapMinutes: v })
                  }}
                  className="w-24 text-sm shadow-xs bg-white rounded-lg px-3 py-2 text-right tabular-nums"
                />
              </label>
              <p className="text-[11px] text-slate-400">
                ตอนนี้: งวด {cfg.cutoffDay} → {cfg.cutoffDay - 1} · เพดาน{' '}
                {(cfg.workHourCapMinutes / 60).toFixed(1)} ชม./วัน (ชนเพดาน = timer หยุด + บล็อก)
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
