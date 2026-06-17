/** แสดงไอคอนโปรเจกต์ตามชนิดที่เก็บใน logo (emoji เดิม | lucide | โลโก้อัปโหลด | ยังไม่ตั้ง) */
import { parseProjectLogo } from '@seedoffice/core'
import { Folder } from 'lucide-react'
import { PROJECT_ICON_MAP } from '../lib/projectIcons'

export function ProjectIcon({
  id,
  logo,
  size = 18,
  className = '',
}: {
  id: string
  logo: string | null | undefined
  size?: number
  className?: string
}) {
  const parsed = parseProjectLogo(logo)

  if (parsed.kind === 'upload') {
    // ?v=<uuid> = cache-bust อัตโนมัติเมื่ออัปโหลดใหม่ (key เปลี่ยนทุกครั้ง)
    const v = parsed.key.split('/').pop() ?? ''
    return (
      <img
        src={`/api/projects/${id}/logo?v=${encodeURIComponent(v)}`}
        alt=""
        className={`inline-block rounded object-cover align-middle ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }

  if (parsed.kind === 'lucide') {
    const Icon = PROJECT_ICON_MAP[parsed.name] ?? Folder
    return <Icon size={size} className={`inline-block align-middle text-soft ${className}`} />
  }

  if (parsed.kind === 'emoji') {
    return (
      <span className={`inline-block leading-none align-middle ${className}`} style={{ fontSize: size }}>
        {parsed.value}
      </span>
    )
  }

  // ยังไม่ตั้งไอคอน → โฟลเดอร์เทา
  return <Folder size={size} className={`inline-block align-middle text-muted ${className}`} />
}
