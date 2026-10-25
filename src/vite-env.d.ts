/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SYNC_SAME_ORIGIN?: string
  readonly VITE_IMPORT_FETCH_URL?: string
}
