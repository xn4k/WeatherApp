import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

createApp(App).mount('#app')
if (import.meta.env.VITE_FIREBASE_ANALYTICS_ENABLED === 'true') {
  void import('./lib/firebase').then(({ initializeFirebaseAnalytics }) =>
    initializeFirebaseAnalytics(),
  )
}

