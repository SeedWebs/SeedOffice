import { Mail, Plus, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import { useLoad } from '../lib/useLoad'
import { useDialog } from './Dialog'

/**
 * ตั้งค่า → อีเมลกลาง (SPEC §4.12 · E1) — owner เท่านั้น
 * ทุกอย่าง config ผ่านหน้านี้: Google client (Internal) + กล่องเมล — ไม่มี hardcode ในโค้ด
 */

interface InboxClient {
  id: string
  label: string
  clientId: string
}
interface InboxMailbox {
  id: string
  clientId: string
  companyLabel: string
  name: string
  emailAddress: string | null
  status: 'connected' | 'disconnected' | 'disabled'
  lastSyncAt: string | null
  lastError: string | null
}
interface Settings {
  clients: InboxClient[]
  mailboxes: InboxMailbox[]
}

const STATUS_BADGE: Record<InboxMailbox['status'], { label: string; cls: string }> = {
  connected: { label: 'เชื่อมแล้ว', cls: 'bg-emerald-100 text-emerald-700' },
  disconnected: { label: 'ยังไม่เชื่อม', cls: 'bg-amber-100 text-amber-700' },
  disabled: { label: 'ปิดอยู่', cls: 'bg-slate-100 text-slate-500' },
}

const CALLBACK_ERROR: Record<string, string> = {
  token_exchange: 'แลก token กับ Google ไม่สำเร็จ — ลองเชื่อมใหม่อีกครั้ง',
  no_refresh_token: 'Google ไม่ส่ง refresh token มา — กดเชื่อมใหม่อีกครั้ง',
  gmail_scope_denied: 'ยังไม่ได้อนุญาตสิทธิ์ Gmail — หน้าขอสิทธิ์ของ Google ต้องติ๊กอนุญาตทุกข้อ',
  already_connected: 'บัญชี Gmail นี้ถูกเชื่อมกับกล่องอื่นอยู่แล้ว',
  mailbox_not_found: 'ไม่พบกล่องที่กำลังเชื่อม — รีเฟรชแล้วลองใหม่',
  client_not_found: 'Client ของกล่องนี้ถูกลบไปแล้ว — เพิ่ม client แล้วลองใหม่',
}

function AddClientForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ label: '', clientId: '', clientSecret: '' })
  const [error, setError] = useState('')
  const submit = async () => {
    try {
      await api.post('/api/inbox/clients', form)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ผิดพลาด')
    }
  }
  return (
    <div className="p-4 bg-slate-50 rounded-lg space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input
          placeholder="ชื่อเรียก (เช่นชื่อบริษัท)"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
        <input
          placeholder="Client ID"
          value={form.clientId}
          onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
        <input
          placeholder="Client secret"
          type="password"
          autoComplete="off"
          value={form.clientSecret}
          onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
      </div>
      {error && <div className="text-xs text-rose-600">{error}</div>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">
          จาก GCP console → Google Auth Platform (ต้องเป็นแบบ <b>Internal</b>) · secret
          ถูกเข้ารหัสเก็บ และจะไม่แสดงอีก
        </p>
        <button
          onClick={() => void submit()}
          disabled={!form.label || !form.clientId || !form.clientSecret}
          className="shrink-0 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg"
        >
          เพิ่ม client
        </button>
      </div>
    </div>
  )
}

function AddMailboxForm({ clients, onDone }: { clients: InboxClient[]; onDone: () => void }) {
  const [form, setForm] = useState({ clientId: clients[0]?.id ?? '', companyLabel: '', name: '' })
  const [error, setError] = useState('')
  const submit = async () => {
    try {
      await api.post('/api/inbox/mailboxes', form)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ผิดพลาด')
    }
  }
  return (
    <div className="p-4 bg-slate-50 rounded-lg space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select
          value={form.clientId}
          onChange={(e) => setForm({ ...form, clientId: e.target.value })}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              client: {c.label}
            </option>
          ))}
        </select>
        <input
          placeholder="บริษัท (จัดกลุ่มในตัวเลือกกล่อง)"
          value={form.companyLabel}
          onChange={(e) => setForm({ ...form, companyLabel: e.target.value })}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
        <input
          placeholder="ชื่อกล่อง (เช่น ฝ่ายซัพพอร์ต)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
        />
      </div>
      {error && <div className="text-xs text-rose-600">{error}</div>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-slate-400">
          อีเมลของกล่องจะถูกดึงจากบัญชี Google ที่กด "เชื่อม Gmail" — ไม่ต้องพิมพ์เอง
        </p>
        <button
          onClick={() => void submit()}
          disabled={!form.clientId || !form.companyLabel || !form.name}
          className="shrink-0 text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg"
        >
          เพิ่มกล่อง
        </button>
      </div>
    </div>
  )
}

