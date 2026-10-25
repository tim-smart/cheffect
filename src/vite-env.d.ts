/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_SYNC_SAME_ORIGIN?: string
  readonly VITE_VERCEL?: string
}

// The Launch Handler API, which TypeScript's DOM types don't include yet
interface LaunchParams {
  readonly targetURL?: string
}

interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void
}

interface Window {
  readonly launchQueue?: LaunchQueue
}
