<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../api';
import WebApp from '@twa-dev/sdk';

const route = useRoute();
const router = useRouter();

// Получаем параметры из URL
const appointmentId = computed(() => {
  const id = route.query.appointment_id;
  return id ? parseInt(id as string) : null;
});

const loading = ref(true);
const submitting = ref(false);
const appointment = ref<any>(null);
const reviewRating = ref(5);
const reviewComment = ref('');
const error = ref<string | null>(null);
const success = ref(false);

const formatDate = (date: string) => {
  const d = new Date(date);
  return d.toLocaleDateString('ru-RU', { 
    day: 'numeric', 
    month: 'long',
    weekday: 'long'
  });
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('ru-RU', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

const submitReview = async () => {
  if (!appointmentId.value) {
    error.value = 'ID записи не указан';
    return;
  }

  submitting.value = true;
  error.value = null;

  try {
    await api.post('/reviews', {
      appointmentId: appointmentId.value,
      rating: reviewRating.value,
      comment: reviewComment.value || undefined
    });
    
    success.value = true;
    
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
    
    // Показываем успешное сообщение 2 секунды, затем закрываем приложение
    setTimeout(() => {
      try {
        WebApp.close();
      } catch {
        // Если не получилось закрыть, перенаправляем на записи
        router.push('/client/appointments');
      }
    }, 2000);
  } catch (e: any) {
    error.value = e.response?.data?.error || 'Ошибка при отправке отзыва';
    try {
      WebApp.HapticFeedback.notificationOccurred('error');
    } catch {}
  } finally {
    submitting.value = false;
  }
};

const goToAppointments = () => {
  router.push('/client/appointments');
};

onMounted(async () => {
  // Прокручиваем страницу наверх
  window.scrollTo({ top: 0, behavior: 'instant' });
  
  try {
    // Авторизация
    await api.post('/auth/login', { initData: WebApp.initData || '' });
    
    if (!appointmentId.value) {
      error.value = 'ID записи не указан в параметрах';
      loading.value = false;
      return;
    }
    
    // Получаем данные о записи
    const res = await api.get(`/appointments/${appointmentId.value}`);
    appointment.value = res.data;
    
    // Проверяем, что запись завершена
    if (appointment.value.status !== 'completed' && appointment.value.status !== 'awaiting_review') {
      error.value = 'Отзыв можно оставить только для завершённых записей';
      loading.value = false;
      return;
    }
    
    // Проверяем, не оставлен ли уже отзыв
    try {
      const canReviewRes = await api.get(`/reviews/can-leave/${appointmentId.value}`);
      if (!canReviewRes.data.canLeaveReview) {
        error.value = 'Вы уже оставили отзыв на эту запись';
        loading.value = false;
        return;
      }
    } catch (e: any) {
      console.error('Error checking review status:', e);
      error.value = 'Не удалось проверить статус отзыва';
      loading.value = false;
      return;
    }
    
  } catch (e: any) {
    console.error('Error loading appointment:', e);
    error.value = e.response?.data?.error || 'Не удалось загрузить данные о записи';
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="min-h-screen min-h-dvh bg-tg-bg p-4 pb-24">
    <!-- Loading -->
    <div v-if="loading" class="text-center py-12">
      <div class="spinner mx-auto mb-3"></div>
      <p class="text-tg-hint text-sm">Загрузка...</p>
    </div>

    <!-- Error State -->
    <div v-else-if="error && !appointment" class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-danger/15 flex items-center justify-center">
        <svg class="w-8 h-8 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <h3 class="font-semibold mb-2">{{ error }}</h3>
      <button @click="goToAppointments" class="btn btn-primary mt-4">
        Перейти к записям
      </button>
    </div>

    <!-- Success State -->
    <div v-else-if="success" class="text-center py-12 animate-fade-in">
      <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-success/15 flex items-center justify-center">
        <svg class="w-10 h-10 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 class="text-2xl font-bold mb-2">Спасибо за отзыв!</h2>
      <p class="text-tg-hint">Ваш отзыв помогает другим клиентам</p>
      <p class="text-sm text-tg-hint mt-4">Окно закроется автоматически...</p>
    </div>

    <!-- Review Form -->
    <div v-else-if="appointment" class="animate-fade-in">
      <!-- Header -->
      <div class="mb-6 text-center">
        <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-accent/15 flex items-center justify-center">
          <svg class="w-8 h-8 text-accent" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </div>
        <h1 class="text-2xl font-bold mb-2">Оставить отзыв</h1>
        <p class="text-tg-hint text-sm">Расскажите о вашем опыте</p>
      </div>

      <!-- Appointment Info Card -->
      <div class="card mb-6">
        <div class="flex items-start gap-3 mb-3">
          <!-- Avatar or Icon -->
          <div 
            v-if="appointment.master?.masterProfile?.avatarUrl"
            class="w-14 h-14 rounded-xl overflow-hidden bg-tg-bg shrink-0"
          >
            <img 
              :src="appointment.master.masterProfile.avatarUrl" 
              alt="Master avatar" 
              class="w-full h-full object-cover"
            />
          </div>
          <div 
            v-else
            class="w-14 h-14 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0"
          >
            <svg class="w-7 h-7 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          
          <div class="flex-1 min-w-0">
            <div class="font-semibold">
              {{ appointment.master?.masterProfile?.displayName || appointment.master?.firstName || 'Мастер' }}
            </div>
            <div class="text-sm text-tg-hint">
              {{ appointment.service?.title || 'Услуга' }}
            </div>
            <div class="text-sm text-tg-hint mt-1">
              {{ formatDate(appointment.startTime) }}, {{ formatTime(appointment.startTime) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Rating -->
      <div class="card mb-4">
        <label class="text-base font-semibold mb-3 block">Оцените услугу</label>
        <div class="flex gap-2 justify-center">
          <button
            v-for="star in 5"
            :key="star"
            @click="reviewRating = star"
            class="w-14 h-14 flex items-center justify-center transition-transform active:scale-90"
          >
            <svg 
              class="w-12 h-12 transition-colors"
              :class="star <= reviewRating ? 'text-accent' : 'text-tg-hint/30'"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </button>
        </div>
        <div class="text-center text-sm text-tg-hint mt-2">
          {{ reviewRating }} из 5
        </div>
      </div>

      <!-- Comment -->
      <div class="card mb-6">
        <label class="text-base font-semibold mb-3 block">
          Комментарий 
          <span class="text-sm font-normal text-tg-hint">(необязательно)</span>
        </label>
        <textarea
          v-model="reviewComment"
          placeholder="Расскажите о вашем опыте..."
          rows="5"
          class="w-full px-4 py-3 bg-tg-secondary-bg rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-accent"
        ></textarea>
        <div class="text-xs text-tg-hint mt-2">
          {{ reviewComment.length }} / 500 символов
        </div>
      </div>

      <!-- Error Message -->
      <div v-if="error" class="card bg-danger/10 border border-danger/20 mb-4">
        <div class="flex items-center gap-2 text-danger">
          <svg class="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span class="text-sm">{{ error }}</span>
        </div>
      </div>

      <!-- Submit Button -->
      <button
        @click="submitReview"
        :disabled="submitting || !!error"
        class="btn btn-primary w-full py-4 text-base font-semibold"
      >
        <svg v-if="submitting" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <span v-else>{{ error ? 'Исправьте ошибки' : 'Отправить отзыв' }}</span>
      </button>

      <!-- Cancel Link -->
      <button
        @click="goToAppointments"
        class="w-full text-center text-tg-hint text-sm mt-4 py-2"
      >
        Отмена
      </button>
    </div>
  </div>
</template>
