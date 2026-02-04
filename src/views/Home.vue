<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import api from '../api';
import WebApp from '@twa-dev/sdk';

const router = useRouter();
const loading = ref(true);
const error = ref('');
const statusText = ref('Подключение...');

const retryAuth = () => {
  error.value = '';
  loading.value = true;
  // Перезагружаем страницу для повторной авторизации
  window.location.reload();
};

onMounted(async () => {
  // Скрываем все кнопки Telegram на главной странице (роутинг)
  try {
    WebApp.MainButton.hide();
    WebApp.BackButton.hide();
  } catch {}
  
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
    const user = response.data.user;

    // Сохраняем роль пользователя для навигационного guard
    localStorage.setItem('userRole', user.role);

    statusText.value = 'Загрузка...';
    
    // Автороутинг по роли
    if (user.role === 'master') {
      // Мастер → Dashboard
      router.replace('/master/dashboard');
    } else {
      // Клиент — проверяем есть ли start_param для записи
      const startParam = WebApp.initDataUnsafe?.start_param;
      if (startParam && startParam.startsWith('book_')) {
        const masterId = startParam.replace('book_', '');
        router.replace(`/booking/${masterId}`);
      } else {
        // Нет start_param → Мои записи
        router.replace('/client/appointments');
      }
    }
  } catch (err: any) {
    console.error(err);
    
    // Очищаем localStorage при ошибке авторизации
    localStorage.removeItem('userRole');
    
    // Формируем понятное сообщение об ошибке
    let errorMessage = 'Ошибка авторизации.';
    
    if (err.response?.status === 401 || err.response?.status === 404) {
      errorMessage = 'Не удалось авторизоваться. Пожалуйста, закройте и откройте приложение заново.';
    } else {
      errorMessage += ' ' + (err.response?.data?.error || err.message);
    }
    
    error.value = errorMessage;
    loading.value = false;
  }
});
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

    <!-- Error State -->
    <div v-else-if="error" class="text-center animate-fade-in max-w-sm">
      <div class="w-16 h-16 mx-auto mb-6 rounded-2xl bg-tg-secondary-bg flex items-center justify-center">
        <svg class="w-8 h-8 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      
      <h1 class="text-xl font-bold mb-3">MasterBook</h1>
      <p class="text-tg-hint leading-relaxed text-sm mb-6">{{ error }}</p>
      
      <!-- Кнопка повторной попытки -->
      <button 
        @click="retryAuth"
        class="btn btn-primary w-full"
      >
        🔄 Попробовать снова
      </button>
      
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
