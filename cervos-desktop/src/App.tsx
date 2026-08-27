import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from './lib/hooks'
import Shell from './components/Shell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Pos from './pages/Pos'
import Inventory from './pages/Inventory'
import Settings from './pages/Settings'
import Shifts from './pages/Shifts'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Marketplace from './pages/Marketplace'
import Subscription from './pages/Subscription'
import Onboarding from './pages/Onboarding'
import Records from './pages/Records'
import Alerts from './pages/Alerts'
import { initDb } from './lib/database'
import { queryDb } from './lib/database'
import { startAutoSync, stopAutoSync, checkSubscriptionBlocked } from './lib/sync'
import { useSyncStore } from './lib/store'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-primary-400">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { currentOperator, isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-primary-400">Loading...</div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (currentOperator?.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function OnboardingRoute() {
  const [isOnboarded, setIsOnboarded] = useState<boolean | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const check = async () => {
      try {
        await initDb()

        // Check if centre_name exists AND there's at least one operator
        const centreResult = await queryDb("SELECT value FROM app_settings WHERE key = 'centre_name'")
        if (centreResult.length === 0) {
          setIsOnboarded(false)
          return
        }

        // Centre exists - check if there's a branch_id with operators
        const branchResult = await queryDb("SELECT value FROM app_settings WHERE key = 'branch_id'")
        if (branchResult.length > 0) {
          const branchId = JSON.parse(branchResult[0].value)
          const ops = await queryDb('SELECT id FROM operators WHERE branch_id = ?', [branchId])
          if (ops.length > 0) {
            // Centre configured AND has operators - go to login
            setIsOnboarded(true)
            return
          }
        }

        // Centre exists but no operators - show onboarding to create admin
        setIsOnboarded(false)
      } catch (err) {
        console.error('OnboardingRoute check failed:', err)
        setIsOnboarded(false)
      }
    }
    check()
  }, [])

  if (isOnboarded === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-primary-400">Loading...</div>
      </div>
    )
  }

  if (isOnboarded) {
    return <Navigate to="/login" replace />
  }

  return <Onboarding onComplete={() => navigate('/login')} />
}

function AppRoutes() {
  const { isAuthenticated, isLoading } = useAuth()
  const [dbReady, setDbReady] = useState(false)
  const blocked = useSyncStore((s) => s.blocked)
  const blockReason = useSyncStore((s) => s.blockReason)

  useEffect(() => {
    initDb()
      .then(() => setDbReady(true))
      .catch((err) => {
        console.error("Database init failed:", err);
        setDbReady(true);
      });
  }, [])

  useEffect(() => {
    if (!dbReady) return
    startAutoSync()
    checkSubscriptionBlocked()
      .then((b) => useSyncStore.getState().setBlocked(b.blocked, b.reason ?? null))
      .catch(() => {})
    return () => stopAutoSync()
  }, [dbReady])

  if (!dbReady || isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-surface">
        <div className="animate-pulse text-primary-400">Loading...</div>
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/onboarding" element={<OnboardingRoute />} />
        <Route path="/" element={<ProtectedRoute><Shell /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="pos" element={<Pos />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="settings" element={<Settings />} />
          <Route path="reports" element={<AdminRoute><Reports /></AdminRoute>} />
          <Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
          <Route path="records" element={<AdminRoute><Records /></AdminRoute>} />
          <Route path="shifts" element={<Shifts />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="marketplace" element={<Marketplace />} />
          <Route path="subscription" element={<Subscription />} />
        </Route>
      </Routes>
      {blocked && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-6">
          <div className="max-w-md w-full bg-surface-base rounded-2xl shadow-xl p-8 text-center">
            <span className="material-symbols-outlined text-5xl text-error">lock</span>
            <h2 className="mt-4 font-headline text-xl font-bold text-on-surface">
              Terminal Locked
            </h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              {blockReason || "This branch has been locked by HQ or its subscription is inactive."}
            </p>
            <p className="mt-4 text-xs text-on-surface-variant">
              Contact your administrator or HQ to resolve. The app will automatically
              unlock once the status is cleared and a sync completes.
            </p>
          </div>
        </div>
      )}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
