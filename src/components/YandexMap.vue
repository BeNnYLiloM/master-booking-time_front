<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { loadYandexMaps } from '../utils/yandexMaps';

interface Props {
  coordinates: [number, number]; // [lat, lng]
  draggable?: boolean;
  zoom?: number;
  height?: string;
}

const props = withDefaults(defineProps<Props>(), {
  draggable: true,
  zoom: 16,
  height: '300px',
});

const emit = defineEmits<{
  'update:coordinates': [[number, number]];
  'address-changed': [string];
}>();

const mapContainer = ref<HTMLElement | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const debugInfo = ref<string>('Инициализация карты...');
const ymapsLoaded = ref(false);
let map: any = null;
let placemark: any = null;

const initMap = async () => {
  if (!mapContainer.value) {
    debugInfo.value = '❌ mapContainer отсутствует';
    return;
  }

  try {
    debugInfo.value = '🔄 Загрузка Yandex Maps API для карты...';
    
    // Проверяем наличие API ключа
    const apiKey = import.meta.env.VITE_YANDEX_MAPS_KEY;
    debugInfo.value = `🔑 API ключ: ${apiKey ? '✅ Есть' : '❌ Отсутствует'}`;
    
    // Загружаем API если еще не загружен
    await loadYandexMaps();
    debugInfo.value = '✅ API загружен, ждем ymaps.ready()...';
    ymapsLoaded.value = typeof window.ymaps !== 'undefined';

    window.ymaps.ready(() => {
      try {
        debugInfo.value = '🗺️ Создаем карту...';
        // Создаём карту
        map = new window.ymaps.Map(mapContainer.value, {
          center: props.coordinates,
          zoom: props.zoom,
          controls: ['zoomControl', 'searchControl'],
        });
        debugInfo.value = `✅ Карта создана! Координаты: ${props.coordinates.join(', ')}`;

        // Создаём маркер
        placemark = new window.ymaps.Placemark(
          props.coordinates,
          {},
          {
            draggable: props.draggable,
            preset: 'islands#redDotIcon',
          }
        );

        map.geoObjects.add(placemark);
        debugInfo.value = '✅ Маркер добавлен на карту';

        // Если маркер можно перетаскивать
        if (props.draggable) {
          placemark.events.add('dragend', async () => {
            const newCoords = placemark.geometry.getCoordinates();
            emit('update:coordinates', newCoords);

            // Обратное геокодирование (координаты → адрес)
            try {
              const geocoder = await window.ymaps.geocode(newCoords);
              const firstGeoObject = geocoder.geoObjects.get(0);
              const address = firstGeoObject?.getAddressLine() || '';
              emit('address-changed', address);
              debugInfo.value = `📍 Новый адрес: ${address}`;
            } catch (error) {
              console.error('Geocoding error:', error);
              debugInfo.value = '❌ Ошибка геокодирования: ' + error;
            }
          });
        }

        loading.value = false;
      } catch (err) {
        console.error('Map initialization error:', err);
        error.value = 'Ошибка инициализации карты';
        debugInfo.value = '❌ Ошибка создания карты: ' + err;
        loading.value = false;
      }
    });
  } catch (err) {
    console.error('Yandex Maps loading error:', err);
    error.value = 'Не удалось загрузить карту';
    debugInfo.value = '❌ Ошибка загрузки API: ' + err;
    loading.value = false;
  }
};

// Обновляем центр карты при изменении координат
watch(() => props.coordinates, (newCoords) => {
  if (map && placemark) {
    map.setCenter(newCoords, props.zoom, { duration: 300 });
    placemark.geometry.setCoordinates(newCoords);
  }
}, { deep: true });

onMounted(() => {
  initMap();
});

onUnmounted(() => {
  if (map) {
    map.destroy();
    map = null;
  }
});

declare global {
  interface Window {
    ymaps: any;
  }
}
</script>

<template>
  <div class="relative">
    <div 
      ref="mapContainer" 
      class="yandex-map rounded-lg overflow-hidden relative"
      :style="{ height: height }"
    >
      <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-tg-secondary-bg">
        <div class="spinner"></div>
      </div>
      <div v-if="error" class="absolute inset-0 flex items-center justify-center bg-tg-secondary-bg">
        <p class="text-tg-hint text-sm">{{ error }}</p>
      </div>
    </div>
    
    <!-- Отладочная информация -->
    <div class="mt-2 p-2 bg-tg-bg rounded text-xs font-mono text-tg-hint">
      <div>{{ debugInfo }}</div>
      <div class="mt-1">window.ymaps: {{ ymapsLoaded ? '✅ Загружен' : '❌ Не загружен' }}</div>
      <div>Координаты: {{ coordinates.join(', ') }}</div>
    </div>
  </div>
</template>

<style scoped>
.yandex-map {
  width: 100%;
  background: var(--tg-secondary-bg);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--tg-hint-color);
  border-top-color: var(--tg-theme-accent-text-color, #3390ec);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

