import { createApp } from 'vue'
import { createPinia } from 'pinia'
import * as Sentry from '@sentry/vue'
import './style.css'
import App from './App.vue'
import router from './router'
import WebApp from '@twa-dev/sdk'

// Initialize Telegram WebApp
WebApp.ready();

const pinia = createPinia()
const app = createApp(App)

// Инициализация Sentry для Vue
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    app,
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration({ router }),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Процент отслеживаемых транзакций
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Session replay - записывает сессии пользователей для дебага
    replaysSessionSampleRate: 0.1, // 10% обычных сессий
    replaysOnErrorSampleRate: 1.0, // 100% сессий с ошибками
    
    // Дополнительные настройки
    beforeSend(event) {
      // Добавляем информацию о Telegram WebApp
      if (event.contexts) {
        event.contexts.telegram = {
          initData: WebApp.initData ? 'present' : 'missing',
          platform: WebApp.platform,
          version: WebApp.version,
        };
      }
      return event;
    },
  });
  console.log('✅ Sentry initialized (Frontend)');
} else {
  console.warn('⚠️ VITE_SENTRY_DSN not found, Sentry disabled');
}

app.use(pinia)
app.use(router)
app.mount('#app')
