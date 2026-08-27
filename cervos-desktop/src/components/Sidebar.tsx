import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import { useI18nStore, t } from '../lib/i18n'
import { LogoMark } from './Logo'

const baseNavItems = [
  { path: '/', icon: 'dashboard', key: 'nav.dashboard' },
  { path: '/pos', icon: 'point_of_sale', key: 'nav.pos' },
  { path: '/inventory', icon: 'inventory_2', key: 'nav.inventory' },
  { path: '/shifts', icon: 'schedule', key: 'nav.shifts' },
  { path: '/settings', icon: 'settings', key: 'nav.settings' },
  { path: '/alerts', icon: 'notifications', key: 'nav.alerts' },
]

const adminNavItems = [
  { path: '/reports', icon: 'analytics', key: 'nav.reports' },
  { path: '/users', icon: 'group', key: 'nav.users' },
  { path: '/records', icon: 'receipt_long', key: 'nav.records' },
  { path: '/marketplace', icon: 'store', key: 'nav.marketplace' },
  { path: '/subscription', icon: 'credit_card', key: 'nav.subscription' },
]

export default function Sidebar() {
  const { currentOperator, isAdmin } = useAuthStore()
  const locale = useI18nStore((s) => s.locale)

  return (
    <aside className="w-56 bg-surface-base border-r border-outline-variant flex flex-col shrink-0 overflow-hidden">
      <div className="h-14 flex items-center px-4 border-b border-outline-variant gap-2">
        <LogoMark className="shrink-0" />
        <span className="font-headline font-black text-lg text-on-surface">
          Cervos
        </span>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto min-h-0 scrollbar-thin [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-outline-variant [&::-webkit-scrollbar-thumb]:rounded-full">
        {baseNavItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) =>
              `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:bg-outline-variant/50'
              }`
            }
          >
            <span className="material-symbols-outlined text-xl">
              {item.icon}
            </span>
            {t(item.key)}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="my-3 border-t border-outline-variant" />
            {adminNavItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary text-on-primary'
                      : 'text-on-surface-variant hover:bg-outline-variant/50'
                  }`
                }
              >
                <span className="material-symbols-outlined text-xl">
                  {item.icon}
                </span>
                {t(item.key)}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {currentOperator && (
        <div className="p-3 border-t border-outline-variant shrink-0 bg-surface-base">
          <div className="bg-primary/10 rounded-lg p-3">
            <p className="text-xs font-semibold text-primary truncate">{currentOperator.name}</p>
            <p className="text-xs text-on-surface-variant mt-0.5 capitalize">{currentOperator.role}</p>
          </div>
        </div>
      )}
    </aside>
  )
}
