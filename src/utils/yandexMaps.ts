// Динамическая загрузка Yandex Maps API
import * as Sentry from '@sentry/vue';
import { debugHelper } from './debugHelper';

let isLoading = false;
let isLoaded = false;
let loadCallbacks: Array<() => void> = [];

export function loadYandexMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    debugHelper.log('info', '🗺️ Загрузка Yandex Maps...');
    
    // Если уже загружен
    if (isLoaded && typeof window.ymaps !== 'undefined') {
      debugHelper.log('info', '✅ Yandex Maps уже загружен');
      resolve();
      return;
    }

    // Если уже загружается
    if (isLoading) {
      debugHelper.log('info', '⏳ Yandex Maps загружается, добавлено в очередь');
      loadCallbacks.push(resolve);
      return;
    }

    isLoading = true;

    // Получаем API ключ из .env
    const apiKey = import.meta.env.VITE_YANDEX_MAPS_KEY;
    
    debugHelper.log('info', '🔑 Проверка API ключа Yandex Maps', {
      hasKey: !!apiKey,
      keyPreview: apiKey ? `${apiKey.substring(0, 10)}...` : 'НЕ НАЙДЕН',
    });
    
    if (!apiKey) {
      const error = new Error('❌ VITE_YANDEX_MAPS_KEY не найден в .env файле!');
      debugHelper.log('error', error.message, {
        solution: 'Создайте файл client/.env с ключом VITE_YANDEX_MAPS_KEY',
      });
      
      // Отправляем в Sentry
      Sentry.captureException(error, {
        tags: { component: 'YandexMaps' },
        contexts: {
          config: {
            hasApiKey: false,
          },
        },
      });
      
      reject(error);
      return;
    }

    debugHelper.log('info', '📥 Загрузка скрипта Yandex Maps API...');

    // Создаём script тег
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`;
    script.async = true;

    script.onload = () => {
      debugHelper.log('info', '✅ Yandex Maps успешно загружен!');
      isLoaded = true;
      isLoading = false;
      resolve();
      
      // Вызываем все ожидающие колбэки
      loadCallbacks.forEach(cb => cb());
      loadCallbacks = [];
    };

    script.onerror = () => {
      isLoading = false;
      const error = new Error('❌ Не удалось загрузить Yandex Maps API');
      
      debugHelper.log('error', error.message, {
        checks: [
          '1. Правильность API ключа',
          '2. Интернет соединение',
          '3. Ключ активирован на developer.tech.yandex.ru',
        ],
      });
      
      // Отправляем в Sentry
      Sentry.captureException(error, {
        tags: { component: 'YandexMaps' },
        contexts: {
          config: {
            apiKeyPresent: true,
            scriptSrc: script.src.replace(apiKey, '***'),
          },
        },
      });
      
      reject(error);
    };

    document.head.appendChild(script);
  });
}

// Глобальный тип для window.ymaps
declare global {
  interface Window {
    ymaps: any;
  }
}

