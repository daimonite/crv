import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Locale = 'en' | 'sw'

const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Sidebar nav
    'nav.dashboard': 'Dashboard',
    'nav.pos': 'POS',
    'nav.inventory': 'Inventory',
    'nav.shifts': 'Shifts',
    'nav.settings': 'Settings',
    'nav.alerts': 'Alerts',
    'nav.reports': 'Reports',
    'nav.users': 'Users',
    'nav.records': 'Records',
    'nav.marketplace': 'Marketplace',
    'nav.orders': 'Orders',
    'nav.subscription': 'Subscription',

    // Settings page
    'settings.title': 'Settings',
    'settings.storeInfo': 'Store Information',
    'settings.pharmacyName': 'Pharmacy Name',
    'settings.save': 'Save',
    'settings.taxRate': 'Tax rate (%)',
    'settings.lowStock': 'Low stock threshold',
    'settings.expiryWarning': 'Expiry warning (days)',
    'settings.security': 'Security',
    'settings.securityDesc': 'Change the PIN used to sign in on this device.',
    'settings.changePin': 'Change PIN',
    'settings.cancel': 'Cancel',
    'settings.currentPin': 'Current PIN',
    'settings.newPin': 'New PIN',
    'settings.confirmPin': 'Confirm new PIN',
    'settings.savePin': 'Save PIN',
    'settings.language': 'Language',
    'settings.languageDesc': 'Choose the display language for the app.',
    'settings.english': 'English',
    'settings.swahili': 'Swahili',
    'settings.teamManagement': 'Team Management',
    'settings.addOperator': 'Add Operator',
    'settings.name': 'Name',
    'settings.pin4': 'PIN (4+ digits)',
    'settings.role': 'Role',
    'settings.operator': 'Operator',
    'settings.admin': 'Admin',
    'settings.create': 'Create',
    'settings.cloudSync': 'Cloud Sync',
    'settings.connectionStatus': 'Connection Status',
    'settings.connected': 'Connected to Supabase',
    'settings.notLinked': 'Not linked - offline only',
    'settings.linked': 'Linked',
    'settings.offline': 'Offline',
    'settings.pendingChanges': 'Pending Changes',
    'settings.changesWaiting': 'changes waiting to sync',
    'settings.lastSynced': 'Last Synced',
    'settings.syncNow': 'Sync Now',
    'settings.syncing': 'Syncing...',
    'settings.unlink': 'Unlink',
    'settings.linkAccount': 'Link your account',
    'settings.dataManagement': 'Data Management',
    'settings.exportData': 'Export Data',
    'settings.clearAll': 'Clear All Data',
    'settings.account': 'Account',
    'settings.signOut': 'Sign Out',

    // Common
    'common.lock': 'Lock the terminal',
  },
  sw: {
    // Sidebar nav
    'nav.dashboard': 'Dashibodi',
    'nav.pos': 'Duka',
    'nav.inventory': 'Hifadhi',
    'nav.shifts': 'Mishifti',
    'settings.title': 'Mipangilio',
    'nav.alerts': 'Taarifa',
    'nav.reports': 'Ripoti',
    'nav.users': 'Watumiaji',
    'nav.records': 'Rekodi',
    'nav.marketplace': 'Soko',
    'nav.orders': 'Maagizo',
    'nav.subscription': 'Usajili',

    // Settings page
    'settings.storeInfo': 'Taarifa Duka',
    'settings.pharmacyName': 'Jina la Dawa',
    'settings.save': 'Hifadhi',
    'settings.taxRate': 'Kiwango kodi (%)',
    'settings.lowStock': 'Kiwango cha chini cha hisa',
    'settings.expiryWarning': 'Onyo la kumalizika (siku)',
    'settings.security': 'Ulinzi',
    'settings.securityDesc': 'Badilisha PIN unayotumia kuingia kifaa hiki.',
    'settings.changePin': 'Badilisha PIN',
    'settings.cancel': 'Ghairi',
    'settings.currentPin': 'PIN ya sasa',
    'settings.newPin': 'PIN mpya',
    'settings.confirmPin': 'Thibitisha PIN mpya',
    'settings.savePin': 'Hifadhi PIN',
    'settings.language': 'Lugha',
    'settings.languageDesc': 'Chagua lugha ya kuonyesha programu.',
    'settings.english': 'Kiingereza',
    'settings.swahili': 'Kiswahili',
    'settings.teamManagement': 'Usimamizi wa Timu',
    'settings.addOperator': 'Ongeza Mwendeshaji',
    'settings.name': 'Jina',
    'settings.pin4': 'PIN (dijiti 4+)',
    'settings.role': 'Jukumu',
    'settings.operator': 'Mwendeshaji',
    'settings.admin': 'Msimamizi',
    'settings.create': 'Unda',
    'settings.cloudSync': 'Uanishaji wa Wingu',
    'settings.connectionStatus': 'Hali ya Muunganisho',
    'settings.connected': 'Imeunganishwa na Supabase',
    'settings.notLinked': 'Haijaunganishwa - nje ya mtandao tu',
    'settings.linked': 'Imeunganishwa',
    'settings.offline': 'Nje ya mtandao',
    'settings.pendingChanges': 'Mabadiliko Yanayosubiri',
    'settings.changesWaiting': 'mabadiliko yanakungoja kusawazishwa',
    'settings.lastSynced': 'Imesawazishwa Mwisho',
    'settings.syncNow': 'Sawazisha Sasa',
    'settings.syncing': 'Inasawazisha...',
    'settings.unlink': 'Ondoa Muunganisho',
    'settings.linkAccount': 'Unganisha akaunti yako',
    'settings.dataManagement': 'Usimamizi wa Data',
    'settings.exportData': 'Hamisha Data',
    'settings.clearAll': 'Futa Data Yote',
    'settings.account': 'Akaunti',
    'settings.signOut': 'Ondoka',

    // Common
    'common.lock': 'Funga kifaa',
  },
}

interface I18nState {
  locale: Locale
  setLocale: (locale: Locale) => void
  toggleLocale: () => void
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set) => ({
      locale: 'en',
      setLocale: (locale) => set({ locale }),
      toggleLocale: () =>
        set((state) => ({ locale: state.locale === 'en' ? 'sw' : 'en' })),
    }),
    {
      name: 'cervos-locale',
    }
  )
)

export function t(key: string): string {
  const { locale } = useI18nStore.getState()
  return translations[locale][key] ?? translations.en[key] ?? key
}
