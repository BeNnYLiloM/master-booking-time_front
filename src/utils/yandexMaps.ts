// Динамическая загрузка Yandex Maps API
import * as Sentry from '@sentry/vue';

let isLoading = false;
let isLoaded = false;
let loadCallbacks: Array<() => void> = [];

export function loadYandexMaps(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Если уже загружен
    if (isLoaded && typeof window.ymaps !== 'undefined') {
      resolve();
      return;
    }

    // Если уже загружается
    if (isLoading) {
      loadCallbacks.push(resolve);
      return;
    }

    isLoading = true;

    // Получаем API ключ из .env
    const apiKey = import.meta.env.VITE_YANDEX_MAPS_KEY;
    
    if (!apiKey) {
      const error = new Error('VITE_YANDEX_MAPS_KEY не найден в .env файле!');
      
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

    // Создаём script тег
    const script = document.createElement('script');
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`;
    script.async = true;

    script.onload = () => {
      isLoaded = true;
      isLoading = false;
      resolve();
      
      // Вызываем все ожидающие колбэки
      loadCallbacks.forEach(cb => cb());
      loadCallbacks = [];
    };

    script.onerror = () => {
      isLoading = false;
      const error = new Error('Не удалось загрузить Yandex Maps API');
      
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

