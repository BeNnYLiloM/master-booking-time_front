import axios from 'axios';
import * as Sentry from '@sentry/vue';
import WebApp from '@twa-dev/sdk';

const api = axios.create({
  // В dev-режиме с прокси используем /api, в продакшене - полный URL
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const initData = WebApp.initData;
  if (initData) {
    config.headers['X-Telegram-Init-Data'] = initData;
  }
  return config;
});

// Interceptor для отслеживания ошибок API в Sentry
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Отправляем ошибку в Sentry
    if (error.response) {
      // Ошибка от сервера (4xx, 5xx)
      Sentry.captureException(error, {
        contexts: {
          api: {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response.status,
            data: error.response.data,
          },
        },
      });
    } else if (error.request) {
      // Запрос отправлен, но ответа нет
      Sentry.captureException(error, {
        contexts: {
          api: {
            url: error.config?.url,
            method: error.config?.method,
            message: 'No response received',
          },
        },
      });
    } else {
      // Ошибка при настройке запроса
      Sentry.captureException(error);
    }
    
    return Promise.reject(error);
  }
);

export default api;

