import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Operator } from '../types'

export interface Permissions {
  canEditInventory: boolean
  canViewReports: boolean
  canViewTelemetry: boolean
  canViewManage: boolean
  canViewReceipts: boolean
  canEditSettings: boolean
  canViewMarket: boolean
  canViewAlerts: boolean
  canViewInventoryDetail: boolean
}

interface AuthState {
  currentOperator: Operator | null
  isAuthenticated: boolean
  isLoading: boolean
  isAdmin: boolean
  permissions: Permissions
  setOperator: (operator: Operator | null) => void
  setLoading: (loading: boolean) => void
  logout: () => void
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
}

function computePermissions(operator: Operator | null): Permissions {
  const isAdmin = operator?.role === 'admin'
  const isAuthenticated = operator !== null
  return {
    canEditInventory: isAdmin,
    canViewReports: isAdmin,
    canViewTelemetry: isAdmin,
    canViewManage: isAdmin,
    canViewReceipts: isAdmin,
    canEditSettings: isAdmin,
    canViewMarket: isAuthenticated,
    canViewAlerts: isAuthenticated,
    canViewInventoryDetail: isAuthenticated,
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      currentOperator: null,
      isAuthenticated: false,
      isLoading: true,
      isAdmin: false,
      permissions: {
        canEditInventory: false,
        canViewReports: false,
        canViewTelemetry: false,
        canViewManage: false,
        canViewReceipts: false,
        canEditSettings: false,
        canViewMarket: false,
        canViewAlerts: false,
        canViewInventoryDetail: false,
      },
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setOperator: (operator) =>
        set({
          currentOperator: operator,
          isAuthenticated: !!operator,
          isLoading: false,
          isAdmin: operator?.role === 'admin',
          permissions: computePermissions(operator),
        }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () =>
        set({
          currentOperator: null,
          isAuthenticated: false,
          isLoading: false,
          isAdmin: false,
          permissions: computePermissions(null),
        }),
    }),
    {
      name: 'cervos-pharmacy-storage',
      partialize: (state) => ({
        currentOperator: state.currentOperator,
        isAuthenticated: state.isAuthenticated,
        isAdmin: state.isAdmin,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)

interface UIState {
  sidebarCollapsed: boolean
  notificationsOpen: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setNotificationsOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarCollapsed: false,
  notificationsOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setNotificationsOpen: (notificationsOpen) => set({ notificationsOpen }),
}))

interface SyncState {
  blocked: boolean
  blockReason: string | null
  lastSyncAt: string | null
  isSyncing: boolean
  pending: number
  setBlocked: (blocked: boolean, reason?: string | null) => void
  setLastSyncAt: (at: string | null) => void
  setSyncing: (syncing: boolean) => void
  setPending: (pending: number) => void
}

export const useSyncStore = create<SyncState>()((set) => ({
  blocked: false,
  blockReason: null,
  lastSyncAt: null,
  isSyncing: false,
  pending: 0,
  setBlocked: (blocked, reason = null) => set({ blocked, blockReason: reason }),
  setLastSyncAt: (at) => set({ lastSyncAt: at }),
  setSyncing: (syncing) => set({ isSyncing: syncing }),
  setPending: (pending) => set({ pending }),
}))
