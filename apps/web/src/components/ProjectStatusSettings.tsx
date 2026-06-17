/**
 * ตั้งค่า → สถานะโปรเจกต์ (SPEC §4.3) — owner เพิ่ม/ลบ/เรียง/เปลี่ยนชื่อ+สี
 * kind=archived = สถานะ "ปิด/เก็บ" (ซ่อนจากลิสต์ที่ทำอยู่) · บันทึกทั้งลิสต์ทีเดียว (PUT)
 * ลบสถานะที่ยังมีโปรเจกต์ใช้ไม่ได้ (server ตอบ 409)
 */
import { Check, ChevronDown, ChevronUp, Plus, Tags, Trash2 } from 'lucide-react'
import { STATUS_COLOR_KEYS } from '@seedoffice/core'
import { useEffect, useState } from 'react'
import { api, ApiError } from '../lib/api'
import { STATUS_SWATCH, statusChip } from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'

interface Status {
  id: string
  name: string
  color: string
  kind: 'active' | 'archived'
  sortOrder: number
}

export function ProjectStatusSettings() {
  const { data, reload } = useLoad<{ projectStatuses: Status[] }>(() => api.get('/api/config'))
  const [list, setList] = useState<Status[] | null>(null)
  const [openColor, setOpenColor] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (data) setList(data.projectStatuses.map((s, i) => ({ ...s, sortOrder: i })))
  }, [data])

  if (!list) return null

  const update = (i: number, patch: Partial<Status>) => {
    setList(list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))
    setSaved(false)
  }
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const copy = [...list]
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
    setList(copy)
    setSaved(false)
  }
  const remove = (i: number) => {
    setList(list.filter((_, idx) => idx !== i))
    setSaved(false)
  }
  const add = () => {
    setList([...list, { id: `s_${Math.random().toString(36).slice(2, 8)}`, name: 'สถานะใหม่', color: 'sky', kind: 'active', sortOrder: list.length }])
    setSaved(false)
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const statuses = list.map((s, i) => ({ ...s, name: s.name.trim(), sortOrder: i }))
      await api.put('/api/admin/project-statuses', { statuses })
      setSaved(true)
      await reload()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-xs overflow-hidden">
      <div className="p-5 border-b border-border-subtle flex items-center gap-2">
        <Tags className="w-4 h-4 text-muted" />
        <div className="font-semibold text-ink">สถานะโปรเจกต์</div>
        <span className="text-xs text-muted">ตั้งชื่อ/สี/ลำดับเอง · “เก็บ/ปิด” = ซ่อนจากลิสต์ที่ทำอยู่</span>
      </div>

      <div className="p-5 space-y-2">
        {list.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div className="flex flex-col">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-muted hover:text-body disabled:opacity-30">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1} className="text-muted hover:text-body disabled:opacity-30">
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* สี */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setOpenColor(openColor === i ? null : i)}
                className={`w-6 h-6 rounded-full ${STATUS_SWATCH[s.color] ?? 'bg-slate-400'} ring-2 ring-white shadow-xs`}
                title="เปลี่ยนสี"
              />
              {openColor === i && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setOpenColor(null)} />
                  <div className="absolute left-0 top-full mt-1 z-50 w-44 bg-white rounded-lg shadow-2xl border border-border-subtle p-2 grid grid-cols-5 gap-1.5">
                    {STATUS_COLOR_KEYS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => { update(i, { color: c }); setOpenColor(null) }}
                        className={`w-6 h-6 rounded-full ${STATUS_SWATCH[c]} grid place-items-center`}
                      >
                        {s.color === c && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            <input
              value={s.name}
              onChange={(e) => update(i, { name: e.target.value })}
              maxLength={40}
              className="flex-1 text-sm bg-white border border-border rounded-lg px-3 py-1.5 focus:outline-hidden focus:border-brand-400"
            />

            {/* preview chip */}
            <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${statusChip(s.color)}`}>{s.name || '—'}</span>

            <select
              value={s.kind}
              onChange={(e) => update(i, { kind: e.target.value as 'active' | 'archived' })}
              className="text-xs bg-white border border-border rounded-lg px-2 py-1.5 focus:outline-hidden"
            >
              <option value="active">ใช้งาน</option>
              <option value="archived">เก็บ/ปิด</option>
            </select>

            <button type="button" onClick={() => remove(i)} title="ลบสถานะ" className="text-muted hover:text-danger-600">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        <button type="button" onClick={add} className="flex items-center gap-1.5 text-sm text-brand-700 hover:text-brand-800 pt-1">
          <Plus className="w-4 h-4" /> เพิ่มสถานะ
        </button>

        {error && <div className="text-xs text-danger-600">{error}</div>}

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-40"
          >
            {saving ? 'กำลังบันทึก…' : 'บันทึกสถานะ'}
          </button>
          {saved && <span className="text-xs text-success-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> บันทึกแล้ว</span>}
        </div>
      </div>
    </div>
  )
}