export function InboxSettings() {
  const { data, loading, reload } = useLoad<Settings>(() => api.get('/api/inbox/settings'))
  const { confirmDialog } = useDialog()
  const [params, setParams] = useSearchParams()
  const [addingClient, setAddingClient] = useState(false)
  const [addingBox, setAddingBox] = useState(false)
  const [actionError, setActionError] = useState('')

  const connected = params.get('inbox') === 'connected'
  const callbackError = params.get('inbox_error')
  const clearBanner = () => {
    params.delete('inbox')
    params.delete('inbox_error')
    setParams(params, { replace: true })
  }

  const removeClient = async (c: InboxClient) => {
    if (
      !(await confirmDialog({
        title: `ลบ client "${c.label}"?`,
        message: 'กล่องที่ยังใช้ client นี้อยู่ต้องถูกปิดก่อนถึงจะลบได้',
        danger: true,
        confirmLabel: 'ลบ',
      }))
    )
      return
    try {
      await api.delete(`/api/inbox/clients/${c.id}`)
      setActionError('')
      await reload()
    } catch (e) {
      setActionError(
        e instanceof ApiError && e.message === 'client_in_use'
          ? `ลบ "${c.label}" ไม่ได้ — ยังมีกล่องที่ใช้ client นี้อยู่ (ปิดกล่องก่อน)`
          : 'ลบ client ไม่สำเร็จ',
      )
    }
  }

  const toggleBox = async (m: InboxMailbox) => {
    await api.post(
      `/api/inbox/mailboxes/${m.id}/${m.status === 'disabled' ? 'enable' : 'disable'}`,
    )
    await reload()
  }

  const [syncingId, setSyncingId] = useState<string | null>(null)
  const syncNow = async (m: InboxMailbox) => {
    setSyncingId(m.id)
    try {
      await api.post(`/api/inbox/mailboxes/${m.id}/sync`)
      await reload()
    } finally {
      setSyncingId(null)
    }
  }

  const timeLabel = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <div className="bg-white rounded-lg shadow-xs overflow-hidden">
      <div className="p-5 border-b border-slate-200 flex items-center gap-2">
        <Mail className="w-4 h-4 text-slate-400" />
        <div className="font-semibold text-slate-900">อีเมลกลาง</div>
        <span className="text-xs text-slate-400">เชื่อมกล่อง Gmail ของทีม — จัดการรวมที่เดียว</span>
      </div>

      {connected && (
        <div className="mx-5 mt-4 px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm flex items-center justify-between">
          เชื่อมกล่องสำเร็จ — พร้อมใช้งาน
          <button onClick={clearBanner} className="text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {callbackError && (
        <div className="mx-5 mt-4 px-4 py-2.5 rounded-lg bg-rose-50 text-rose-700 text-sm flex items-center justify-between">
          {CALLBACK_ERROR[callbackError] ?? `เชื่อมไม่สำเร็จ (${callbackError})`}
          <button onClick={clearBanner} className="text-rose-400 hover:text-rose-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {actionError && <div className="mx-5 mt-4 text-xs text-rose-600">{actionError}</div>}

      {loading ? (
        <div className="p-8 text-center text-sm text-slate-400">กำลังโหลด…</div>
      ) : (
        <div className="p-5 space-y-5">
          {/* Google OAuth clients */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">
                Google client{' '}
                <span className="text-xs font-normal text-slate-400">
                  (OAuth client แบบ Internal — ตัวละ Workspace/บริษัท)
                </span>
              </div>
              <button
                onClick={() => setAddingClient((v) => !v)}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> เพิ่ม client
              </button>
            </div>
            {addingClient && (
              <AddClientForm
                onDone={() => {
                  setAddingClient(false)
                  void reload()
                }}
              />
            )}
            {(data?.clients ?? []).length === 0 && !addingClient && (
              <div className="text-sm text-slate-400 py-2">
                ยังไม่มี client — เริ่มจากสร้าง OAuth client (Internal) ใน GCP console
                แล้วนำ client ID/secret มาวางที่นี่
              </div>
            )}
            {(data?.clients ?? []).map((c) => (
              <div key={c.id} className="flex items-center gap-3 text-sm py-1">
                <span className="font-medium text-slate-700">{c.label}</span>
                <span className="text-xs text-slate-400 truncate max-w-60">{c.clientId}</span>
                <button
                  onClick={() => void removeClient(c)}
                  className="ml-auto text-[11px] text-slate-400 hover:text-rose-600 underline"
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>

          {/* กล่องเมล */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-700">กล่องเมล</div>
              <button
                onClick={() => setAddingBox((v) => !v)}
                disabled={(data?.clients ?? []).length === 0}
                className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 disabled:opacity-40 font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> เพิ่มกล่อง
              </button>
            </div>
            {addingBox && data && (
              <AddMailboxForm
                clients={data.clients}
                onDone={() => {
                  setAddingBox(false)
                  void reload()
                }}
              />
            )}
            {(data?.mailboxes ?? []).length === 0 && !addingBox && (
              <div className="text-sm text-slate-400 py-2">
                ยังไม่มีกล่อง — เพิ่มกล่องแล้วกด "เชื่อม Gmail" ด้วยบัญชีของกล่องนั้น
              </div>
            )}
            {(data?.mailboxes ?? []).map((m) => {
              const badge = STATUS_BADGE[m.status]
              return (
                <div
                  key={m.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-sm py-1 ${m.status === 'disabled' ? 'opacity-50' : ''}`}
                >
                  <span className="font-medium text-slate-700">{m.name}</span>
                  <span className="text-xs text-slate-400">{m.companyLabel}</span>
                  <span className="text-xs text-slate-400">{m.emailAddress ?? '— ยังไม่ผูกอีเมล —'}</span>
                  <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    {m.status === 'connected' && (
                      <span className="text-[11px] text-slate-400">
                        {m.lastSyncAt ? `sync ${timeLabel(m.lastSyncAt)}` : 'รอ sync แรก'}
                      </span>
                    )}
                    {m.status === 'connected' && (
                      <button
                        onClick={() => void syncNow(m)}
                        disabled={syncingId === m.id}
                        className="flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 disabled:opacity-40 font-medium"
                      >
                        <RefreshCw className={`w-3 h-3 ${syncingId === m.id ? 'animate-spin' : ''}`} />
                        sync
                      </button>
                    )}
                    {m.status !== 'disabled' && (
                      <a
                        href={`/api/inbox/mailboxes/${m.id}/connect`}
                        className="text-[11px] text-brand-600 hover:text-brand-700 font-medium"
                      >
                        {m.status === 'connected' ? 'เชื่อมใหม่' : 'เชื่อม Gmail'}
                      </a>
                    )}
                    <button
                      onClick={() => void toggleBox(m)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 underline"
                    >
                      {m.status === 'disabled' ? 'เปิดใช้งาน' : 'ปิดการใช้งาน'}
                    </button>
                  </span>
                  {m.lastError && (
                    <div className="w-full text-[11px] text-rose-600">sync ติดปัญหา: {m.lastError}</div>
                  )}
                </div>
              )
            })}
          </div>

          <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">
            เชื่อมด้วยสิทธิ์ Gmail แบบ read/labels/send (scope เดียว: gmail.modify) · token
            เข้ารหัสเก็บในระบบ · เปลี่ยนรหัสผ่านบัญชีกล่อง = ต้องกดเชื่อมใหม่
          </p>
        </div>
      )}
    </div>
  )
}
