import axios from 'axios';
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

export default api;

