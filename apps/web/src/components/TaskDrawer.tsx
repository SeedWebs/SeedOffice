import { formatHMS, minutesToHoursLabel } from '@seedoffice/core'
import { Check, ChevronDown, History, Paperclip, Pause, Pencil, Play, Plus, Send, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useTimer } from '../lib/timer'
import { useLoad } from '../lib/useLoad'
import { avatarColor } from '../pages/ProjectDetail'
import { Avatar } from './Avatar'
import { useDialog } from './Dialog'

interface TimeRow {
  id: string
  userId: string
  userName: string
  workDate: string
  minutes: number
  note: string | null
  source: 'timer' | 'manual'
  editCount: number
}

const bkkToday = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)

/** timer + manual + รายการเวลา ของ task นี้ (SPEC §4.5 — ลงเวลาจากหน้า task เท่านั้น) */
function TimeSection({ taskId }: { taskId: string }) {
  const { user } = useAuth()
  const timer = useTimer()
  const { confirmDialog } = useDialog()
  const { data: rows, reload } = useLoad<TimeRow[]>(() => api.get(`/api/tasks/${taskId}/time`), [taskId])
  const [manualOpen, setManualOpen] = useState(false)
  const [mForm, setMForm] = useState({ date: bkkToday(), hours: '', note: '' })
  const [mError, setMError] = useState('')
  const [editRow, setEditRow] = useState<TimeRow | null>(null)

  const isRunningHere = timer.active?.taskId === taskId
  const taskSeconds = (rows ?? []).filter((r) => r.userId === user?.id && r.workDate === bkkToday()).reduce((s, r) => s + r.minutes * 60, 0)

  const addManual = async () => {
    try {
      setMError('')
      const minutes = Math.round(Number(mForm.hours) * 60)
      await api.post(`/api/tasks/${taskId}/time`, { workDate: mForm.date, minutes, note: mForm.note || undefined })
      setManualOpen(false)
      setMForm({ date: bkkToday(), hours: '', note: '' })
      await reload()
      await timer.refresh()
    } catch (e) {
      setMError(e instanceof Error ? e.message : 'ผิดพลาด')
    }
  }
  const saveEdit = async () => {
    if (!editRow) return
    await api.patch(`/api/time/${editRow.id}`, { minutes: editRow.minutes, note: editRow.note })
    setEditRow(null)
    await reload()
    await timer.refresh()
  }
  const removeRow = async (r: TimeRow) => {
    const okDelete = await confirmDialog({
      title: 'ลบเวลาที่ลงไว้?',
      message: `${minutesToHoursLabel(r.minutes)} ชม. วันที่ ${r.workDate} จะถูกลบ (เก็บร่องรอยใน audit log)`,
      confirmLabel: 'ลบ',
      danger: true,
    })
    if (!okDelete) return
    await api.delete(`/api/time/${r.id}`)
    await reload()
    await timer.refresh()
  }

  return (
    <div>
      <div className="bg-brand-50 rounded-xl p-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-[11px] text-brand-700">ลงเวลาที่งานนี้ (วันนี้)</div>
          <div className="text-2xl font-bold tabular-nums text-ink">
            {formatHMS(taskSeconds + (isRunningHere ? timer.runningSeconds : 0))}
          </div>
        </div>
        {isRunningHere ? (
          <button onClick={() => void timer.stop().then(() => reload())} className="bg-danger-500 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1">
            <Pause className="w-4 h-4" /> หยุด
          </button>
        ) : (
          <button
            onClick={() => void timer.start(taskId).then(() => reload())}
            disabled={timer.capReached}
            title={timer.capReached ? 'ครบเพดานชั่วโมงวันนี้แล้ว' : 'เริ่มจับเวลา'}
            className="bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-3 py-2 rounded-lg text-sm flex items-center gap-1"
          >
            <Play className="w-4 h-4" /> จับเวลา
          </button>
        )}
        <button onClick={() => setManualOpen((v) => !v)} className="shadow-xs bg-white px-3 py-2 rounded-lg text-sm">+ manual</button>
      </div>

      {manualOpen && (
        <div className="mt-2 p-3 bg-hover rounded-xl space-y-2">
          <div className="flex gap-2">
            <input type="date" value={mForm.date} onChange={(e) => setMForm({ ...mForm, date: e.target.value })} className="text-sm bg-white shadow-xs rounded-lg px-2.5 py-1.5" />
            <input type="number" step="0.25" min="0" placeholder="ชม." value={mForm.hours} onChange={(e) => setMForm({ ...mForm, hours: e.target.value })} className="w-20 text-sm bg-white shadow-xs rounded-lg px-2.5 py-1.5" />
            <input placeholder="โน้ต (ทำอะไร)" value={mForm.note} onChange={(e) => setMForm({ ...mForm, note: e.target.value })} className="flex-1 min-w-0 text-sm bg-white shadow-xs rounded-lg px-2.5 py-1.5" />
          </div>
          {mError && <div className="text-xs text-danger-600">{mError}</div>}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted">manual ถูกบันทึก log และนับเข้า manual% เสมอ</span>
            <button onClick={() => void addManual()} disabled={!mForm.hours} className="text-sm bg-brand-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-40">บันทึกเวลา</button>
          </div>
        </div>
      )}

      {(rows ?? []).length > 0 && (
        <div className="mt-3 space-y-1">
          {(rows ?? []).map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-xs py-1">
              {editRow?.id === r.id ? (
                <>
                  <span className="text-dim w-20">{r.workDate.slice(5)}</span>
                  <input type="number" value={editRow.minutes} onChange={(e) => setEditRow({ ...editRow, minutes: Number(e.target.value) })} className="w-16 bg-white shadow-xs rounded px-1.5 py-1" title="นาที" />
                  <span className="text-muted">นาที</span>
                  <button onClick={() => void saveEdit()} className="text-brand-600 font-medium">บันทึก</button>
                  <button onClick={() => setEditRow(null)} className="text-muted">ยกเลิก</button>
                </>
              ) : (
                <>
                  <span className="text-dim w-20 shrink-0">{r.workDate.slice(5)}</span>
                  <span className="tabular-nums font-medium text-body">{minutesToHoursLabel(r.minutes)} ชม.</span>
                  <span className={`px-1.5 rounded text-[10px] ${r.source === 'manual' ? 'bg-warning-50 text-warning-600' : 'bg-divider text-dim'}`}>{r.source}</span>
                  <span className="text-muted truncate flex-1">{r.userName}{r.note ? ` · ${r.note}` : ''}{r.editCount > 0 ? ` · แก้ ${r.editCount} ครั้ง` : ''}</span>
                  {(r.userId === user?.id || user?.role === 'owner') && (
                    <span className="shrink-0 flex gap-1">
                      <button onClick={() => setEditRow(r)} title="แก้เวลา" className="text-border hover:text-soft"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => void removeRow(r)} title="ลบเวลา" className="text-border hover:text-danger-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    </span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface Detail {
  id: string
  title: string
  description: string | null
  status: 'todo' | 'doing' | 'done'
  assigneeId: string | null
  assigneeName: string | null
  estimateMinutes: number | null
  startDate: string | null
  dueDate: string | null
  groupName: string
  projectName: string
  comments: { id: string; body: string; userName: string; userAvatarUrl?: string | null; createdAt: number }[]
  attachments: { id: string; filename: string; mime: string; sizeBytes: number }[]
  activity: { id: string; action: string; actorName: string; actorAvatarUrl?: string | null; meta: Record<string, unknown> | null; at: number }[]
}
interface UserOpt {
  id: string
  name: string
}

const ACTION_LABEL: Record<string, string> = {
  'task.create': 'สร้างงานนี้',
  'task.update': 'แก้รายละเอียดงาน',
  'task.assign': 'เปลี่ยนผู้รับผิดชอบ',
  'task.status': 'เปลี่ยนสถานะ',
  'task.done': 'ทำเสร็จ',
  'task.delete': 'ลบงาน',
  'task.comment': 'คอมเมนต์',
  'task.attach': 'แนบไฟล์',
  'task.attach_delete': 'ลบไฟล์แนบ',
  'time_entry.create': 'ลงเวลา',
  'time_entry.update': 'แก้เวลา',
  'time_entry.delete': 'ลบเวลา',
}

const fmtWhen = (ms: number) =>
  new Date(ms).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const STATUS_THAI = { todo: 'รอเริ่ม', doing: 'กำลังทำ', done: 'เสร็จแล้ว' } as const

export function TaskDrawer({ taskId, onClose, onChanged }: { taskId: string; onClose: () => void; onChanged: () => void }) {
  const { user } = useAuth()
  const { confirmDialog } = useDialog()
  const canEdit = user?.role !== 'vendor'
  const { data: t, reload } = useLoad<Detail>(() => api.get(`/api/tasks/${taskId}/detail`), [taskId])
  const { data: userOpts } = useLoad<UserOpt[]>(() => api.get('/api/users'))
  const [comment, setComment] = useState('')
  const [showActivity, setShowActivity] = useState(false)
  const [descDraft, setDescDraft] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!t)
    return (
      <div className="fixed inset-0 z-50">
        <div onClick={onClose} className="absolute inset-0 bg-ink/30" />
        <aside className="absolute top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl grid place-items-center text-sm text-muted">กำลังโหลด…</aside>
      </div>
    )

  const patch = async (data: Record<string, unknown>) => {
    await api.patch(`/api/tasks/${t.id}`, data)
    await reload()
    onChanged()
  }
  const postComment = async () => {
    if (!comment.trim()) return
    await api.post(`/api/tasks/${t.id}/comments`, { body: comment.trim() })
    setComment('')
    await reload()
  }
  const upload = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(`/api/tasks/${t.id}/attachments`, { method: 'POST', body: fd })
    if (res.ok) await reload()
  }
  const removeAttachment = async (id: string) => {
    await api.delete(`/api/attachments/${id}`)
    await reload()
  }

  const done = t.status === 'done'
  const input = 'text-sm bg-white shadow-xs rounded-lg px-2.5 py-1.5'

  return (
    <div className="fixed inset-0 z-50">
      <div onClick={onClose} className="absolute inset-0 bg-ink/30" />
      <aside className="absolute top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="p-4 border-b border-border-subtle flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-muted mb-1.5">{t.projectName} · {t.groupName}</div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => canEdit && void patch({ status: done ? 'todo' : 'done' })}
                title={done ? 'ยกเลิกเสร็จ' : 'ทำเครื่องหมายว่าเสร็จ'}
                className={`shrink-0 w-7 h-7 rounded-lg border-2 grid place-items-center transition ${done ? 'border-brand-500 bg-brand-500 text-white' : 'border-border hover:border-brand-400'}`}
              >
                {done && <Check className="w-4 h-4" />}
              </button>
              <div className={`text-lg font-semibold ${done ? 'text-muted line-through' : 'text-ink'}`}>{t.title}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-soft shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className={`px-2 py-1 rounded-lg ${done ? 'bg-success-100 text-success-700' : t.status === 'doing' ? 'bg-warning-100 text-warning-700' : 'bg-divider text-soft'}`}>
              {STATUS_THAI[t.status]}
            </span>
            {canEdit ? (
              <select value={t.assigneeId ?? ''} onChange={(e) => void patch({ assigneeId: e.target.value || null })} aria-label="ผู้รับผิดชอบ" className="bg-divider text-soft px-2 py-1 rounded-lg">
                <option value="">— ผู้รับผิดชอบ —</option>
                {(userOpts ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            ) : (
              t.assigneeName && <span className="bg-divider text-soft px-2 py-1 rounded-lg">{t.assigneeName}</span>
            )}
          </div>

          <TimeSection taskId={t.id} />

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-muted">เริ่ม
                <input type="date" defaultValue={t.startDate ?? ''} onBlur={(e) => e.target.value !== (t.startDate ?? '') && void patch({ startDate: e.target.value || null })} className={`${input} block mt-0.5`} />
              </label>
              <label className="text-[11px] text-muted">กำหนดส่ง
                <input type="date" defaultValue={t.dueDate ?? ''} onBlur={(e) => e.target.value !== (t.dueDate ?? '') && void patch({ dueDate: e.target.value || null })} className={`${input} block mt-0.5`} />
              </label>
              <label className="text-[11px] text-muted">ประเมิน (ชม.)
                <input type="number" defaultValue={t.estimateMinutes != null ? t.estimateMinutes / 60 : ''} onBlur={(e) => void patch({ estimateMinutes: e.target.value ? Math.round(Number(e.target.value) * 60) : null })} className={`${input} block mt-0.5 w-24`} />
              </label>
              <button
                onClick={() => {
                  void confirmDialog({ title: 'ลบงานนี้?', message: `"${t.title}" และความเห็น/ไฟล์แนบจะถูกลบ`, confirmLabel: 'ลบ', danger: true }).then(
                    (yes) => { if (yes) void api.delete(`/api/tasks/${t.id}`).then(() => { onChanged(); onClose() }) },
                  )
                }}
                title="ลบงาน" className="ml-auto self-end p-2 rounded-lg text-muted hover:text-danger-600 hover:bg-danger-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-muted mb-1">รายละเอียด</div>
            {canEdit ? (
              <textarea
                value={descDraft ?? t.description ?? ''}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={() => { if (descDraft !== null && descDraft !== (t.description ?? '')) void patch({ description: descDraft || null }) }}
                placeholder="เพิ่มรายละเอียดงาน..."
                className="w-full min-h-20 text-sm text-soft bg-hover rounded-lg p-3 focus:outline-hidden focus:ring-2 focus:ring-brand-200"
              />
            ) : (
              <p className="text-sm text-soft whitespace-pre-line">{t.description ?? '—'}</p>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-muted mb-2">ไฟล์แนบ</div>
            <div className="grid grid-cols-3 gap-2">
              {t.attachments.map((a) => (
                <div key={a.id} className="group relative aspect-square rounded-lg bg-divider overflow-hidden">
                  {a.mime.startsWith('image/') ? (
                    <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/attachments/${a.id}`} alt={a.filename} className="w-full h-full object-cover" />
                    </a>
                  ) : (
                    <a href={`/api/attachments/${a.id}`} className="w-full h-full grid place-items-center text-muted p-2 text-center">
                      <span><Paperclip className="w-5 h-5 mx-auto mb-1" /><span className="text-[10px] break-all line-clamp-2">{a.filename}</span></span>
                    </a>
                  )}
                  {canEdit && (
                    <button onClick={() => void removeAttachment(a.id)} className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded bg-ink/60 text-white opacity-0 group-hover:opacity-100" title="ลบไฟล์">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button onClick={() => fileRef.current?.click()} className="aspect-square rounded-lg border-2 border-dashed border-border-subtle grid place-items-center text-muted hover:border-brand-300 hover:text-brand-600">
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
          </div>

          <div>
            <div className="text-xs font-medium text-muted mb-2">ความเห็น</div>
            <div className="space-y-3">
              {t.comments.length === 0 && <div className="text-sm text-border">ยังไม่มีความเห็น</div>}
              {t.comments.map((cm) => (
                <div key={cm.id} className="flex gap-2">
                  <Avatar name={cm.userName} avatarUrl={cm.userAvatarUrl} className="w-7 h-7 text-[10px]" colorClass={avatarColor(cm.userName)} />
                  <div className="bg-hover rounded-xl px-3 py-2 text-sm text-soft min-w-0">
                    <b className="text-body">{cm.userName}</b> · {cm.body}
                    <div className="text-[10px] text-muted mt-0.5">{fmtWhen(cm.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-divider pt-4">
            <button onClick={() => setShowActivity((v) => !v)} className="flex items-center gap-2 w-full text-left text-xs font-medium text-muted hover:text-soft">
              <History className="w-4 h-4" /> ประวัติกิจกรรม <span className="text-border">({t.activity.length})</span>
              <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showActivity ? 'rotate-180' : ''}`} />
            </button>
            {showActivity && (
              <div className="mt-3 space-y-2.5">
                {t.activity.map((a) => (
                  <div key={a.id} className="flex gap-2 text-xs">
                    <Avatar name={a.actorName} avatarUrl={a.actorAvatarUrl} className="w-5 h-5 text-[9px]" colorClass={avatarColor(a.actorName)} />
                    <div className="flex-1 leading-snug">
                      <b className="text-body">{a.actorName}</b>{' '}
                      <span className="text-dim">{ACTION_LABEL[a.action] ?? a.action}</span>{' '}
                      <span className="text-muted">· {fmtWhen(a.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 border-t border-border-subtle flex gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void postComment() }}
            className="flex-1 text-sm bg-white shadow-xs rounded-lg px-3 py-2"
            placeholder="เพิ่มความเห็น..."
          />
          <button onClick={() => void postComment()} className="bg-brand-600 hover:bg-brand-700 text-white px-3 rounded-lg" title="ส่ง">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </aside>
    </div>
  )
}
