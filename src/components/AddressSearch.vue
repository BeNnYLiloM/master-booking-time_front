<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { loadYandexMaps } from '../utils/yandexMaps';

interface Props {
  modelValue: string;
  placeholder?: string;
}

withDefaults(defineProps<Props>(), {
  placeholder: 'Введите адрес',
});

const emit = defineEmits<{
  'update:modelValue': [string];
  'select': [{ address: string; coordinates: [number, number] }];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);

let suggestView: any = null;

const initSuggest = async () => {
  if (!inputRef.value) return;

  try {
    // Загружаем API если еще не загружен
    await loadYandexMaps();

    window.ymaps.ready(() => {
      try {
        suggestView = new window.ymaps.SuggestView(inputRef.value, {
          results: 5,
          offset: [0, 5],
        });

        // Обработка выбора подсказки
        suggestView.events.add('select', async (e: any) => {
          const selectedItem = e.get('item');
          const address = selectedItem.value;
          
          emit('update:modelValue', address);

          // Геокодирование выбранного адреса
          try {
            loading.value = true;
            const geocoder = await window.ymaps.geocode(address);
            const firstGeoObject = geocoder.geoObjects.get(0);
            
            if (firstGeoObject) {
              const coordinates = firstGeoObject.geometry.getCoordinates();
              emit('select', { address, coordinates });
            }
          } catch (error) {
            console.error('Geocoding error:', error);
          } finally {
            loading.value = false;
          }
        });
      } catch (err) {
        console.error('Suggest initialization error:', err);
        error.value = 'Ошибка инициализации поиска';
      }
    });
  } catch (err) {
    console.error('Yandex Maps loading error:', err);
    error.value = 'Не удалось загрузить поиск адресов';
  }
};

const onInput = (event: Event) => {
  const value = (event.target as HTMLInputElement).value;
  emit('update:modelValue', value);
};

onMounted(() => {
  initSuggest();
});

// Глобальный тип для window.ymaps
declare global {
  interface Window {
    ymaps: any;
  }
}
</script>

<template>
  <div class="address-search relative">
    <input
      ref="inputRef"
      type="text"
      :value="modelValue"
      @input="onInput"
      :placeholder="placeholder"
      :disabled="!!error"
      class="w-full px-4 py-3 rounded-lg bg-tg-secondary-bg text-tg-text border border-tg-hint/20 focus:border-accent focus:outline-none transition-colors disabled:opacity-50"
    />
    <div v-if="loading" class="absolute right-3 top-1/2 -translate-y-1/2">
      <div class="spinner-small"></div>
    </div>
    <div v-if="error" class="mt-2 text-xs text-red-500">
      {{ error }}
    </div>
  </div>
</template>

<style scoped>
.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid var(--tg-hint-color);
  border-top-color: var(--tg-theme-accent-text-color, #3390ec);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Стили для подсказок Yandex */
:deep(.ymaps-2-1-79-suggest) {
  background: var(--tg-secondary-bg) !important;
  color: var(--tg-text-color) !important;
  border: 1px solid var(--tg-hint-color) !important;
  border-radius: 0.5rem !important;
  margin-top: 0.25rem !important;
}

:deep(.ymaps-2-1-79-suggest-item) {
  color: var(--tg-text-color) !important;
  padding: 0.5rem 1rem !important;
}

:deep(.ymaps-2-1-79-suggest-item:hover) {
  background: var(--tg-theme-accent-text-color, #3390ec) !important;
  color: white !important;
}
</style>

