import { expect, test } from '@playwright/test'

// CP1 gate: login + role nav (ใช้ dev-login — Google จริงทดสอบ manual ตอนได้ credentials)

test.beforeEach(async ({ page }) => {
  // กัน wrangler ยังไม่พร้อม
  await expect
    .poll(async () => (await page.request.get('/api/health')).status(), { timeout: 30_000 })
    .toBe(200)
})

test('owner login ผ่าน dev-login แล้วเห็นเมนูครบ + ตั้งค่า', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('เลือกผู้ใช้ dev').selectOption({ label: 'เมธ (owner)' })
  await page.getByRole('button', { name: 'เข้า' }).click()
  await expect(page.getByRole('link', { name: 'ภาพรวม' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'ตั้งค่า' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'ค่าตอบแทน' })).toBeVisible()
})

test('vendor ไม่เห็นเมนูตั้งค่า แต่เห็นค่าตอบแทน (ของตัวเอง)', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('เลือกผู้ใช้ dev').selectOption({ label: 'สมชาย (vendor)' })
  await page.getByRole('button', { name: 'เข้า' }).click()
  await expect(page.getByRole('link', { name: 'โปรเจกต์' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'ค่าตอบแทน' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'ตั้งค่า' })).toHaveCount(0)
})

test('ยังไม่ login เข้าหน้าใน → เด้งไป /login · logout แล้วกลับมา /login', async ({ page }) => {
  await page.goto('/projects')
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel('เลือกผู้ใช้ dev').selectOption({ label: 'ปอนด์ (member)' })
  await page.getByRole('button', { name: 'เข้า' }).click()
  await expect(page.getByRole('link', { name: 'ภาพรวม' })).toBeVisible()

  await page.getByTitle('ออกจากระบบ').click()
  await expect(page).toHaveURL(/\/login/)
})
