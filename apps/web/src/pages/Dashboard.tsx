import { formatHMS } from '@seedoffice/core'
import { Play, Plus, Star } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { TASK_CREATED_EVENT } from '../components/QuickAdd'
import { api } from '../lib/api'
import { fmtThaiDate } from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'

interface TodayTask {
  id: string
  title: string
  status: string
  projectId: string
  projectName: string
  groupName: string
  starred: boolean
  todaySeconds: number
}
interface UpcomingTask {
  id: string
  title: string
  projectId: string
  projectName: string
  dueDate: string | null
}

export function DashboardPage() {
  const { data, reload } = useLoad<{ today: TodayTask[]; upcoming: UpcomingTask[] }>(() => api.get('/api/overview'))
  const navigate = useNavigate()

  useEffect(() => {
    const onCreated = () => void reload()
    window.addEventListener(TASK_CREATED_EVENT, onCreated)
    return () => window.removeEventListener(TASK_CREATED_EVENT, onCreated)
  }, [reload])

  const unstar = async (t: TodayTask) => {
    await api.post(`/api/tasks/${t.id}/star`, { on: false })
    await reload()
  }
  const goTask = (projectId: string, taskId: string) => navigate(`/projects/${projectId}?task=${taskId}`)

  return (
    <div className="p-3 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* งานวันนี้ */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow-xs p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-slate-900">งานวันนี้</div>
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', bubbles: true }))}
              className="text-xs bg-brand-50 text-brand-700 hover:bg-brand-100 px-2 py-1 rounded-lg flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> เพิ่มงานด่วน
            </button>
          </div>
          <div className="text-sm">
            {(data?.today ?? []).length === 0 && (
              <div className="py-8 text-center text-slate-300">
                ยังไม่มีงานวันนี้ — ติดดาว ★ งานในโปรเจกต์ หรือกด <kbd className="bg-slate-100 px-1 rounded shadow-xs">N</kbd> เพิ่มงานด่วน
              </div>
            )}
            {(data?.today ?? []).map((t) => (
              <div
                key={t.id}
                onClick={() => goTask(t.projectId, t.id)}
                className="grid grid-cols-[18px_minmax(0,1fr)_92px] sm:grid-cols-[18px_minmax(0,1.1fr)_minmax(0,0.85fr)_minmax(0,1.7fr)_96px] gap-x-3 items-center py-2 -mx-2 px-2 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                <button onClick={(e) => { e.stopPropagation(); void unstar(t) }} title="เอาออกจากวันนี้" className="sm:order-1">
                  <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                </button>
                <div className="min-w-0 flex flex-col sm:contents">
                  <span className={`truncate text-slate-800 sm:order-4 ${t.status === 'done' ? 'line-through text-slate-400' : ''}`}>{t.title}</span>
                  <span className="flex items-center gap-1 min-w-0 sm:contents">
                    <span className="truncate text-slate-500 text-[11px] sm:text-sm sm:order-2">{t.projectName}</span>
                    <span className="text-slate-300 text-[11px] sm:hidden">·</span>
                    <span className="truncate text-slate-400 text-[11px] sm:text-sm sm:order-3">{t.groupName}</span>
                  </span>
                </div>
                <button
                  onClick={(e) => e.stopPropagation()}
                  title="จับเวลา — มาใน T12"
                  className="w-full flex items-center justify-center gap-1.5 text-slate-300 px-2 py-1 rounded-lg text-xs tabular-nums sm:order-5 cursor-default"
                >
                  <Play className="w-3.5 h-3.5" /> <span>{formatHMS(t.todaySeconds)}</span>
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-3">★ = ตั้งใจทำวันนี้ · ปุ่ม ▶ จับเวลาจะเปิดใช้เมื่อระบบลงเวลามา (T12)</p>
        </div>

        {/* งานเร็วๆ นี้ */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-xs p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-slate-900">งานเร็วๆ นี้</div>
          </div>
          <div>
            {(data?.upcoming ?? []).length === 0 && (
              <div className="py-8 text-center text-sm text-slate-300">ไม่มีงานใกล้กำหนดที่มอบหมายให้คุณ</div>
            )}
            {(data?.upcoming ?? []).map((t) => (
              <div
                key={t.id}
                onClick={() => goTask(t.projectId, t.id)}
                className="flex items-center gap-2 py-1.5 -mx-2 px-2 rounded-lg hover:bg-slate-50 cursor-pointer text-sm"
              >
                <span className="flex-1 min-w-0 truncate text-slate-700">
                  {t.title} <span className="text-slate-400">· {t.projectName}</span>
                </span>
                <span className="text-[11px] text-slate-400 shrink-0">{fmtThaiDate(t.dueDate)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 mt-5">ทีมงาน + ปฏิทิน (team hub) จะตามมาใน P2 — ตอนนี้โฟกัสลูปเงินก่อน</p>
    </div>
  )
}
