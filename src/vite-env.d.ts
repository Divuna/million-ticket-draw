/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_APP_URL?: string
  /** Must match Supabase Edge secret INTERNAL_FUNCTION_TOKEN for protected function invokes */
  readonly VITE_INTERNAL_FUNCTION_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    OneSignal: any;
  }
}

export {};
