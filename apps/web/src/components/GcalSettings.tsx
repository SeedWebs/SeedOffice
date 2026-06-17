import { CalendarDays, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../lib/api'
import { useLoad } from '../lib/useLoad'
import { useDialog } from './Dialog'

/**
 * ตั้งค่า → เชื่อม Google Calendar (SPEC §4.14 · E6) — owner เท่านั้น
 * อ่านอย่างเดียว (calendar.readonly) · ใช้ Google client ตัวเดียวกับอีเมลกลาง
 */

interface GcalConn {
  id: string
  googleEmail: string | null
  status: 'connected' | 'disconnected'
  lastSyncAt: string | null
  lastError: string | null
}
interface GcalClient {
  id: string
  label: string
}
interface GcalData {
  connections: GcalConn[]
  clients: GcalClient[]
}

const CALLBACK_ERROR: Record<string, string> = {
  token_exchange: 'แลก token กับ Google ไม่สำเร็จ — ลองเชื่อมใหม่',
  no_refresh_token: 'Google ไม่ส่ง refresh token — กดเชื่อมใหม่',
  calendar_scope_denied: 'ยังไม่ได้อนุญาตสิทธิ์ปฏิทิน — หน้าขอสิทธิ์ของ Google ต้องติ๊กอนุญาต',
  client_not_found: 'Client ถูกลบไปแล้ว — เพิ่ม client ที่อีเมลกลางก่อน',
}

export function GcalSettings() {
  const { data, loading, reload } = useLoad<GcalData>(() => api.get('/api/calendar-connect'))
  const { confirmDialog } = useDialog()
  const [params, setParams] = useSearchParams()
  const [clientId, setClientId] = useState('')
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const connected = params.get('gcal') === 'connected'
  const callbackError = params.get('gcal_error')
  const clearBanner = () => {
    params.delete('gcal')
    params.delete('gcal_error')
    setParams(params, { replace: true })
  }

  const clients = data?.clients ?? []
  const selectedClient = clientId || clients[0]?.id || ''

  const syncNow = async (conn: GcalConn) => {
    setSyncingId(conn.id)
    try {
      await api.post(`/api/calendar-connect/${conn.id}/sync`)
      await reload()
    } finally {
      setSyncingId(null)
    }
  }
  const disconnect = async (conn: GcalConn) => {
    if (
      !(await confirmDialog({
        title: 'ปลดการเชื่อมปฏิทิน?',
        message: `${conn.googleEmail ?? 'บัญชีนี้'} — event ที่ sync เข้ามาจะถูกลบออกจากปฏิทินทีม`,
        danger: true,
        confirmLabel: 'ปลดการเชื่อม',
      }))
    )
      return
    await api.delete(`/api/calendar-connect/${conn.id}`)
    await reload()
  }

  const timeLabel = (iso: string) =>
    new Date(iso).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bg-white rounded-lg shadow-xs overflow-hidden">
      <div className="p-5 border-b border-border-subtle flex items-center gap-2">
        <CalendarDays className="w-4 h-4 text-muted" />
        <div className="font-semibold text-ink">Google Calendar</div>
        <span className="text-xs text-muted">sync ปฏิทินเข้ามาแสดงในปฏิทินทีม (อ่านอย่างเดียว)</span>
      </div>

      {connected && (
        <div className="mx-5 mt-4 px-4 py-2.5 rounded-lg bg-success-50 text-success-700 text-sm flex items-center justify-between">
          เชื่อมปฏิทินสำเร็จ — sync รอบแรกแล้ว
          <button onClick={clearBanner} className="text-success-500 hover:text-success-700"><X className="w-4 h-4" /></button>
        </div>
      )}
      {callbackError && (
        <div className="mx-5 mt-4 px-4 py-2.5 rounded-lg bg-danger-50 text-danger-700 text-sm flex items-center justify-between">
          {CALLBACK_ERROR[callbackError] ?? `เชื่อมไม่สำเร็จ (${callbackError})`}
          <button onClick={clearBanner} className="text-danger-400 hover:text-danger-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-sm text-muted">กำลังโหลด…</div>
      ) : (
        <div className="p-5 space-y-4">
          {(data?.connections ?? []).map((conn) => (
            <div key={conn.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-medium text-body">{conn.googleEmail ?? '— บัญชี Google —'}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${conn.status === 'connected' ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700'}`}>
                {conn.status === 'connected' ? 'เชื่อมแล้ว' : 'หลุดการเชื่อมต่อ'}
              </span>
              <span className="ml-auto flex items-center gap-3">
                {conn.status === 'connected' && (
                  <>
                    <span className="text-[11px] text-muted">
                      {conn.lastSyncAt ? `sync ${timeLabel(conn.lastSyncAt)}` : 'รอ sync แรก'}
                    </span>
                    <button
                      onClick={() => void syncNow(conn)}
                      disabled={syncingId === conn.id}
                      className="flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 disabled:opacity-40 font-medium"
                    >
                      <RefreshCw className={`w-3 h-3 ${syncingId === conn.id ? 'animate-spin' : ''}`} /> sync
                    </button>
                  </>
                )}
                {conn.status === 'disconnected' && (
                  <a href={`/api/calendar-connect/connect?clientId=${conn.id}`} className="text-[11px] text-brand-600 hover:text-brand-700 font-medium">
                    เชื่อมใหม่
                  </a>
                )}
                <button onClick={() => void disconnect(conn)} className="text-[11px] text-muted hover:text-danger-600 underline">
                  ปลดการเชื่อม
                </button>
              </span>
              {conn.lastError && <div className="w-full text-[11px] text-danger-600">sync ติดปัญหา: {conn.lastError}</div>}
            </div>
          ))}

          {/* เชื่อมบัญชีใหม่ */}
          {clients.length === 0 ? (
            <div className="text-sm text-muted">
              ยังไม่มี Google client — เพิ่มที่ส่วน "อีเมลกลาง" ด้านล่างก่อน (ใช้ client ตัวเดียวกัน)
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-4">
              <select
                value={selectedClient}
                onChange={(e) => setClientId(e.target.value)}
                className="text-sm bg-white shadow-xs rounded-lg px-3 py-2"
                aria-label="เลือก Google client"
              >
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>client: {cl.label}</option>
                ))}
              </select>
              <a
                href={`/api/calendar-connect/connect?clientId=${selectedClient}`}
                className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg"
              >
                เชื่อม Google Calendar
              </a>
            </div>
          )}

          <p className="text-[11px] text-muted border-t border-divider pt-3">
            อ่านปฏิทิน primary ของบัญชีที่เชื่อม (scope calendar.readonly) · sync อัตโนมัติทุก 30 นาที ·
            event ขึ้นเป็นประเภท "ประชุม" ในปฏิทินทีม
          </p>
        </div>
      )}
    </div>
  )
}
