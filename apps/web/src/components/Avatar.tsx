import { useState } from 'react'

/**
 * วงกลม avatar — แสดงรูปโปรไฟล์ Google (`avatarUrl`) ถ้ามี · ไม่มี/โหลดไม่ได้ → ตัวย่อสี (fallback เดิม)
 * `className` คุมขนาด+ขนาดตัวอักษร (+ ring ถ้าต้องการ) · `colorClass` = สีพื้นตอน fallback (เช่น avatarColor(name))
 * referrerPolicy=no-referrer กัน Google (lh3.googleusercontent.com) ตอบ 403 เวลาส่ง Referer
 */
export function Avatar({
  name,
  avatarUrl,
  className = 'w-8 h-8 text-xs',
  colorClass = 'bg-divider text-soft',
}: {
  name: string
  avatarUrl?: string | null
  className?: string
  colorClass?: string
}) {
  const [failed, setFailed] = useState(false)
  const base = `${className} rounded-full shrink-0`
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${base} object-cover`}
      />
    )
  }
  return (
    <div className={`${base} grid place-items-center font-semibold ${colorClass}`} aria-label={name}>
      {name.slice(0, 2)}
    </div>
  )
}
