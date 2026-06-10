import { ArrowUpDown, Check, ChevronLeft, GripVertical, Plus, Star, X } from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { TaskDrawer } from '../components/TaskDrawer'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { fmtThaiDate, STATUS_CHIP, STATUS_LABEL, type ProjectRow } from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'

export interface BoardTask {
  id: string
  groupId: string
  sortOrder: number
  title: string
  description: string | null
  assigneeId: string | null
  assigneeName: string | null
  status: 'todo' | 'doing' | 'done'
  estimateMinutes: number | null
  startDate: string | null
  dueDate: string | null
  starredToday: boolean
}
export interface BoardGroup {
  id: string
  name: string
  sortOrder: number
  tasks: BoardTask[]
}
const AVATAR_COLORS = ['bg-brand-100 text-brand-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700', 'bg-amber-100 text-amber-700', 'bg-teal-100 text-teal-700', 'bg-indigo-100 text-indigo-700', 'bg-pink-100 text-pink-700']
export const avatarColor = (key: string) => AVATAR_COLORS[[...key].reduce((s, ch) => s + ch.charCodeAt(0), 0) % AVATAR_COLORS.length]

/** ไทม์ไลน์ต่อ task group: บาร์ = min(start) → max(due) ของงานในกลุ่ม + เส้นวันนี้ */
function GroupTimeline({ groups }: { groups: BoardGroup[] }) {
  const ranged = groups
    .map((g) => {
      const starts = g.tasks.map((t) => t.startDate).filter(Boolean) as string[]
      const dues = g.tasks.map((t) => t.dueDate).filter(Boolean) as string[]
      if (starts.length === 0 || dues.length === 0) return null
      return { name: g.name, start: starts.sort()[0]!, end: dues.sort().at(-1)! }
    })
    .filter(Boolean) as { name: string; start: string; end: string }[]
  if (ranged.length === 0) return null

  const min = ranged.map((r) => r.start).sort()[0]!
  const max = ranged.map((r) => r.end).sort().at(-1)!
  const t0 = Date.parse(`${min}T00:00:00+07:00`)
  const t1 = Math.max(Date.parse(`${max}T00:00:00+07:00`), t0 + 86_400_000)
  const pos = (d: string) => ((Date.parse(`${d}T00:00:00+07:00`) - t0) / (t1 - t0)) * 100
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)
  const todayP = pos(today)
  const COLORS = ['bg-amber-400', 'bg-brand-500', 'bg-sky-500', 'bg-violet-500', 'bg-orange-400', 'bg-rose-500', 'bg-emerald-500']

  return (
    <div className="bg-white rounded-lg shadow-xs p-4 mb-4">
      <div className="flex items-baseline gap-2 mb-3">
        <span className="text-sm font-semibold text-slate-700">ไทม์ไลน์</span>
        <span className="text-[11px] text-slate-400">ช่วง = งานที่เริ่มเร็วสุด → จบช้าสุด ในกลุ่ม</span>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {ranged.map((r, i) => (
            <div key={r.name} className="flex items-center py-1">
              <div className="w-44 shrink-0 text-sm pr-3 truncate">
                <span className="font-medium text-slate-700">{r.name}</span>
              </div>
              <div className="relative flex-1 h-7 bg-slate-50 rounded-md">
                {todayP >= 0 && todayP <= 100 && (
                  <div className="absolute top-0 bottom-0 w-px bg-rose-400 z-10" style={{ left: `${todayP}%` }} />
                )}
                <div
                  className={`group absolute inset-y-1 rounded-md ${COLORS[i % COLORS.length]}`}
                  style={{ left: `${pos(r.start)}%`, width: `${Math.max(2, pos(r.end) - pos(r.start))}%` }}
                >
                  <div className="absolute left-1 bottom-full mb-1 whitespace-nowrap bg-slate-900 text-white text-[11px] rounded-lg px-2 py-1 opacity-0 group-hover:opacity-100 pointer-events-none transition shadow-lg z-30">
                    {fmtThaiDate(r.start)} – {fmtThaiDate(r.end, true)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const canEdit = user?.role !== 'vendor'
  const { data: project } = useLoad<ProjectRow>(() => api.get(`/api/projects/${id}`), [id])
  const { data: board, reload } = useLoad<{ groups: BoardGroup[] }>(() => api.get(`/api/projects/${id}/board`), [id])
  const [reorderOn, setReorderOn] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [drawerTask, setDrawerTask] = useState<string | null>(searchParams.get('task'))
  const closeDrawer = () => {
    setDrawerTask(null)
    if (searchParams.has('task')) setSearchParams({}, { replace: true })
  }
  const [addingTaskIn, setAddingTaskIn] = useState<string | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [drag, setDrag] = useState<{ kind: 'task' | 'group'; id: string } | null>(null)

  const groups = useMemo(() => board?.groups ?? [], [board])

  const toggleDone = async (t: BoardTask) => {
    await api.patch(`/api/tasks/${t.id}`, { status: t.status === 'done' ? 'todo' : 'done' })
    await reload()
  }
  const addTask = async (groupId: string) => {
    if (!newTitle.trim()) return
    await api.post(`/api/groups/${groupId}/tasks`, { title: newTitle.trim() })
    setNewTitle('')
    await reload()
  }
  const addGroup = async () => {
    if (!newGroupName.trim()) return
    await api.post(`/api/projects/${id}/groups`, { name: newGroupName.trim() })
    setNewGroupName('')
    setAddingGroup(false)
    await reload()
  }

  /** drop task ลงตำแหน่ง index ใน group เป้าหมาย แล้ว persist ทั้งกระดาน */
  const dropTask = async (targetGroup: BoardGroup, index: number) => {
    if (!drag || drag.kind !== 'task') return
    const moved = groups.flatMap((g) => g.tasks).find((t) => t.id === drag.id)
    if (!moved) return
    const next = groups.map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.id !== moved.id) }))
    const tg = next.find((g) => g.id === targetGroup.id)
    if (!tg) return
    tg.tasks.splice(Math.min(index, tg.tasks.length), 0, { ...moved, groupId: tg.id })
    await api.post(`/api/projects/${id}/reorder`, {
      tasks: next.flatMap((g) => g.tasks.map((t, i) => ({ id: t.id, groupId: g.id, sortOrder: i }))),
    })
    setDrag(null)
    await reload()
  }
  const dropGroup = async (targetIndex: number) => {
    if (!drag || drag.kind !== 'group') return
    const ordered = groups.filter((g) => g.id !== drag.id)
    const movedGroup = groups.find((g) => g.id === drag.id)
    if (!movedGroup) return
    ordered.splice(Math.min(targetIndex, ordered.length), 0, movedGroup)
    await api.post(`/api/projects/${id}/reorder`, {
      groups: ordered.map((g, i) => ({ id: g.id, sortOrder: i })),
    })
    setDrag(null)
    await reload()
  }
  const over = (e: DragEvent) => e.preventDefault()

  if (!project) return <div className="p-6 text-sm text-slate-400">กำลังโหลด…</div>

  return (
    <div className="p-3 sm:p-6">
      <Link to="/projects" className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-1 mb-4">
        <ChevronLeft className="w-4 h-4" /> โปรเจกต์ทั้งหมด
      </Link>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-slate-900">{project.logo} {project.name}</h2>
        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CHIP[project.status]}`}>{STATUS_LABEL[project.status]}</span>
        {canEdit && (
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setReorderOn((v) => !v)}
              title="จัดเรียง task group / งาน"
              className={`flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1.5 ${reorderOn ? 'bg-brand-50 border-brand-200 text-brand-700' : 'text-slate-500 border-slate-200 hover:bg-slate-50'}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" /> จัดเรียง
            </button>
          </div>
        )}
      </div>

      <GroupTimeline groups={groups} />

      <div className="space-y-4">
        {groups.map((g, gi) => (
          <div
            key={g.id}
            className="bg-white rounded-lg shadow-xs overflow-hidden"
            onDragOver={reorderOn ? over : undefined}
            onDrop={reorderOn && drag?.kind === 'group' ? () => void dropGroup(gi) : undefined}
          >
            <div
              className="flex items-center gap-2 px-4 py-3 border-b border-slate-200 bg-slate-50/50"
              draggable={reorderOn}
              onDragStart={() => setDrag({ kind: 'group', id: g.id })}
            >
              {reorderOn && <GripVertical className="w-4 h-4 text-slate-300 cursor-grab" />}
              <span className="font-semibold text-slate-800 text-sm">{g.name}</span>
              <span className="text-xs text-slate-400">{g.tasks.length} งาน</span>
              {canEdit && (
                <button onClick={() => { setAddingTaskIn(addingTaskIn === g.id ? null : g.id); setNewTitle('') }} className="ml-auto text-xs text-slate-400 hover:text-brand-600 flex items-center gap-1">
                  <Plus className="w-3.5 h-3.5" /> task
                </button>
              )}
            </div>
            <div className="divide-y divide-slate-50">
              {g.tasks.map((t, ti) => (
                <div key={t.id}>
                  <div
                    className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer"
                    draggable={reorderOn}
                    onDragStart={(e) => { e.stopPropagation(); setDrag({ kind: 'task', id: t.id }) }}
                    onDragOver={reorderOn ? over : undefined}
                    onDrop={reorderOn && drag?.kind === 'task' ? (e) => { e.stopPropagation(); void dropTask(g, ti) } : undefined}
                    onClick={() => setDrawerTask(t.id)}
                  >
                    {reorderOn && <GripVertical className="w-4 h-4 text-slate-200 cursor-grab shrink-0" />}
                    <button
                      onClick={(e) => { e.stopPropagation(); if (canEdit) void toggleDone(t) }}
                      aria-label={t.status === 'done' ? 'ยกเลิกเสร็จ' : 'ทำเครื่องหมายเสร็จ'}
                      className={`w-4 h-4 rounded-full border-2 grid place-items-center shrink-0 ${
                        t.status === 'done' ? 'border-brand-400 bg-brand-400 text-white' : t.status === 'doing' ? 'border-amber-400' : 'border-slate-300'
                      }`}
                    >
                      {t.status === 'done' && <Check className="w-2.5 h-2.5" />}
                    </button>
                    <span className={`text-sm flex-1 min-w-0 truncate ${t.status === 'done' ? 'text-slate-400 line-through' : ''}`}>{t.title}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); void api.post(`/api/tasks/${t.id}/star`, { on: !t.starredToday }).then(() => reload()) }}
                      title={t.starredToday ? 'เอาออกจากวันนี้' : 'ติดดาว ทำวันนี้'}
                      className="shrink-0"
                    >
                      <Star className={`w-4 h-4 ${t.starredToday ? 'text-amber-400 fill-amber-400' : 'text-slate-200 hover:text-amber-300'}`} />
                    </button>
                    {t.dueDate && t.status !== 'done' && (
                      <span className="text-[11px] text-slate-400 shrink-0">{fmtThaiDate(t.dueDate)}</span>
                    )}
                    {t.assigneeName && (
                      <div className={`w-6 h-6 rounded-full grid place-items-center text-[10px] font-semibold shrink-0 ${avatarColor(t.assigneeName)}`}>
                        {t.assigneeName.slice(0, 2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {reorderOn && drag?.kind === 'task' && (
                <div onDragOver={over} onDrop={() => void dropTask(g, g.tasks.length)} className="px-4 py-2 text-center text-[11px] text-brand-500 bg-brand-50/40">วางท้ายกลุ่มนี้</div>
              )}
              {g.tasks.length === 0 && !reorderOn && (
                <div className="px-4 py-4 text-sm text-slate-300">ยังไม่มีงานในกลุ่มนี้</div>
              )}
              {addingTaskIn === g.id && (
                <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/60">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void addTask(g.id) }}
                    placeholder="ชื่องาน... (Enter เพื่อเพิ่ม)"
                    className="flex-1 text-sm bg-white shadow-xs rounded-lg px-3 py-1.5"
                  />
                  <button onClick={() => void addTask(g.id)} className="text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg">เพิ่ม</button>
                  <button onClick={() => setAddingTaskIn(null)} className="text-slate-400"><X className="w-4 h-4" /></button>
                </div>
              )}
            </div>
          </div>
        ))}

        {canEdit && (
          addingGroup ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void addGroup() }}
                placeholder="ชื่อ task group..."
                className="flex-1 text-sm bg-white shadow-xs rounded-lg px-3 py-2.5"
              />
              <button onClick={() => void addGroup()} className="text-sm bg-brand-600 text-white px-4 py-2.5 rounded-lg">เพิ่มกลุ่ม</button>
              <button onClick={() => setAddingGroup(false)} className="text-slate-400"><X className="w-5 h-5" /></button>
            </div>
          ) : (
            <button onClick={() => setAddingGroup(true)} className="w-full text-sm text-slate-400 hover:text-brand-600 border-2 border-dashed border-slate-200 hover:border-brand-300 rounded-lg py-3 flex items-center justify-center gap-1">
              <Plus className="w-4 h-4" /> เพิ่ม task group
            </button>
          )
        )}
      </div>

      {drawerTask && (
        <TaskDrawer taskId={drawerTask} onClose={closeDrawer} onChanged={() => void reload()} />
      )}
    </div>
  )
}
