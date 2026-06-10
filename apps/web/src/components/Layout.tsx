import {
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sprout,
  Wallet,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { useAuth, type Me } from '../lib/auth'
import { TimerProvider, useTimer } from '../lib/timer'
import { QuickAddModal } from './QuickAdd'

/** banner เตือนชนเพดานชั่วโมง (SPEC §4.5 — เตือนบนเว็บ) */
function CapBanner() {
  const { capMessage, dismissCap } = useTimer()
  if (!capMessage) return null
  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm px-4 py-2.5 flex items-center gap-2">
      <span className="flex-1">⏰ {capMessage}</span>
      <button onClick={dismissCap} className="p-1 rounded hover:bg-amber-100" aria-label="ปิดการแจ้งเตือน">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

type Role = Me['role']

const NAV: { to: string; label: string; icon: typeof LayoutDashboard; roles: Role[] }[] = [
  { to: '/', label: 'ภาพรวม', icon: LayoutDashboard, roles: ['owner', 'member', 'vendor'] },
  { to: '/projects', label: 'โปรเจกต์', icon: FolderKanban, roles: ['owner', 'member', 'vendor'] },
  { to: '/payroll', label: 'ค่าตอบแทน', icon: Wallet, roles: ['owner', 'member', 'vendor'] },
  { to: '/admin', label: 'ตั้งค่า', icon: Settings, roles: ['owner'] },
]

interface DevInfo {
  enabled: boolean
  users: { email: string; name: string; role: Role }[]
}

/** ตัวสลับ user เฉพาะ dev (DEV_AUTH=1) — ไว้เช็ค permission แต่ละ role เหมือน role switcher ใน mockup */
function DevSwitcher({ me }: { me: Me }) {
  const [info, setInfo] = useState<DevInfo | null>(null)
  const { refresh } = useAuth()
  useEffect(() => {
    api.get<DevInfo>('/api/auth/dev-info').then(setInfo).catch(() => setInfo(null))
  }, [])
  if (!info?.enabled) return null
  return (
    <select
      aria-label="dev: สลับผู้ใช้"
      className="w-full text-[11px] text-slate-400 bg-slate-50 rounded-lg px-2 py-1.5 mt-2"
      value={me.email}
      onChange={(e) => {
        void api
          .post('/api/auth/dev-login', { email: e.target.value })
          .then(() => refresh())
      }}
    >
      {info.users.map((u) => (
        <option key={u.email} value={u.email}>
          dev: {u.name} ({u.role})
        </option>
      ))}
    </select>
  )
}

export function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [navOpen, setNavOpen] = useState(false)
  const [quickAddOpen, setQuickAddOpen] = useState(false)

  // Quick Add (N) จากทุกหน้า — เช็คจาก e.code กันแป้นไทย (SPEC §9)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = ['input', 'textarea', 'select'].includes(
        (document.activeElement?.tagName ?? '').toLowerCase(),
      )
      if (e.code === 'KeyN' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setQuickAddOpen(true)
      }
      if (e.code === 'Escape') setQuickAddOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!user) return null

  const items = NAV.filter((n) => n.roles.includes(user.role))
  const initial = user.name.slice(0, 2)

  const sidebar = (
    <aside
      className={`fixed top-0 bottom-0 right-0 z-40 transition-transform duration-200 lg:static lg:translate-x-0 lg:z-auto w-52 shrink-0 bg-white shadow-xs flex flex-col ${
        navOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
    >
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-slate-200">
        <div className="w-8 h-8 rounded-lg bg-brand-600 grid place-items-center text-white">
          <Sprout className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold text-slate-900 leading-none">SeedOffice</div>
          <div className="text-[11px] text-slate-400 mt-0.5">SeedWebs</div>
        </div>
        <button
          onClick={() => setNavOpen(false)}
          aria-label="ปิดเมนู"
          className="ml-auto lg:hidden p-1 rounded-lg text-slate-400 hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 text-sm">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => setNavOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${
                isActive
                  ? 'bg-brand-50 text-brand-700 [&_svg]:text-brand-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`
            }
          >
            <Icon className="w-[18px] h-[18px]" /> {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-200">
        <div className="flex items-center gap-2.5 px-2 py-1.5">
          <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-semibold shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-slate-800 truncate">{user.name}</div>
            <div className="text-[11px] text-slate-400 truncate capitalize">{user.role}</div>
          </div>
          <button
            onClick={() => {
              void logout().then(() => navigate('/login'))
            }}
            title="ออกจากระบบ"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
        <DevSwitcher me={user} />
      </div>
    </aside>
  )

  return (
    <TimerProvider>
      <div className="flex h-dvh overflow-hidden">
        {navOpen && (
          <div
            onClick={() => setNavOpen(false)}
            className="fixed inset-0 bg-slate-900/40 z-30 lg:hidden"
          />
        )}
        {sidebar}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="lg:hidden h-12 bg-white border-b border-slate-200 flex items-center gap-2.5 px-4 shrink-0">
            <div className="w-7 h-7 rounded-lg bg-brand-600 grid place-items-center text-white">
              <Sprout className="w-4 h-4" />
            </div>
            <div className="font-bold text-slate-900 leading-none">SeedOffice</div>
            <button
              onClick={() => setNavOpen(true)}
              aria-label="เมนู"
              className="ml-auto -mr-1 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
          <CapBanner />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
        {quickAddOpen && <QuickAddModal onClose={() => setQuickAddOpen(false)} />}
      </div>
    </TimerProvider>
  )
}
