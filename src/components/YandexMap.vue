<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';

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
let map: any = null;
let placemark: any = null;

const initMap = () => {
  if (!mapContainer.value) return;
  if (typeof window.ymaps === 'undefined') {
    console.error('Yandex Maps API not loaded');
    return;
  }

  window.ymaps.ready(() => {
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
  });
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

// Глобальный тип для window.ymaps
declare global {
  interface Window {
    ymaps: any;
  }
}
</script>

<template>
  <div 
    ref="mapContainer" 
    class="yandex-map rounded-lg overflow-hidden"
    :style="{ height: height }"
  ></div>
</template>

<style scoped>
.yandex-map {
  width: 100%;
  background: var(--tg-secondary-bg);
}
</style>

