import { useState, useEffect } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useUIStore, useStore } from '../lib/store'
import { useSubscription } from '../lib/hooks'
import NotificationsPanel from './NotificationsPanel'


const navItems = [
  { path: '/', icon: 'dashboard', label: 'Dashboard' },
  { path: '/catalog', icon: 'inventory_2', label: 'Catalog' },
  { path: '/orders', icon: 'shopping_cart', label: 'Orders' },
  { path: '/analytics', icon: 'analytics', label: 'Analytics' },
  { path: '/payments', icon: 'payments', label: 'Payments' },
  { path: '/logistics', icon: 'local_shipping', label: 'Logistics' },
  { path: '/marketplace', icon: 'store', label: 'Marketplace' },
  { path: '/alerts', icon: 'notifications', label: 'Alerts' },
  { path: '/settings', icon: 'settings', label: 'Settings' },
]

export default function Shell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sidebarCollapsed, toggleSidebar, notificationsOpen, setNotificationsOpen } = useUIStore()
  const { subscriptionStatus } = useSubscription()
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    const supplierId = useStore.getState().supplier?.id
    if (!supplierId) return
    import('../lib/queries').then(({ fetchNotifications }) => {
      fetchNotifications(supplierId).then((nots: any[]) => {
        setUnreadCount(nots.filter((n: any) => !n.is_read).length)
      }).catch(() => {})
    })
  }, [notificationsOpen])

  const getSubscriptionDotColor = () => {
    switch (subscriptionStatus) {
      case 'active':
        return 'bg-green-500'
      case 'trial':
        return 'bg-yellow-500'
      case 'inactive':
      case 'past_due':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="h-screen flex bg-surface">
      <aside
        className={`${
          sidebarCollapsed ? 'w-16' : 'w-64'
        } bg-surface-100 border-r border-surface-300 flex flex-col transition-all duration-200 overflow-hidden`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-surface-300">
          {!sidebarCollapsed && (
            <span className="font-display font-bold text-xl text-white">Cervos</span>
          )}
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-lg hover:bg-surface-300 transition-colors"
          >
            <span className="material-symbols-outlined text-gray-400">
              {sidebarCollapsed ? 'menu' : 'menu_open'}
            </span>
          </button>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto min-h-0 scrollbar-thin [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-surface-300 [&::-webkit-scrollbar-thumb]:rounded-full">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-accent/20 text-accent'
                    : 'text-gray-400 hover:bg-surface-300 hover:text-white'
                }`
              }
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              {!sidebarCollapsed && <span className="text-sm font-medium">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-surface-300 shrink-0 bg-surface-100">
          <NavLink
            to="/storefront"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-accent/20 text-accent"
          >
            <span className="material-symbols-outlined"> storefront</span>
            {!sidebarCollapsed && <span className="text-sm font-medium">Storefront</span>}
          </NavLink>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-surface-100 border-b border-surface-300 flex items-center justify-between px-6">
          <h1 className="text-lg font-semibold text-white capitalize">
            {location.pathname.slice(1) || 'Dashboard'}
          </h1>

          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/subscription')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-300 transition-colors"
              title="Subscription Status"
            >
              <span className={`w-2.5 h-2.5 rounded-full ${getSubscriptionDotColor()}`}></span>
              <span className="material-symbols-outlined text-gray-400">credit_card</span>
            </button>
            <button
              onClick={() => setNotificationsOpen(true)}
              className="relative p-2 rounded-lg hover:bg-surface-300 transition-colors"
            >
              <span className="material-symbols-outlined text-gray-400">notifications</span>
              {unreadCount > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>

      {notificationsOpen && <NotificationsPanel onClose={() => setNotificationsOpen(false)} />}
    </div>
  )
}
