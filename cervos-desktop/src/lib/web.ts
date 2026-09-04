const productionWebUrl =
  (import.meta.env.VITE_WEB_URL as string | undefined) ||
  (import.meta.env.VITE_APP_URL as string | undefined) ||
  'https://cervos.online'

// `tauri dev` runs the POS against the local Next server. Production bundles
// still target the configured hosted portal.
export const WEB_URL = import.meta.env.DEV
  ? ((import.meta.env.VITE_DEV_WEB_URL as string | undefined) || 'http://localhost:3000')
  : productionWebUrl
