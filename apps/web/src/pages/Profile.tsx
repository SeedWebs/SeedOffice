import { useState, type ChangeEvent } from 'react'
import { AccessTokens } from '../components/AccessTokens'
import { PageHeader } from '../components/PageHeader'
import { api } from '../lib/api'
import { useAuth, type Me } from '../lib/auth'

/** โปรไฟล์ตัวเอง — แก้ ชื่อจริง/นามสกุล/ชื่อเล่น + (owner/member) จัดการ Access Tokens (SPEC §4.1, §4.18) */
const ROLE_LABEL: Record<Me['role'], string> = {
  owner: 'เจ้าของ',
  member: 'พนักงาน',
  vendor: 'ผู้รับจ้าง',
}

export function ProfilePage() {
  const { user, refresh } = useAuth()
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    nickname: user?.nickname ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  if (!user) return null

  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      await api.patch('/api/me', form)
      await refresh()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  const field = (label: string, k: keyof typeof form) => (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <input value={form[k]} onChange={set(k)} className="mt-1 w-full text-sm bg-white shadow-xs rounded-lg px-3 py-2" />
    </label>
  )

  const canToken = user.role === 'owner' || user.role === 'member'

  return (
    <>
      <PageHeader title="โปรไฟล์" />
      <div className="max-w-3xl space-y-5 p-3 sm:p-6">
        <div className="bg-white rounded-lg shadow-xs overflow-hidden">
          <div className="p-5 border-b border-border-subtle">
            <div className="font-semibold text-ink">ข้อมูลส่วนตัว</div>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-base font-semibold shrink-0">
                {user.name.slice(0, 2)}
              </div>
              <div className="text-sm min-w-0">
                <div className="font-medium text-strong truncate">{user.name}</div>
                <div className="text-muted truncate">
                  {user.email} · {ROLE_LABEL[user.role]}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {field('ชื่อจริง', 'firstName')}
              {field('นามสกุล', 'lastName')}
            </div>
            {field('ชื่อเล่น (ใช้แสดงทั้งแอป ถ้ามี)', 'nickname')}

            <div className="flex items-center gap-3">
              <button
                onClick={() => void save()}
                disabled={saving}
                className="text-sm bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg"
              >
                บันทึก
              </button>
              {saved && <span className="text-sm text-success-600">บันทึกแล้ว</span>}
              {error && <span className="text-sm text-danger-600">{error}</span>}
            </div>

            <p className="text-[11px] text-muted border-t border-divider pt-3">
              อีเมล/role แก้ที่นี่ไม่ได้ — ติดต่อ owner · ชื่อที่แสดงทั้งแอป = ชื่อเล่น (ถ้ามี) ไม่งั้น “ชื่อ นามสกุล”
            </p>
          </div>
        </div>

        {canToken && <AccessTokens />}
      </div>
    </>
  )
}
