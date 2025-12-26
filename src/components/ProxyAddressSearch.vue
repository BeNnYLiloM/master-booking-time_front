<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import api from '../api';

interface Props {
  placeholder?: string;
  modelValue?: string; // Начальное значение адреса
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Введите адрес',
  modelValue: '',
});

const emit = defineEmits<{
  'select': [{ address: string; coordinates: [number, number] }];
  'update:modelValue': [string]; // Для двусторонней привязки
}>();

const query = ref('');
const suggestions = ref<any[]>([]);
const loading = ref(false);
const showSuggestions = ref(false);
const selectedIndex = ref(-1);
const skipSuggest = ref(false); // Флаг для пропуска запроса подсказок

// Инициализируем query из props
onMounted(() => {
  if (props.modelValue) {
    skipSuggest.value = true; // Не запрашиваем подсказки при инициализации
    query.value = props.modelValue;
  }
});

// Следим за изменениями modelValue извне
watch(() => props.modelValue, (newValue) => {
  if (newValue !== query.value) {
    skipSuggest.value = true; // Не запрашиваем подсказки при изменении извне
    query.value = newValue;
  }
});

// Дебаунс для запроса подсказок
let debounceTimer: number | null = null;

watch(query, async (newQuery) => {
  // Эмитим изменение наружу
  emit('update:modelValue', newQuery);
  
  // Если флаг установлен, пропускаем запрос подсказок
  if (skipSuggest.value) {
    skipSuggest.value = false;
    return;
  }
  
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  if (!newQuery || newQuery.length < 3) {
    suggestions.value = [];
    showSuggestions.value = false;
    return;
  }

  debounceTimer = window.setTimeout(async () => {
    await fetchSuggestions(newQuery);
  }, 300);
});

const fetchSuggestions = async (text: string) => {
  try {
    loading.value = true;
    
    const response = await api.get('/geocode/suggest', {
      params: { text },
    });

    suggestions.value = response.data.results || [];
    showSuggestions.value = suggestions.value.length > 0;
  } catch (error: any) {
    console.error('Ошибка получения подсказок:', error);
    suggestions.value = [];
    showSuggestions.value = false;
  } finally {
    loading.value = false;
  }
};

const selectSuggestion = async (suggestion: any) => {
  const address = suggestion.title.text;
  
  skipSuggest.value = true; // Не запрашиваем подсказки при выборе из списка
  query.value = address;
  showSuggestions.value = false;

  // Геокодируем выбранный адрес
  try {
    loading.value = true;
    const response = await api.get('/geocode/geocode', {
      params: { address },
    });

    emit('select', {
      address: response.data.address,
      coordinates: response.data.coordinates,
    });
  } catch (error) {
    console.error('Ошибка геокодирования:', error);
  } finally {
    loading.value = false;
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (!showSuggestions.value || suggestions.value.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = Math.min(selectedIndex.value + 1, suggestions.value.length - 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0);
  } else if (e.key === 'Enter' && selectedIndex.value >= 0) {
    e.preventDefault();
    selectSuggestion(suggestions.value[selectedIndex.value]);
  } else if (e.key === 'Escape') {
    showSuggestions.value = false;
  }
};

const handleBlur = () => {
  // Задержка чтобы успел сработать клик по подсказке
  setTimeout(() => {
    showSuggestions.value = false;
  }, 200);
};
</script>

<template>
  <div class="proxy-address-search relative">
    <input
      v-model="query"
      type="text"
      :placeholder="placeholder"
      @keydown="handleKeydown"
      @focus="showSuggestions = suggestions.length > 0"
      @blur="handleBlur"
      class="w-full px-4 py-3 rounded-lg bg-tg-secondary-bg text-tg-text border border-tg-hint/20 focus:border-accent focus:outline-none transition-colors"
    />
    
    <div v-if="loading" class="absolute right-3 top-1/2 -translate-y-1/2">
      <div class="spinner-small"></div>
    </div>

    <!-- Подсказки -->
    <div 
      v-if="showSuggestions && suggestions.length > 0" 
      class="absolute z-50 w-full mt-1 bg-tg-secondary-bg border border-tg-hint/20 rounded-lg shadow-lg max-h-60 overflow-y-auto"
    >
      <div
        v-for="(suggestion, idx) in suggestions"
        :key="idx"
        @click="selectSuggestion(suggestion)"
        :class="{
          'bg-accent text-white': idx === selectedIndex,
          'hover:bg-tg-bg': idx !== selectedIndex,
        }"
        class="px-4 py-2.5 cursor-pointer transition-colors text-sm"
      >
        <div class="font-medium break-words whitespace-normal leading-snug">
          {{ suggestion.title.text }}
        </div>
        <div v-if="suggestion.subtitle" class="text-xs opacity-70 mt-0.5 break-words whitespace-normal">
          {{ suggestion.subtitle.text }}
        </div>
      </div>
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
</style>

