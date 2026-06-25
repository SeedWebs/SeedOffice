import { minutesToHoursLabel } from '@seedoffice/core'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'
import { TIMER_CHANGED_EVENT } from '../lib/timer'
import { useLoad } from '../lib/useLoad'
import { avatarColor } from '../pages/ProjectDetail'
import { Avatar } from './Avatar'

interface ProjectTasks {
  projectId: string
  projectName: string
  tasks: { id: string; title: string; minutesLabel?: string }[]
}
export interface TeamRow {
  userId: string
  name: string
  avatarUrl: string | null
  role: string
  todayMinutes: number
  monthMinutes: number
  onLeaveToday: boolean
  running: { taskId: string; taskTitle: string; projectId: string; projectName: string; startedAt: number } | null
  todayPlan: ProjectTasks[]
  yesterday: { totalMinutes: number; byProject: ProjectTasks[] }
}

/** นาฬิกาวิ่งของคนอื่น — tick ฝั่ง client จาก startedAt (P2-5 อัปเดต start/stop ผ่าน WS) */
function RunningBadge({ startedAt }: { startedAt: number }) {
  const [, force] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => force((x) => x + 1), 1000)
    return () => clearInterval(iv)
  }, [])
  const secs = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return (
    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] bg-brand-500 text-white px-1 rounded tabular-nums">
      {h}:{String(m).padStart(2, '0')}
    </span>
  )
}

export function TeamBox({ presenceRows }: { presenceRows?: TeamRow[] | null }) {
  const { data, reload } = useLoad<{ rows: TeamRow[] }>(() => api.get('/api/team-activity'))
  const [showYesterday, setShowYesterday] = useState(false)

  useEffect(() => {
    const onTimer = () => void reload()
    window.addEventListener(TIMER_CHANGED_EVENT, onTimer)
    return () => window.removeEventListener(TIMER_CHANGED_EVENT, onTimer)
  }, [reload])

  // realtime (SPEC §4.15): presence WS — timer ใครขยับ → reload ทันที · reconnect ทุก 5 วิ + ping กัน idle
  useEffect(() => {
    let ws: WebSocket | null = null
    let closed = false
    let pingIv: ReturnType<typeof setInterval> | null = null
    const connect = () => {
      if (closed) return
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/presence/ws`)
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string' && ev.data.includes('changed')) void reload()
      }
      ws.onopen = () => {
        pingIv = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send('ping'), 30_000)
      }
      ws.onclose = () => {
        if (pingIv) clearInterval(pingIv)
        if (!closed) setTimeout(connect, 5_000)
      }
    }
    connect()
    return () => {
      closed = true
      if (pingIv) clearInterval(pingIv)
      ws?.close()
    }
  }, [reload])

  const rows = presenceRows ?? data?.rows ?? []
  if (rows.length === 0) return null

  return (
    <div className="mt-5 bg-white rounded-lg shadow-xs p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold text-ink">ทีมงาน</div>
        <label className="flex items-center gap-2 text-xs text-dim cursor-pointer select-none">
          แสดงเมื่อวาน
          <span className="relative inline-block align-middle">
            <input type="checkbox" checked={showYesterday} onChange={(e) => setShowYesterday(e.target.checked)} className="peer sr-only" />
            <span className="block w-9 h-5 bg-border-subtle rounded-full peer-checked:bg-brand-500 transition" />
            <span className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition peer-checked:translate-x-4" />
          </span>
        </label>
      </div>

      {/* avatar row + presence */}
      <div className="flex flex-wrap gap-3">
        {rows.map((p) => (
          <div key={p.userId} className={`group relative ${p.onLeaveToday ? 'opacity-50' : ''}`}>
            <Avatar name={p.name} avatarUrl={p.avatarUrl} className={`w-11 h-11 text-sm ${p.running ? 'ring-2 ring-brand-400' : ''}`} colorClass={avatarColor(p.name)} />
            {p.running && <RunningBadge startedAt={p.running.startedAt} />}
            <div className="absolute z-20 left-0 top-full mt-2 w-48 bg-ink text-white rounded-xl p-3 text-xs opacity-0 group-hover:opacity-100 pointer-events-none transition shadow-lg">
              <div className="font-semibold mb-0.5">{p.name}</div>
              {p.onLeaveToday ? (
                <div className="text-orange-300">ลาวันนี้</div>
              ) : p.running ? (
                <div className="text-brand-300">⏱ {p.running.taskTitle} · {p.running.projectName}</div>
              ) : (
                <div className="text-border">ไม่ได้จับเวลา</div>
              )}
              {!p.onLeaveToday && <div className="text-muted mt-1">วันนี้ {minutesToHoursLabel(p.todayMinutes)} ชม.</div>}
              <div className={`text-muted ${p.onLeaveToday ? 'mt-1' : ''}`}>เดือนนี้ {minutesToHoursLabel(p.monthMinutes)} ชม.</div>
            </div>
          </div>
        ))}
      </div>

      {/* standup grid (SPEC §4.6 — ไม่ต้องพิมพ์) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border-subtle rounded-lg overflow-hidden text-sm mt-5">
        {rows.filter((p) => p.todayPlan.length > 0 || (showYesterday && p.yesterday.byProject.length > 0)).map((p) => {
          const label = 'inline-block text-[10px] font-medium text-muted border border-border-subtle px-1.5 py-0.5 rounded'
          const renderGroups = (groups: ProjectTasks[], linky: boolean) =>
            groups.map((g) => (
              <div key={g.projectId} className="mt-1.5">
                <div className="text-[11px] text-muted">{g.projectName}</div>
                {g.tasks.map((t) =>
                  linky ? (
                    <Link key={t.id} to={`/projects/${g.projectId}?task=${t.id}`} className="block text-sm text-body hover:text-brand-600 hover:underline truncate">
                      {t.title}
                    </Link>
                  ) : (
                    <div key={t.id} className="text-sm text-dim truncate">
                      {t.title}{t.minutesLabel ? ` · ${t.minutesLabel}` : ''}
                    </div>
                  ),
                )}
              </div>
            ))
          return (
            <div key={p.userId} className="bg-white p-3">
              <div className="flex items-center gap-2 mb-1">
                <Avatar name={p.name} avatarUrl={p.avatarUrl} className="w-6 h-6 text-[10px]" colorClass={avatarColor(p.name)} />
                <span className="font-medium text-sm">{p.name}</span>
              </div>
              {showYesterday && p.yesterday.byProject.length > 0 && (
                <div>
                  <span className={label}>เมื่อวาน · {minutesToHoursLabel(p.yesterday.totalMinutes)} ชม.</span>
                  {renderGroups(p.yesterday.byProject, false)}
                </div>
              )}
              {p.todayPlan.length > 0 && (
                <div className={showYesterday ? 'mt-3' : ''}>
                  {showYesterday && <span className={label}>วันนี้</span>}
                  {renderGroups(p.todayPlan, true)}
                </div>
              )}
            </div>
          )
        })}
        {rows.every((p) => p.todayPlan.length === 0) && !showYesterday && (
          <div className="bg-white p-4 md:col-span-3 text-center text-sm text-border">
            ยังไม่มีใครติดดาว "ทำวันนี้" — แผนงานของแต่ละคนจะโผล่ที่นี่อัตโนมัติ
          </div>
        )}
      </div>
    </div>
  )
}
