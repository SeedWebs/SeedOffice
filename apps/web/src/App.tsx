import { useEffect, useState } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'

// T01 = โครง SPA + เช็คว่า web ↔ api คุยกันได้ — หน้า/route จริงเริ่มที่ T05
function Home() {
  const [apiOk, setApiOk] = useState<boolean | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json() as Promise<{ ok: boolean }>)
      .then((d) => setApiOk(d.ok))
      .catch(() => setApiOk(false))
  }, [])

  return (
    <div className="min-h-dvh grid place-items-center p-6">
      <div className="bg-white rounded-lg shadow-xs p-8 max-w-sm w-full text-center">
        <div className="w-12 h-12 rounded-xl bg-brand-600 grid place-items-center text-white text-2xl mx-auto">
          🌱
        </div>
        <h1 className="text-xl font-bold text-slate-900 mt-4">SeedOffice</h1>
        <p className="text-sm text-slate-500 mt-1">งาน → เวลา → เงิน ของทีม SeedWebs</p>
        <div className="mt-5 text-sm flex items-center justify-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              apiOk === null ? 'bg-slate-300' : apiOk ? 'bg-emerald-500' : 'bg-rose-500'
            }`}
          />
          <span className="text-slate-600">
            API {apiOk === null ? 'กำลังเช็ค…' : apiOk ? 'พร้อมใช้งาน' : 'ติดต่อไม่ได้'}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mt-4">T01 scaffold · หน้าจริงเริ่มที่ T05</p>
      </div>
    </div>
  )
}

const router = createBrowserRouter([{ path: '*', element: <Home /> }])

export function App() {
  return <RouterProvider router={router} />
}
