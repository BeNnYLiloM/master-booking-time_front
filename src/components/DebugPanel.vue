<script setup lang="ts">
import { ref, computed } from 'vue';
import { debugHelper } from '../utils/debugHelper';
import WebApp from '@twa-dev/sdk';

const show = ref(false);
const logs = computed(() => debugHelper.getLogs());

const toggle = () => {
  show.value = !show.value;
  try {
    WebApp.HapticFeedback.impactOccurred('light');
  } catch {}
};

const clear = () => {
  debugHelper.clear();
  try {
    WebApp.HapticFeedback.notificationOccurred('success');
  } catch {}
};

const getLogColor = (level: string) => {
  switch (level) {
    case 'error': return 'text-red-500';
    case 'warn': return 'text-yellow-500';
    default: return 'text-blue-500';
  }
};

const getLogIcon = (level: string) => {
  switch (level) {
    case 'error': return '❌';
    case 'warn': return '⚠️';
    default: return 'ℹ️';
  }
};
</script>

<template>
  <!-- Плавающая кнопка Debug -->
  <button
    @click="toggle"
    class="fixed bottom-4 right-4 z-50 w-14 h-14 rounded-full bg-purple-600 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
  >
    <span class="text-2xl">🐛</span>
    <span v-if="logs.length > 0" class="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full text-xs flex items-center justify-center">
      {{ logs.length }}
    </span>
  </button>

  <!-- Debug Panel -->
  <transition name="slide-up">
    <div v-if="show" class="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end">
      <div class="w-full h-[80vh] bg-tg-bg rounded-t-3xl overflow-hidden flex flex-col">
        <!-- Header -->
        <div class="p-4 border-b border-tg-hint/20 flex items-center justify-between bg-purple-600 text-white">
          <div class="flex items-center gap-2">
            <span class="text-2xl">🐛</span>
            <div>
              <h3 class="font-bold">Debug Console</h3>
              <p class="text-xs opacity-80">{{ logs.length }} событий</p>
            </div>
          </div>
          <div class="flex gap-2">
            <button @click="clear" class="px-3 py-1 bg-white/20 rounded-lg text-sm hover:bg-white/30">
              🗑️ Очистить
            </button>
            <button @click="toggle" class="w-8 h-8 bg-white/20 rounded-lg hover:bg-white/30">
              ✕
            </button>
          </div>
        </div>

        <!-- Logs -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          <div v-if="logs.length === 0" class="text-center py-12 text-tg-hint">
            <div class="text-6xl mb-2">📝</div>
            <p>Пока нет логов</p>
          </div>

          <div
            v-for="(log, index) in logs"
            :key="index"
            class="p-3 rounded-lg bg-tg-secondary-bg border border-tg-hint/10"
          >
            <div class="flex items-start gap-2">
              <span class="text-lg">{{ getLogIcon(log.level) }}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span :class="['text-xs font-medium', getLogColor(log.level)]">
                    {{ log.level.toUpperCase() }}
                  </span>
                  <span class="text-xs text-tg-hint">
                    {{ log.timestamp.toLocaleTimeString('ru-RU') }}
                  </span>
                </div>
                <p class="text-sm break-words">{{ log.message }}</p>
                <pre v-if="log.details" class="mt-2 text-xs bg-black/20 p-2 rounded overflow-x-auto">{{ JSON.stringify(log.details, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </div>

        <!-- Info -->
        <div class="p-4 border-t border-tg-hint/20 bg-tg-secondary-bg">
          <p class="text-xs text-tg-hint text-center">
            💡 Все ошибки также отправляются в Sentry для анализа
          </p>
        </div>
      </div>
    </div>
  </transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(100%);
}
</style>

