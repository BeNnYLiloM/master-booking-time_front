// Динамическая загрузка Yandex Maps API
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
      console.error('VITE_YANDEX_MAPS_KEY не найден в .env');
      reject(new Error('Yandex Maps API key not found'));
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
      const error = new Error('Failed to load Yandex Maps API');
      reject(error);
      console.error(error);
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

