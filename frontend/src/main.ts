import { createApp } from 'vue'
import App from './App.vue'
import { initializeFirebaseAnalytics } from './lib/firebase'
import './styles.css'

createApp(App).mount('#app')
void initializeFirebaseAnalytics()

