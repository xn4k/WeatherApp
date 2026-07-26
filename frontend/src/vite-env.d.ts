/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_ANALYTICS_ENABLED?: 'true' | 'false'
  readonly VITE_WEATHER_SOURCE?: 'server' | 'direct'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
