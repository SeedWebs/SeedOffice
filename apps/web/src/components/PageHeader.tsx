import type { ReactNode } from 'react'

/** header ต่อหน้า (h1 + action) — เลื่อนไปกับเนื้อหาตาม SPEC §4 IA · หน้าภาพรวมไม่ใช้ */
export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="h-16 bg-white border-b border-border-subtle flex items-center gap-4 px-6">
      <h1 className="text-xl font-bold text-ink">{title}</h1>
      <div className="ml-auto">{action}</div>
    </header>
  )
}
