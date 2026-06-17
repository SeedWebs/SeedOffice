/**
 * เลือกลูกค้าแบบ select2 — control เดียว: คลิกเปิด → พิมพ์ค้นในลิสต์ได้
 *  - onCreate (ถ้ามี): พิมพ์ชื่อที่ยังไม่มี → แถว "➕ เพิ่ม «ชื่อ»" สร้างลูกค้าใหม่ตอน submit
 *  - allowClear/onClear: แถว "— ไม่ระบุ —"
 * ยุบ select + ช่องพิมพ์ชื่อใหม่เดิม (input เยอะไป) ให้เหลือชิ้นเดียว
 */
import { Check, ChevronDown, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface ClientLite {
  id: string
  name: string
}

export function ClientCombobox({
  clients,
  clientId,
  clientName,
  onSelect,
  onCreate,
  onClear,
  allowClear = false,
  placeholder = 'เลือกลูกค้า…',
}: {
  clients: ClientLite[]
  clientId: string
  clientName: string
  onSelect: (id: string) => void
  onCreate?: (name: string) => void
  onClear?: () => void
  allowClear?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const query = q.trim().toLowerCase()
  const filtered = clients.filter((c) => c.name.toLowerCase().includes(query))
  const exact = clients.some((c) => c.name.toLowerCase() === query)
  const canCreate = !!onCreate && query.length > 0 && !exact

  const selectedName = clientId ? (clients.find((c) => c.id === clientId)?.name ?? '') : ''
  const label = selectedName || clientName || ''

  const pick = (id: string) => {
    onSelect(id)
    setOpen(false)
    setQ('')
  }
  const create = () => {
    onCreate?.(q.trim())
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 text-sm bg-white border border-border rounded-lg px-3 py-2 text-left hover:border-muted focus:outline-hidden focus:border-brand-400"
      >
        <span className={`flex-1 truncate ${label ? 'text-strong' : 'text-muted'}`}>
          {label || placeholder}
        </span>
        {clientName && !clientId && <span className="text-[11px] text-brand-600 shrink-0">ใหม่</span>}
        <ChevronDown className="w-4 h-4 text-muted shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-2xl border border-border-subtle overflow-hidden">
          <div className="px-2.5 py-2 border-b border-divider">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.code === 'Escape') setOpen(false)
                else if (e.code === 'Enter') {
                  e.preventDefault()
                  if (filtered[0]) pick(filtered[0].id)
                  else if (canCreate) create()
                }
              }}
              placeholder="พิมพ์ค้นหา หรือชื่อลูกค้าใหม่…"
              className="w-full text-sm bg-transparent focus:outline-hidden placeholder:text-muted"
            />
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {allowClear && onClear && (
              <button
                type="button"
                onClick={() => { onClear(); setOpen(false); setQ('') }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-dim hover:bg-hover"
              >
                {!clientId && !clientName && <Check className="w-4 h-4 text-brand-600 shrink-0" />}
                <span className={!clientId && !clientName ? '' : 'pl-6'}>— ไม่ระบุ —</span>
              </button>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pick(c.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-body hover:bg-hover"
              >
                {clientId === c.id ? <Check className="w-4 h-4 text-brand-600 shrink-0" /> : <span className="w-4 shrink-0" />}
                <span className="flex-1 truncate text-left">{c.name}</span>
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onClick={create}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-brand-700 hover:bg-brand-50"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate text-left">เพิ่มลูกค้า “{q.trim()}”</span>
              </button>
            )}
            {filtered.length === 0 && !canCreate && (
              <div className="px-3 py-6 text-sm text-muted text-center">ไม่พบลูกค้า</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
