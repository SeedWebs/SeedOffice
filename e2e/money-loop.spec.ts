import { expect, test } from '@playwright/test'

/**
 * CP4 gate: ลูปเงิน end-to-end — login → ลงเวลา → เห็นเงินตัวเอง → owner เห็นตารางทีม
 * หมายเหตุ: "ปิดงวด" จริงพิสูจน์ใน integration test (payroll-admin.test.ts) —
 * ไม่กดใน e2e เพราะจะล็อกงวดปัจจุบันของ dev DB ในเครื่อง
 */

test.beforeEach(async ({ page }) => {
  await expect
    .poll(async () => (await page.request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200)
})

async function devLogin(page: import('@playwright/test').Page, label: string) {
  await page.request.post('/api/auth/logout') // กัน session เก่าค้าง → /login จะไม่ redirect
  await page.goto('/login')
  await page.getByLabel('เลือกผู้ใช้ dev').selectOption({ label })
  await page.getByRole('button', { name: 'เข้า' }).click()
  await expect(page.getByRole('link', { name: 'ภาพรวม' })).toBeVisible()
}

test('member ลงเวลา manual จาก task → เงินขึ้นหน้าค่าตอบแทน → ลบคืน', async ({ page }) => {
  await devLogin(page, 'ปอนด์ (member)')

  // เปิดโปรเจกต์ทรัพย์เจริญ → เปิดงาน "เชื่อม API สินค้า"
  await page.goto('/projects/p_sap')
  await page.getByText('เชื่อม API สินค้า', { exact: false }).first().click()
  await expect(page.getByText('ลงเวลาที่งานนี้')).toBeVisible()

  // ค่าตอบแทนก่อนลง
  const before = await page.request.get('/api/payroll/me').then((r) => r.json() as Promise<{ netSatang: number }>)

  // ลง manual 2 ชม.
  await page.getByRole('button', { name: '+ manual' }).click()
  await page.getByPlaceholder('ชม.').fill('2')
  await page.getByPlaceholder('โน้ต (ทำอะไร)').fill('e2e ทดสอบลูปเงิน')
  await page.getByRole('button', { name: 'บันทึกเวลา' }).click()
  await expect(page.getByText('e2e ทดสอบลูปเงิน')).toBeVisible()

  // เงินตัวเองอัปเดต: ปอนด์ ฿400/ชม. × 2 = +฿800 = +80000 สตางค์
  await page.goto('/payroll')
  await expect(page.getByText('ค่าตอบแทนของฉัน')).toBeVisible()
  const after = await page.request.get('/api/payroll/me').then((r) => r.json() as Promise<{ netSatang: number }>)
  expect(after.netSatang - before.netSatang).toBe(80_000)

  // cleanup: ลบ entry ที่เพิ่งลง (กัน dev DB สะสมขยะจาก e2e) — ยืนยันผ่าน modal ใหม่
  await page.goto('/projects/p_sap')
  await page.getByText('เชื่อม API สินค้า', { exact: false }).first().click()
  const row = page.locator('div', { hasText: 'e2e ทดสอบลูปเงิน' }).locator('button[title="ลบเวลา"]').last()
  await row.click()
  await expect(page.getByText('ลบเวลาที่ลงไว้?')).toBeVisible() // modal มี animation แทน confirm()
  await page.getByRole('button', { name: 'ลบ', exact: true }).click()
  await expect(page.getByText('e2e ทดสอบลูปเงิน')).toHaveCount(0)
})

test('owner เห็นตารางค่าตอบแทนทีม + ปุ่ม Export/ปิดงวด · member ไม่เห็นตาราง', async ({ page }) => {
  await devLogin(page, 'เมธ (owner)')
  await page.goto('/payroll')
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ปิดงวด' })).toBeVisible()
  await expect(page.getByText('เงินพิเศษ 🔒').first()).toBeVisible()

  await devLogin(page, 'ปอนด์ (member)')
  await page.goto('/payroll')
  await expect(page.getByText('สรุปเวลาของฉัน')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV' })).toHaveCount(0)
})
