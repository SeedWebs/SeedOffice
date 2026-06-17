import { Sprout } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'

interface DevInfo {
  enabled: boolean
  users: { email: string; name: string; role: string }[]
}

export function Login() {
  const { user, loading, refresh } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [dev, setDev] = useState<DevInfo | null>(null)
  const [devEmail, setDevEmail] = useState('')
  const notAllowed = params.get('error') === 'not_allowed'

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true })
  }, [loading, user, navigate])

  useEffect(() => {
    api.get<DevInfo>('/api/auth/dev-info').then(setDev).catch(() => setDev(null))
  }, [])

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="bg-white rounded-lg shadow-xs p-8 max-w-sm w-full">
        <div className="w-12 h-12 rounded-xl bg-brand-600 grid place-items-center text-white mx-auto">
          <Sprout className="w-7 h-7" />
        </div>
        <h1 className="text-xl font-bold text-ink mt-4 text-center">SeedOffice</h1>
        <p className="text-sm text-dim mt-1 text-center">
          ระบบภายในทีม SeedWebs — งาน · เวลา · ค่าตอบแทน
        </p>

        {notAllowed && (
          <div className="mt-4 text-sm bg-danger-50 text-danger-600 rounded-lg px-3 py-2">
            อีเมลนี้ยังไม่ได้รับสิทธิ์เข้าใช้งาน — ติดต่อ owner เพื่อเพิ่มเข้าระบบ
          </div>
        )}

        <a
          href="/api/auth/google"
          className="mt-6 w-full flex items-center justify-center gap-2 bg-ink hover:bg-strong text-white text-sm font-medium py-2.5 rounded-lg"
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
            <path
              fill="currentColor"
              d="M21.35 11.1H12v2.9h5.35c-.5 2.5-2.6 3.9-5.35 3.9a6 6 0 1 1 0-12c1.5 0 2.9.55 4 1.45l2.15-2.15A9 9 0 1 0 12 21c5.2 0 8.65-3.65 8.65-8.8 0-.4-.1-.75-.3-1.1Z"
            />
          </svg>
          เข้าสู่ระบบด้วย Google
        </a>
        <p className="text-[11px] text-muted mt-3 text-center">
          สำหรับทีมงานและ vendor ที่ได้รับเชิญ
        </p>

        {dev?.enabled && (
          <div className="mt-6 border-t border-divider pt-4">
            <div className="text-[11px] font-medium text-warning-600 mb-2">
              DEV MODE — login โดยไม่ใช้ Google
            </div>
            <div className="flex gap-2">
              <select
                aria-label="เลือกผู้ใช้ dev"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                className="flex-1 text-sm border border-border-subtle rounded-lg px-2 py-2 min-w-0"
              >
                <option value="">— เลือกผู้ใช้ —</option>
                {dev.users.map((u) => (
                  <option key={u.email} value={u.email}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
              <button
                disabled={!devEmail}
                onClick={() => {
                  void api
                    .post('/api/auth/dev-login', { email: devEmail })
                    .then(() => refresh())
                }}
                className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white px-3 rounded-lg"
              >
                เข้า
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
