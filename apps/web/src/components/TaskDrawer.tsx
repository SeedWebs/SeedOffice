import { formatHMS } from '@seedoffice/core'
import { Check, ChevronDown, History, Paperclip, Plus, Send, Trash2, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useLoad } from '../lib/useLoad'
import { avatarColor } from '../pages/ProjectDetail'

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
  comments: { id: string; body: string; userName: string; createdAt: number }[]
  attachments: { id: string; filename: string; mime: string; sizeBytes: number }[]
  activity: { id: string; action: string; actorName: string; meta: Record<string, unknown> | null; at: number }[]
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
        <div onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
        <aside className="absolute top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl grid place-items-center text-sm text-slate-400">กำลังโหลด…</aside>
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
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/30" />
      <aside className="absolute top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
        <div className="p-4 border-b border-slate-200 flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-xs text-slate-400 mb-1.5">{t.projectName} · {t.groupName}</div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => canEdit && void patch({ status: done ? 'todo' : 'done' })}
                title={done ? 'ยกเลิกเสร็จ' : 'ทำเครื่องหมายว่าเสร็จ'}
                className={`shrink-0 w-7 h-7 rounded-lg border-2 grid place-items-center transition ${done ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 hover:border-brand-400'}`}
              >
                {done && <Check className="w-4 h-4" />}
              </button>
              <div className={`text-lg font-semibold ${done ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{t.title}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className={`px-2 py-1 rounded-lg ${done ? 'bg-emerald-100 text-emerald-700' : t.status === 'doing' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
              {STATUS_THAI[t.status]}
            </span>
            {canEdit ? (
              <select value={t.assigneeId ?? ''} onChange={(e) => void patch({ assigneeId: e.target.value || null })} aria-label="ผู้รับผิดชอบ" className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">
                <option value="">— ผู้รับผิดชอบ —</option>
                {(userOpts ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            ) : (
              t.assigneeName && <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{t.assigneeName}</span>
            )}
          </div>

          {/* ลงเวลา — เชื่อม timer จริงใน T12 */}
          <div className="bg-brand-50 rounded-xl p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="text-[11px] text-brand-700">ลงเวลาที่งานนี้</div>
              <div className="text-2xl font-bold tabular-nums text-slate-900">{formatHMS(0)}</div>
            </div>
            <span className="text-[11px] text-slate-400">timer มาใน T12</span>
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-[11px] text-slate-400">เริ่ม
                <input type="date" defaultValue={t.startDate ?? ''} onBlur={(e) => e.target.value !== (t.startDate ?? '') && void patch({ startDate: e.target.value || null })} className={`${input} block mt-0.5`} />
              </label>
              <label className="text-[11px] text-slate-400">กำหนดส่ง
                <input type="date" defaultValue={t.dueDate ?? ''} onBlur={(e) => e.target.value !== (t.dueDate ?? '') && void patch({ dueDate: e.target.value || null })} className={`${input} block mt-0.5`} />
              </label>
              <label className="text-[11px] text-slate-400">ประเมิน (ชม.)
                <input type="number" defaultValue={t.estimateMinutes != null ? t.estimateMinutes / 60 : ''} onBlur={(e) => void patch({ estimateMinutes: e.target.value ? Math.round(Number(e.target.value) * 60) : null })} className={`${input} block mt-0.5 w-24`} />
              </label>
              <button
                onClick={() => { if (confirm(`ลบงาน "${t.title}"?`)) void api.delete(`/api/tasks/${t.id}`).then(() => { onChanged(); onClose() }) }}
                title="ลบงาน" className="ml-auto self-end p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <div>
            <div className="text-xs font-medium text-slate-400 mb-1">รายละเอียด</div>
            {canEdit ? (
              <textarea
                value={descDraft ?? t.description ?? ''}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={() => { if (descDraft !== null && descDraft !== (t.description ?? '')) void patch({ description: descDraft || null }) }}
                placeholder="เพิ่มรายละเอียดงาน..."
                className="w-full min-h-20 text-sm text-slate-600 bg-slate-50 rounded-lg p-3 focus:outline-hidden focus:ring-2 focus:ring-brand-200"
              />
            ) : (
              <p className="text-sm text-slate-600 whitespace-pre-line">{t.description ?? '—'}</p>
            )}
          </div>

          <div>
            <div className="text-xs font-medium text-slate-400 mb-2">ไฟล์แนบ</div>
            <div className="grid grid-cols-3 gap-2">
              {t.attachments.map((a) => (
                <div key={a.id} className="group relative aspect-square rounded-lg bg-slate-100 overflow-hidden">
                  {a.mime.startsWith('image/') ? (
                    <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer">
                      <img src={`/api/attachments/${a.id}`} alt={a.filename} className="w-full h-full object-cover" />
                    </a>
                  ) : (
                    <a href={`/api/attachments/${a.id}`} className="w-full h-full grid place-items-center text-slate-400 p-2 text-center">
                      <span><Paperclip className="w-5 h-5 mx-auto mb-1" /><span className="text-[10px] break-all line-clamp-2">{a.filename}</span></span>
                    </a>
                  )}
                  {canEdit && (
                    <button onClick={() => void removeAttachment(a.id)} className="absolute top-1 right-1 w-5 h-5 grid place-items-center rounded bg-slate-900/60 text-white opacity-0 group-hover:opacity-100" title="ลบไฟล์">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              {canEdit && (
                <button onClick={() => fileRef.current?.click()} className="aspect-square rounded-lg border-2 border-dashed border-slate-200 grid place-items-center text-slate-400 hover:border-brand-300 hover:text-brand-600">
                  <Plus className="w-5 h-5" />
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = '' }} />
          </div>

          <div>
            <div className="text-xs font-medium text-slate-400 mb-2">ความเห็น</div>
            <div className="space-y-3">
              {t.comments.length === 0 && <div className="text-sm text-slate-300">ยังไม่มีความเห็น</div>}
              {t.comments.map((cm) => (
                <div key={cm.id} className="flex gap-2">
                  <div className={`w-7 h-7 rounded-full grid place-items-center text-[10px] font-semibold shrink-0 ${avatarColor(cm.userName)}`}>{cm.userName.slice(0, 2)}</div>
                  <div className="bg-slate-50 rounded-xl px-3 py-2 text-sm text-slate-600 min-w-0">
                    <b className="text-slate-700">{cm.userName}</b> · {cm.body}
                    <div className="text-[10px] text-slate-400 mt-0.5">{fmtWhen(cm.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <button onClick={() => setShowActivity((v) => !v)} className="flex items-center gap-2 w-full text-left text-xs font-medium text-slate-400 hover:text-slate-600">
              <History className="w-4 h-4" /> ประวัติกิจกรรม <span className="text-slate-300">({t.activity.length})</span>
              <ChevronDown className={`w-4 h-4 ml-auto transition-transform ${showActivity ? 'rotate-180' : ''}`} />
            </button>
            {showActivity && (
              <div className="mt-3 space-y-2.5">
                {t.activity.map((a) => (
                  <div key={a.id} className="flex gap-2 text-xs">
                    <div className={`w-5 h-5 rounded-full grid place-items-center text-[9px] font-semibold shrink-0 ${avatarColor(a.actorName)}`}>{a.actorName.slice(0, 2)}</div>
                    <div className="flex-1 leading-snug">
                      <b className="text-slate-700">{a.actorName}</b>{' '}
                      <span className="text-slate-500">{ACTION_LABEL[a.action] ?? a.action}</span>{' '}
                      <span className="text-slate-400">· {fmtWhen(a.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-3 border-t border-slate-200 flex gap-2">
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
