/**
 * เลือกไอคอนโปรเจกต์แบบ Notion (SPEC §4.3):
 *  - แท็บ "ไอคอน": เลือกจากชุด lucide คัดสรร (ค้นไทย/อังกฤษได้) → เก็บเป็น lucide:<name> (บันทึกตอนกด "บันทึก")
 *  - แท็บ "อัปโหลดโลโก้": อัปรูปลูกค้า → POST /api/projects/:id/logo (บันทึกทันที)
 *  - ปุ่ม "ลบไอคอน": เคลียร์กลับเป็น default
 */
import { Search, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { searchIcons } from '../lib/projectIcons'
import { ProjectIcon } from './ProjectIcon'

type Tab = 'icon' | 'upload'

export function IconPicker({
  projectId,
  logo,
  onChange,
  onUploaded,
}: {
  projectId: string
  logo: string | null
  onChange: (logo: string | null) => void // lucide / เคลียร์ (บันทึกตอนกดบันทึก)
  onUploaded: (logo: string) => void // อัปโหลดแล้ว (บันทึกที่ server ทันที)
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('icon')
  const [q, setQ] = useState('')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const hits = searchIcons(q)

  const handleUpload = async (file: File) => {
    setErr('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/projects/${projectId}/logo`, { method: 'POST', body: fd })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
        throw new Error(data.message ?? data.error ?? 'อัปโหลดไม่สำเร็จ')
      }
      const updated = (await res.json()) as { logo: string | null }
      if (updated.logo) onUploaded(updated.logo)
      setOpen(false)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'อัปโหลดไม่สำเร็จ')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="เปลี่ยนไอคอน"
        className="w-16 h-16 grid place-items-center rounded-xl bg-hover border border-border-subtle hover:bg-divider hover:border-border transition"
      >
        <ProjectIcon id={projectId} logo={logo} size={36} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 z-50 w-80 bg-white rounded-xl shadow-2xl border border-border-subtle overflow-hidden">
            <div className="flex items-center border-b border-border-subtle">
              {(['icon', 'upload'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 text-sm py-2.5 font-medium ${tab === t ? 'text-brand-700 border-b-2 border-brand-600' : 'text-dim'}`}
                >
                  {t === 'icon' ? 'ไอคอน' : 'อัปโหลดโลโก้'}
                </button>
              ))}
              <button type="button" onClick={() => setOpen(false)} className="px-3 text-muted hover:text-soft">
                <X className="w-4 h-4" />
              </button>
            </div>

            {tab === 'icon' ? (
              <div>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-divider">
                  <Search className="w-4 h-4 text-muted shrink-0" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="ค้นหาไอคอน (เช่น เว็บ, ร้านค้า, shop)…"
                    className="w-full text-sm bg-transparent focus:outline-hidden placeholder:text-muted"
                  />
                </div>
                <div className="max-h-60 overflow-y-auto p-2">
                  {hits.length === 0 ? (
                    <div className="text-sm text-muted text-center py-8">ไม่พบไอคอนที่ค้น</div>
                  ) : (
                    <div className="grid grid-cols-7 gap-1">
                      {hits.map(({ name, Icon }) => (
                        <button
                          key={name}
                          type="button"
                          title={name}
                          onClick={() => {
                            onChange(`lucide:${name}`)
                            setOpen(false)
                          }}
                          className="aspect-square grid place-items-center rounded-lg text-soft hover:bg-brand-50 hover:text-brand-700"
                        >
                          <Icon size={18} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4">
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex flex-col items-center gap-2 py-6 rounded-lg border-2 border-dashed border-border-subtle text-dim hover:border-brand-300 hover:text-brand-600 disabled:opacity-50"
                >
                  <Upload className="w-6 h-6" />
                  <span className="text-sm">{uploading ? 'กำลังอัปโหลด…' : 'เลือกรูปโลโก้'}</span>
                  <span className="text-[11px] text-muted">png / jpg / webp / gif · ไม่เกิน 2MB</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/avif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) void handleUpload(f)
                    e.target.value = ''
                  }}
                />
                {err && <div className="text-xs text-danger-600 mt-2">{err}</div>}
              </div>
            )}

            <div className="border-t border-divider px-3 py-2">
              <button
                type="button"
                onClick={() => {
                  onChange(null)
                  setOpen(false)
                }}
                className="flex items-center gap-1.5 text-xs text-dim hover:text-danger-600"
              >
                <Trash2 className="w-3.5 h-3.5" /> ลบไอคอน
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
