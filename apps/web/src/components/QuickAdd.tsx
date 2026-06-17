import { Star, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useLoad } from '../lib/useLoad'

interface ProjectOpt {
  id: string
  name: string
  logo: string | null
  status: string
  statusKind: string
  type: string
}
interface GroupOpt {
  id: string
  name: string
}

/** แจ้งหน้าที่สนใจ (เช่น ภาพรวม) ว่ามีงานใหม่ */
export const TASK_CREATED_EVENT = 'so:task-created'

export function QuickAddModal({ onClose }: { onClose: () => void }) {
  const { data: projectsList } = useLoad<ProjectOpt[]>(() => api.get('/api/projects'))
  const [projectId, setProjectId] = useState('')
  const [groups, setGroups] = useState<GroupOpt[]>([])
  const [groupId, setGroupId] = useState('')
  const [title, setTitle] = useState('')
  const [star, setStar] = useState(true)
  const [error, setError] = useState('')

  const active = (projectsList ?? []).filter((p) => p.statusKind !== 'archived')

  useEffect(() => {
    if (!projectId) {
      setGroups([])
      setGroupId('')
      return
    }
    void api.get<{ groups: GroupOpt[] }>(`/api/projects/${projectId}/board`).then((b) => {
      setGroups(b.groups)
      setGroupId(b.groups[0]?.id ?? '')
    })
  }, [projectId])

  const submit = async () => {
    try {
      if (!groupId) {
        setError('โปรเจกต์นี้ยังไม่มี task group — เปิดโปรเจกต์แล้วเพิ่มกลุ่มก่อน')
        return
      }
      const task = await api.post<{ id: string }>(`/api/groups/${groupId}/tasks`, { title: title.trim() })
      if (star) await api.post(`/api/tasks/${task.id}/star`, { on: true })
      window.dispatchEvent(new CustomEvent(TASK_CREATED_EVENT))
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ผิดพลาด')
    }
  }

  const input = 'w-full text-sm bg-white shadow-xs rounded-lg px-3 py-2'
  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <div className="absolute inset-x-0 top-24 mx-auto w-full max-w-md px-4">
        <div className="bg-white rounded-lg shadow-2xl p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="font-semibold text-ink">เพิ่มงานด่วน</div>
            <button onClick={onClose} className="text-muted hover:text-soft"><X className="w-5 h-5" /></button>
          </div>
          <input
            autoFocus
            placeholder="ชื่องาน..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && title.trim() && groupId) void submit() }}
            className={`${input} py-2.5 mb-3 focus:outline-hidden focus:ring-2 focus:ring-brand-200`}
          />
          <div className="grid grid-cols-2 gap-2 mb-3">
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={input} aria-label="โปรเจกต์">
              <option value="">โปรเจกต์...</option>
              {active.map((p) => (
                <option key={p.id} value={p.id}>{p.logo ?? ''} {p.name}</option>
              ))}
            </select>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={input} aria-label="กลุ่ม" disabled={!projectId}>
              {groups.length === 0 && <option value="">กลุ่ม...</option>}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-soft mb-4 cursor-pointer select-none">
            <input type="checkbox" checked={star} onChange={(e) => setStar(e.target.checked)} className="rounded" />
            <Star className="w-4 h-4 text-warning-400 fill-warning-400" /> ทำวันนี้ (ติดดาว)
          </label>
          {error && <div className="text-xs text-danger-600 mb-2">{error}</div>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-sm px-3 py-2 rounded-lg hover:bg-hover">ยกเลิก</button>
            <button onClick={() => void submit()} disabled={!title.trim() || !groupId} className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-40">เพิ่มงาน</button>
          </div>
          <p className="text-[11px] text-muted mt-3">ทิป: กด <kbd className="bg-divider px-1 rounded shadow-xs">N</kbd> เปิดด่วนจากทุกหน้า</p>
        </div>
      </div>
    </div>
  )
}
