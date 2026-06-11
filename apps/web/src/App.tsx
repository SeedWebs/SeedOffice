import type { ReactNode } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { DialogProvider } from './components/Dialog'
import { Layout } from './components/Layout'
import { AuthProvider, useAuth, type Me } from './lib/auth'
import { AdminPage } from './pages/Admin'
import { ClientDetailPage } from './pages/ClientDetail'
import { ClientsPage } from './pages/Clients'
import { DashboardPage } from './pages/Dashboard'
import { DocsPage } from './pages/Docs'
import { ExpensesPage } from './pages/Expenses'
import { InboxPage } from './pages/Inbox'
import { Login } from './pages/Login'
import { ProjectDetailPage } from './pages/ProjectDetail'
import { PayrollPage } from './pages/Payroll'
import { ProjectsPage } from './pages/Projects'

function Protected({ children, roles }: { children: ReactNode; roles?: Me['role'][] }) {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div className="min-h-dvh grid place-items-center text-sm text-slate-400">กำลังโหลด…</div>
    )
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    path: '/',
    element: (
      <Protected>
        <Layout />
      </Protected>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      {
        path: 'clients',
        element: (
          <Protected roles={['owner', 'member']}>
            <ClientsPage />
          </Protected>
        ),
      },
      {
        path: 'clients/:id',
        element: (
          <Protected roles={['owner', 'member']}>
            <ClientDetailPage />
          </Protected>
        ),
      },
      {
        path: 'docs',
        element: (
          <Protected roles={['owner', 'member']}>
            <DocsPage />
          </Protected>
        ),
      },
      {
        path: 'inbox',
        element: (
          <Protected roles={['owner', 'member']}>
            <InboxPage />
          </Protected>
        ),
      },
      { path: 'payroll', element: <PayrollPage /> },
      {
        path: 'expenses',
        element: (
          <Protected roles={['owner', 'member']}>
            <ExpensesPage />
          </Protected>
        ),
      },
      {
        path: 'admin',
        element: (
          <Protected roles={['owner']}>
            <AdminPage />
          </Protected>
        ),
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])

export function App() {
  return (
    <AuthProvider>
      <DialogProvider>
        <RouterProvider router={router} />
      </DialogProvider>
    </AuthProvider>
  )
}
