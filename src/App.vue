<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router';
import { onMounted, computed, watch } from 'vue';
import WebApp from '@twa-dev/sdk';
import DebugPanel from './components/DebugPanel.vue';
import { debugHelper } from './utils/debugHelper';

const router = useRouter();

// Показывать debug панель всегда (включая production)
const showDebug = computed(() => {
  return true; // Всегда показываем для отладки
});

// Отслеживаем изменения роута
watch(() => router.currentRoute.value.path, (newPath, oldPath) => {
  debugHelper.log('info', `[App] Роут изменился: ${oldPath} → ${newPath}`);
});

onMounted(() => {
  debugHelper.log('info', '[App] Приложение запущено');
  
  try {
    // Обработка start_param для deep link (ссылка для клиентов)
    const startParam = WebApp.initDataUnsafe?.start_param;
    if (startParam && startParam.startsWith('book_')) {
      const masterId = startParam.replace('book_', '');
      router.replace(`/booking/${masterId}`);
    }
    
    // Получаем цвета темы из Telegram и применяем к CSS
    if (WebApp.themeParams) {
      const root = document.documentElement;
      const params = WebApp.themeParams;
      
      if (params.bg_color) root.style.setProperty('--tg-theme-bg-color', params.bg_color);
      if (params.text_color) root.style.setProperty('--tg-theme-text-color', params.text_color);
      if (params.hint_color) root.style.setProperty('--tg-theme-hint-color', params.hint_color);
      if (params.link_color) root.style.setProperty('--tg-theme-link-color', params.link_color);
      if (params.button_color) root.style.setProperty('--tg-theme-button-color', params.button_color);
      if (params.button_text_color) root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
      if (params.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', params.secondary_bg_color);
    }
    
    // Слушаем изменения темы
    WebApp.onEvent('themeChanged', () => {
      const root = document.documentElement;
      const params = WebApp.themeParams;
      
      if (params.bg_color) root.style.setProperty('--tg-theme-bg-color', params.bg_color);
      if (params.text_color) root.style.setProperty('--tg-theme-text-color', params.text_color);
      if (params.hint_color) root.style.setProperty('--tg-theme-hint-color', params.hint_color);
      if (params.link_color) root.style.setProperty('--tg-theme-link-color', params.link_color);
      if (params.button_color) root.style.setProperty('--tg-theme-button-color', params.button_color);
      if (params.button_text_color) root.style.setProperty('--tg-theme-button-text-color', params.button_text_color);
      if (params.secondary_bg_color) root.style.setProperty('--tg-theme-secondary-bg-color', params.secondary_bg_color);
    });
  } catch (e) {
    console.warn('Telegram theme params not available');
  }
});
</script>

<template>
  <div class="min-h-screen min-h-dvh">
    <RouterView v-slot="{ Component, route }">
      <transition name="page" mode="out-in">
        <component :is="Component" :key="route.path" />
      </transition>
    </RouterView>
    
    <!-- Debug Panel - только в dev режиме или если в URL есть ?debug=true -->
    <DebugPanel v-if="showDebug" />
  </div>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity 0.2s ease;
}

.page-enter-from,
.page-leave-to {
  opacity: 0;
}
</style>
