<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api';
import WebApp from '@twa-dev/sdk';

const router = useRouter();
const loading = ref(true);
const error = ref('');
const statusText = ref('Подключение...');
const showRoleSelection = ref(false);
const becomingMaster = ref(false);
const user = ref<any>(null);

onMounted(async () => {
  try {
    try {
      WebApp.expand();
    } catch (e) {
      console.warn('WebApp.expand() failed, probably not in Telegram');
    }
    
    statusText.value = 'Авторизация...';
    const initData = WebApp.initData;
    
    if (!initData && !import.meta.env.DEV) {
      error.value = 'Пожалуйста, откройте приложение через Telegram.';
      loading.value = false;
      return;
    }

    const response = await api.post('/auth/login', { initData: initData || '' });
    user.value = response.data.user;

    statusText.value = 'Загрузка данных...';
    
    if (user.value.role === 'master') {
      router.replace('/master/dashboard');
    } else {
      // Клиент — проверяем есть ли start_param для записи
      const startParam = WebApp.initDataUnsafe?.start_param;
      if (startParam && startParam.startsWith('book_')) {
        const masterId = startParam.replace('book_', '');
        router.replace(`/booking/${masterId}`);
      } else {
        // Нет start_param — показываем выбор роли
        showRoleSelection.value = true;
        loading.value = false;
      }
    }
  } catch (err: any) {
    console.error(err);
    error.value = 'Ошибка авторизации. ' + (err.response?.data?.error || err.message);
    loading.value = false;
  }
});

const becomeMaster = async () => {
  becomingMaster.value = true;
  try {
    await api.post('/auth/become-master');
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
    router.replace('/master/dashboard');
  } catch (err: any) {
    console.error(err);
    error.value = 'Ошибка при регистрации мастера. ' + (err.response?.data?.error || err.message);
    showRoleSelection.value = false;
  } finally {
    becomingMaster.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen min-h-dvh flex items-center justify-center p-6">
    <!-- Loading State -->
    <div v-if="loading" class="text-center animate-fade-in">
      <!-- Logo / Icon -->
      <div class="relative mb-8">
        <div class="w-20 h-20 mx-auto rounded-2xl bg-accent flex items-center justify-center">
          <svg class="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      </div>
      
      <!-- Spinner -->
      <div class="spinner mx-auto mb-4"></div>
      
      <!-- Status text -->
      <p class="text-tg-hint text-sm">{{ statusText }}</p>
    </div>

    <!-- Role Selection -->
    <div v-else-if="showRoleSelection" class="text-center animate-fade-in max-w-sm w-full">
      <!-- Logo -->
      <div class="w-20 h-20 mx-auto mb-6 rounded-2xl bg-accent flex items-center justify-center">
        <svg class="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      
      <h1 class="text-2xl font-bold mb-2">Добро пожаловать!</h1>
      <p class="text-tg-hint text-sm mb-8">Выберите как вы хотите использовать приложение</p>
      
      <div class="space-y-3">
        <!-- Стать мастером -->
        <button 
          @click="becomeMaster"
          :disabled="becomingMaster"
          class="w-full card text-left flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <div class="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
            <svg class="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="flex-1">
            <div class="font-semibold">Я мастер</div>
            <div class="text-xs text-tg-hint">Принимать записи от клиентов</div>
          </div>
          <svg v-if="!becomingMaster" class="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          <div v-else class="spinner w-5 h-5"></div>
        </button>
        
        <!-- Клиент — Мои записи -->
        <router-link 
          to="/client/appointments"
          class="card text-left flex items-center gap-4 active:scale-[0.98] transition-transform"
        >
          <div class="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
            <svg class="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="flex-1">
            <div class="font-semibold">Мои записи</div>
            <div class="text-xs text-tg-hint">Посмотреть и управлять записями</div>
          </div>
          <svg class="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </router-link>
      </div>
      
      <p class="text-xs text-tg-hint mt-6">
        Для записи к мастеру используйте ссылку, которую он вам отправит
      </p>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-center animate-fade-in max-w-sm">
      <div class="w-16 h-16 mx-auto mb-6 rounded-2xl bg-tg-secondary-bg flex items-center justify-center">
        <svg class="w-8 h-8 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      
      <h1 class="text-xl font-bold mb-3">MasterBook</h1>
      <p class="text-tg-hint leading-relaxed text-sm">{{ error }}</p>
      
      <!-- Dev links -->
      <div v-if="error.includes('Dev mode')" class="mt-6 space-y-3">
        <router-link 
          to="/booking/1" 
          class="block btn btn-primary"
        >
          Тест записи клиента
        </router-link>
        <router-link 
          to="/master/dashboard" 
          class="block btn btn-secondary"
        >
          Тест панели мастера
        </router-link>
      </div>
    </div>
  </div>
</template>
