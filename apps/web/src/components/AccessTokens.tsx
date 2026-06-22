import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../lib/api'
import { useLoad } from '../lib/useLoad'
import { useDialog } from './Dialog'

/**
 * ตั้งค่า → Access Tokens (SPEC §4.18) — owner+member · อยู่ในหน้าโปรไฟล์
 * สร้าง PAT ให้ Claude/สคริปต์เรียก API (งาน+เวลา · ไม่แตะการเงิน) · token เต็มโชว์ครั้งเดียว
 */
interface TokenRow {
  id: string
  name: string
  scopes: string[]
  lastUsedAt: string | null
  createdAt: string
}

const SCOPES: { id: string; label: string }[] = [
  { id: 'tasks:read', label: 'อ่านงาน' },
  { id: 'tasks:write', label: 'สร้าง/แก้งาน' },
  { id: 'time:read', label: 'อ่านเวลา' },
  { id: 'time:write', label: 'ลงเวลา' },
  { id: 'projects:read', label: 'อ่านโปรเจกต์' },
]
const DEFAULT_SCOPES = SCOPES.map((s) => s.id)

export function AccessTokens() {
  const { data, loading, reload } = useLoad<{ tokens: TokenRow[] }>(() => api.get('/api/tokens'))
  const { confirmDialog } = useDialog()
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<string[]>(DEFAULT_SCOPES)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ name: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const toggle = (id: string) => setScopes((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const create = async () => {
    setError('')
    if (!name.trim() || scopes.length === 0) {
      setError('ใส่ชื่อ + เลือก scope อย่างน้อย 1')
      return
    }
    setCreating(true)
    try {
      const res = await api.post<{ name: string; token: string }>('/api/tokens', { name: name.trim(), scopes })
      setCreated({ name: res.name, token: res.token })
      setName('')
      setScopes(DEFAULT_SCOPES)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'สร้างไม่สำเร็จ')
    } finally {
      setCreating(false)
    }
  }

  const copy = async () => {
    if (!created) return
    await navigator.clipboard.writeText(created.token)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const revoke = async (t: TokenRow) => {
    if (
      !(await confirmDialog({
        title: 'เพิกถอน token นี้?',
        message: `"${t.name}" — แอป/สคริปต์ที่ใช้ token นี้จะใช้ต่อไม่ได้ทันที`,
        danger: true,
        confirmLabel: 'เพิกถอน',
      }))
    )
      return
    await api.delete(`/api/tokens/${t.id}`)
    await reload()
  }

  const dateLabel = (iso: string) =>
    new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })

  return (
    <div className="bg-white rounded-lg shadow-xs overflow-hidden">
      <div className="p-5 border-b border-border-subtle flex flex-wrap items-center gap-2">
        <KeyRound className="w-4 h-4 text-muted" />
        <div className="font-semibold text-ink">Access Tokens</div>
        <span className="text-xs text-muted">ให้ Claude/สคริปต์เรียก API แทนคุณ (งาน + เวลา · ไม่แตะการเงิน)</span>
      </div>

      <div className="p-5 space-y-4">
        {created && (
          <div className="rounded-lg border border-warning-300 bg-warning-50 p-4 space-y-2.5">
            <div className="text-sm font-medium text-warning-800">
              คัดลอก token “{created.name}” เก็บไว้เดี๋ยวนี้ — โชว์ครั้งเดียว ปิดแล้วดูอีกไม่ได้
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white rounded-lg px-3 py-2 break-all font-mono text-body">
                {created.token}
              </code>
              <button
                onClick={() => void copy()}
                className="flex items-center gap-1 text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-2 rounded-lg shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
              </button>
            </div>
            <button onClick={() => setCreated(null)} className="text-xs text-warning-700 underline">
              เก็บแล้ว ปิด
            </button>
          </div>
        )}

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อ token (เช่น claude-โน้ตบุ๊ก)"
              className="flex-1 min-w-[180px] text-sm bg-white shadow-xs rounded-lg px-3 py-2"
            />
            <button
              onClick={() => void create()}
              disabled={creating}
              className="flex items-center gap-1.5 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-3.5 py-2 rounded-lg"
            >
              <Plus className="w-4 h-4" /> สร้าง token
            </button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {SCOPES.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-xs text-soft cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes(s.id)}
                  onChange={() => toggle(s.id)}
                  className="accent-brand-600"
                />
                {s.label} <span className="text-muted font-mono">{s.id}</span>
              </label>
            ))}
          </div>
          {error && <div className="text-xs text-danger-600">{error}</div>}
        </div>

        <div className="border-t border-divider pt-3">
          {loading ? (
            <div className="py-4 text-center text-sm text-muted">กำลังโหลด…</div>
          ) : (data?.tokens.length ?? 0) === 0 ? (
            <div className="py-4 text-center text-sm text-muted">ยังไม่มี token — สร้างอันแรกด้านบนเพื่อต่อ Claude</div>
          ) : (
            <div className="space-y-2">
              {data?.tokens.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-body">{t.name}</span>
                  <span className="flex flex-wrap gap-1">
                    {t.scopes.map((sc) => (
                      <span key={sc} className="text-[10px] px-1.5 py-0.5 rounded bg-hover text-dim font-mono">
                        {sc}
                      </span>
                    ))}
                  </span>
                  <span className="ml-auto text-[11px] text-muted">
                    {t.lastUsedAt ? `ใช้ล่าสุด ${dateLabel(t.lastUsedAt)}` : `สร้าง ${dateLabel(t.createdAt)} · ยังไม่ถูกใช้`}
                  </span>
                  <button onClick={() => void revoke(t)} className="text-muted hover:text-danger-600" title="เพิกถอน">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
