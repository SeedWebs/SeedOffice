/** หน้าแก้ไขโปรเจกต์ (SPEC §4.3) — แก้ไอคอน/ชื่อ/ลูกค้า/ราคา/วันที่/สถานะ · owner+member */
import { ChevronLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ClientCombobox } from '../components/ClientCombobox'
import { IconPicker } from '../components/IconPicker'
import { api } from '../lib/api'
import { type ProjectRow } from '../lib/project-ui'
import { useLoad } from '../lib/useLoad'

interface EditableProject extends ProjectRow {
  type: 'project' | 'recurring'
}
interface StatusOpt { id: string; name: string; kind: string }

const input = 'w-full text-sm bg-white border border-border rounded-lg px-3 py-2 focus:outline-hidden focus:border-brand-400'

export function ProjectEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: project, loading } = useLoad<EditableProject>(() => api.get(`/api/projects/${id}`), [id])
  const { data: clientsRes } = useLoad<{ rows: { id: string; name: string }[] }>(() => api.get('/api/clients'))
  const clientList = clientsRes?.rows ?? []
  const { data: cfg } = useLoad<{ projectStatuses: StatusOpt[] }>(() => api.get('/api/config'))
  const statusOptions = cfg?.projectStatuses ?? []

  const [form, setForm] = useState({
    name: '', status: 'dev' as ProjectRow['status'], clientId: '', code: '',
    budgetBaht: '', startDate: '', dueDate: '', recurringPeriod: 'monthly' as 'monthly' | 'yearly',
  })
  const [logo, setLogo] = useState<string | null>(null)
  const [logoDirty, setLogoDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // เติมค่าจากโปรเจกต์ที่โหลดมา (ครั้งเดียวตอนได้ data)
  useEffect(() => {
    if (!project) return
    setForm({
      name: project.name,
      status: project.status,
      clientId: project.clientId ?? '',
      code: project.code ?? '',
      budgetBaht: project.quotedSatang != null ? String(project.quotedSatang / 100) : '',
      startDate: project.startDate ?? '',
      dueDate: project.dueDate ?? '',
      recurringPeriod: project.recurringPeriod ?? 'monthly',
    })
    setLogo(project.logo)
    setLogoDirty(false)
  }, [project])

  if (loading) return <div className="p-6 text-sm text-muted">กำลังโหลด…</div>
  if (!project) return <div className="p-6 text-sm text-muted">ไม่พบโปรเจกต์นี้</div>

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        name: form.name,
        status: form.status,
        clientId: form.clientId || null,
        code: form.code || null,
      }
      if (project.type === 'project') {
        body.quotedSatang = form.budgetBaht ? Math.round(Number(form.budgetBaht) * 100) : null
        body.startDate = form.startDate || null
        body.dueDate = form.dueDate || null
      } else {
        body.recurringPeriod = form.recurringPeriod
      }
      // logo: ส่งเฉพาะตอนเปลี่ยน lucide/เคลียร์ (อัปโหลดบันทึกที่ server แล้ว → ไม่ส่งซ้ำ)
      if (logoDirty) body.logo = logo
      await api.patch(`/api/projects/${id}`, body)
      navigate(`/projects/${id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
      setSaving(false)
    }
  }

  return (
    <div className="p-3 sm:p-6 max-w-2xl">
      <button onClick={() => navigate(`/projects/${id}`)} className="text-sm text-muted hover:text-soft flex items-center gap-1 mb-4">
        <ChevronLeft className="w-4 h-4" /> กลับไปหน้าโปรเจกต์
      </button>

      <div className="bg-white rounded-lg shadow-xs p-5 sm:p-6">
        <h2 className="font-semibold text-ink mb-5">แก้ไขโปรเจกต์</h2>

        <div className="flex items-start gap-4 mb-5">
          <div>
            <div className="text-xs font-medium text-muted mb-1.5">ไอคอน</div>
            <IconPicker
              projectId={id}
              logo={logo}
              onChange={(l) => { setLogo(l); setLogoDirty(true) }}
              onUploaded={(l) => { setLogo(l); setLogoDirty(false) }}
            />
          </div>
          <div className="flex-1">
            <div className="text-xs font-medium text-muted mb-1.5">ชื่อโปรเจกต์</div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} placeholder="ชื่อโปรเจกต์…" />
            <div className="text-[11px] text-muted mt-1.5">
              ประเภท: {project.type === 'project' ? 'งานโปรเจกต์' : 'งานต่อเนื่อง'} — เปลี่ยนประเภทไม่ได้
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <div className="text-xs font-medium text-muted mb-1.5">สถานะ</div>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={input}>
              {statusOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <div className="block">
            <div className="text-xs font-medium text-muted mb-1.5">ลูกค้า</div>
            <ClientCombobox
              clients={clientList}
              clientId={form.clientId}
              clientName=""
              onSelect={(id) => setForm({ ...form, clientId: id })}
              onClear={() => setForm({ ...form, clientId: '' })}
              allowClear
              placeholder="— ไม่ระบุ —"
            />
          </div>

          {project.type === 'project' ? (
            <>
              <label className="block">
                <div className="text-xs font-medium text-muted mb-1.5">งบประมาณ (บาท)</div>
                <input type="number" value={form.budgetBaht} onChange={(e) => setForm({ ...form, budgetBaht: e.target.value })} className={input} placeholder="0" />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-muted mb-1.5">รหัสโปรเจกต์ (code)</div>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={input} placeholder="ไม่บังคับ" maxLength={12} />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-muted mb-1.5">เริ่ม</div>
                <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className={input} />
              </label>
              <label className="block">
                <div className="text-xs font-medium text-muted mb-1.5">กำหนดส่ง</div>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} className={input} />
              </label>
            </>
          ) : (
            <>
              <label className="block">
                <div className="text-xs font-medium text-muted mb-1.5">รอบ</div>
                <select value={form.recurringPeriod} onChange={(e) => setForm({ ...form, recurringPeriod: e.target.value as 'monthly' | 'yearly' })} className={input}>
                  <option value="monthly">รายเดือน</option>
                  <option value="yearly">รายปี</option>
                </select>
              </label>
              <label className="block">
                <div className="text-xs font-medium text-muted mb-1.5">รหัสโปรเจกต์ (code)</div>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={input} placeholder="ไม่บังคับ" maxLength={12} />
              </label>
            </>
          )}
        </div>

        {error && <div className="text-xs text-danger-600 mt-4">{error}</div>}

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => navigate(`/projects/${id}`)} className="text-sm px-3 py-2 rounded-lg hover:bg-hover">ยกเลิก</button>
          <button onClick={() => void save()} disabled={!form.name || saving} className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg hover:bg-brand-700 disabled:opacity-40">
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
