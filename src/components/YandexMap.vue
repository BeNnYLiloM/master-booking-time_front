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
let map: any = null;
let placemark: any = null;

const initMap = async () => {
  if (!mapContainer.value) return;

  try {
    // Загружаем API если еще не загружен
    await loadYandexMaps();

    window.ymaps.ready(() => {
      try {
        // Создаём карту
        map = new window.ymaps.Map(mapContainer.value, {
          center: props.coordinates,
          zoom: props.zoom,
          controls: ['zoomControl', 'searchControl'],
        });

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
            } catch (error) {
              console.error('Geocoding error:', error);
            }
          });
        }

        loading.value = false;
      } catch (err) {
        console.error('Map initialization error:', err);
        error.value = 'Ошибка инициализации карты';
        loading.value = false;
      }
    });
  } catch (err) {
    console.error('Yandex Maps loading error:', err);
    error.value = 'Не удалось загрузить карту';
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

