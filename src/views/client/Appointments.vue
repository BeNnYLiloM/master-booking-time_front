<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../api';
import WebApp from '@twa-dev/sdk';
import { favoritesService } from '../../utils/favorites';

const router = useRouter();

// Handler для BackButton
let backButtonHandler: (() => void) | null = null;

const appointments = ref<any[]>([]);
const loading = ref(true);
const cancellingId = ref<number | null>(null);
const showReviewForm = ref<number | null>(null);
const reviewRating = ref(5);
const reviewComment = ref('');
const submittingReview = ref(false);
const activeTab = ref<'appointments' | 'favorites'>('appointments');
const favoriteMasters = ref<any[]>([]);
const loadingFavorites = ref(false);

// Разделяем на предстоящие и прошедшие
const upcomingAppointments = computed(() => {
  const now = new Date();
  return appointments.value
    .filter(a => new Date(a.startTime) >= now && a.status !== 'cancelled')
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
});

const pastAppointments = computed(() => {
  const now = new Date();
  return appointments.value
    .filter(a => new Date(a.startTime) < now || a.status === 'cancelled')
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
});

const formatDate = (date: string) => {
  const d = new Date(date);
  // Получаем UTC дату записи
  const utcDateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  
  if (utcDateStr === todayStr) {
    return 'Сегодня';
  }
  if (utcDateStr === tomorrowStr) {
    return 'Завтра';
  }
  
  return d.toLocaleDateString('ru-RU', { 
    day: 'numeric', 
    month: 'short',
    weekday: 'short',
    timeZone: 'UTC'
  });
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('ru-RU', { 
    hour: '2-digit', 
    minute: '2-digit',
    timeZone: 'UTC'
  });
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'confirmed': return 'bg-success/15 text-success';
    case 'pending': return 'bg-warning/15 text-warning';
    case 'cancelled': return 'bg-danger/15 text-danger';
    case 'awaiting_review': return 'bg-info/15 text-info';
    case 'completed': return 'bg-accent/15 text-accent';
    default: return 'bg-tg-hint/15 text-tg-hint';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'confirmed': return 'Подтверждено';
    case 'pending': return 'Ожидает';
    case 'cancelled': return 'Отменено';
    case 'awaiting_review': return 'Ожидает вашего подтверждения';
    case 'completed': return 'Завершено';
    default: return status;
  }
};

const cancelAppointment = async (id: number) => {
  // Подтверждение отмены
  const confirmed = confirm('Вы уверены, что хотите отменить запись?');
  if (!confirmed) return;
  
  cancellingId.value = id;
  try {
    await api.patch(`/appointments/${id}/cancel`);
    
    // Обновляем локально
    const appt = appointments.value.find(a => a.id === id);
    if (appt) appt.status = 'cancelled';
    
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
  } catch (e: any) {
    alert(e.response?.data?.error || 'Ошибка при отмене');
    try {
      WebApp.HapticFeedback.notificationOccurred('error');
    } catch {}
  } finally {
    cancellingId.value = null;
  }
};

const rebookAppointment = (appt: any) => {
  // Переход к записи с тем же мастером
  router.push(`/booking/${appt.masterId}`);
};

const openReviewForm = (appointmentId: number) => {
  showReviewForm.value = appointmentId;
  reviewRating.value = 5;
  reviewComment.value = '';
};

const closeReviewForm = () => {
  showReviewForm.value = null;
  reviewRating.value = 5;
  reviewComment.value = '';
};

const submitReview = async (appointmentId: number) => {
  submittingReview.value = true;
  try {
    await api.post('/reviews', {
      appointmentId,
      rating: reviewRating.value,
      comment: reviewComment.value || undefined
    });
    
    closeReviewForm();
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
    
    alert('✅ Спасибо за отзыв!');
  } catch (e: any) {
    alert(e.response?.data?.error || 'Ошибка при отправке отзыва');
    try {
      WebApp.HapticFeedback.notificationOccurred('error');
    } catch {}
  } finally {
    submittingReview.value = false;
  }
};

// Проверяем роль пользователя
const user = ref<any>(null);
const isMaster = computed(() => user.value?.role === 'master');

// Загрузить избранных мастеров
const loadFavorites = async () => {
  loadingFavorites.value = true;
  try {
    const favoriteIds = favoritesService.getFavorites();
    if (favoriteIds.length === 0) {
      favoriteMasters.value = [];
      return;
    }
    
    // Загружаем данные о каждом мастере
    const mastersPromises = favoriteIds.map(async (id) => {
      try {
        const masterRes = await api.get(`/public/master/${id}`);
        const reviewsRes = await api.get(`/reviews/master/${id}`);
        return {
          ...masterRes.data,
          rating: reviewsRes.data.rating
        };
      } catch {
        return null;
      }
    });
    
    const masters = await Promise.all(mastersPromises);
    favoriteMasters.value = masters.filter(m => m !== null);
  } catch (e) {
    console.error('Failed to load favorites:', e);
  } finally {
    loadingFavorites.value = false;
  }
};

const removeFavorite = (masterId: number) => {
  favoritesService.removeFavorite(masterId);
  favoriteMasters.value = favoriteMasters.value.filter(m => m.id !== masterId);
  try {
    WebApp.HapticFeedback.notificationOccurred('success');
  } catch {}
};

const goToBooking = (masterId: number) => {
  router.push(`/booking/${masterId}`);
};

onMounted(async () => {
  // Прокручиваем страницу наверх
  window.scrollTo({ top: 0, behavior: 'instant' });
  
  try {
    // Авторизация
    const authRes = await api.post('/auth/login', { initData: WebApp.initData || '' });
    user.value = authRes.data.user;
    
    // Получаем записи
    const res = await api.get('/appointments');
    appointments.value = res.data;
    
    // Загружаем избранное
    await loadFavorites();
    
    // Проверяем query параметр review для автоматического открытия формы отзыва
    const reviewParam = router.currentRoute.value.query.review;
    console.log('[Appointments] Review param:', reviewParam);
    if (reviewParam) {
      const appointmentId = parseInt(reviewParam as string);
      console.log('[Appointments] Looking for appointment ID:', appointmentId);
      // Проверяем что такая запись есть и она завершена или ожидает отзыва
      const appt = appointments.value.find(a => a.id === appointmentId && (a.status === 'completed' || a.status === 'awaiting_review'));
      console.log('[Appointments] Found appointment:', appt);
      if (appt) {
        console.log('[Appointments] Opening review form for appointment:', appointmentId);
        openReviewForm(appointmentId);
        // Прокручиваем к форме отзыва
        setTimeout(() => {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }, 100);
        // Очищаем query параметр из URL
        router.replace({ query: {} });
      }
    }
    
    // Показываем BackButton для возврата на Dashboard
    try {
      backButtonHandler = () => router.push('/master/dashboard');
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(backButtonHandler);
    } catch {}
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

onBeforeUnmount(() => {
  try {
    if (backButtonHandler) {
      WebApp.BackButton.offClick(backButtonHandler);
      backButtonHandler = null;
    }
    WebApp.BackButton.hide();
  } catch {}
});
</script>

<template>
  <div class="p-4 pb-24 animate-fade-in">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold">Мои записи</h1>
      <p class="text-tg-hint text-sm">Управляйте своими записями</p>
    </div>
    
    <!-- Tabs -->
    <div class="flex gap-2 mb-6 bg-tg-secondary-bg p-1 rounded-xl">
      <button
        @click="activeTab = 'appointments'"
        class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all"
        :class="activeTab === 'appointments' ? 'bg-tg-bg text-accent' : 'text-tg-hint'"
      >
        📅 Записи
      </button>
      <button
        @click="activeTab = 'favorites'"
        class="flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all"
        :class="activeTab === 'favorites' ? 'bg-tg-bg text-accent' : 'text-tg-hint'"
      >
        ⭐ Избранное
        <span v-if="favoriteMasters.length > 0" class="ml-1">({{ favoriteMasters.length }})</span>
      </button>
    </div>

    <!-- Back to Master Dashboard (if user is master) -->
    <router-link 
      v-if="isMaster"
      to="/master/dashboard" 
      class="card flex items-center gap-3 mb-6 active:scale-[0.98] transition-transform"
    >
      <div class="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
        <svg class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
      </div>
      <div class="flex-1">
        <div class="font-medium">Вернуться в Dashboard мастера</div>
        <div class="text-xs text-tg-hint">Мои клиенты и услуги</div>
      </div>
      <svg class="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </router-link>

    <!-- Appointments Tab -->
    <div v-if="activeTab === 'appointments'">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-12">
        <div class="spinner mx-auto mb-3"></div>
        <p class="text-tg-hint text-sm">Загрузка записей...</p>
      </div>

      <!-- Empty State -->
      <div v-else-if="appointments.length === 0" class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-tg-secondary-bg flex items-center justify-center">
        <svg class="w-8 h-8 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 class="font-semibold mb-1">Записей пока нет</h3>
      <p class="text-tg-hint text-sm mb-6">Запишитесь к мастеру по ссылке</p>
      </div>

      <!-- Appointments List -->
      <div v-else class="space-y-6">
      <!-- Upcoming -->
      <div v-if="upcomingAppointments.length > 0">
        <h2 class="text-sm font-semibold text-tg-hint uppercase tracking-wider mb-3 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-success"></span>
          Предстоящие
          <span class="text-accent">({{ upcomingAppointments.length }})</span>
        </h2>
        
        <div class="space-y-3">
          <div 
            v-for="appt in upcomingAppointments" 
            :key="appt.id" 
            class="card"
          >
            <div class="flex items-start gap-3 mb-3">
              <!-- Date/Time Badge -->
              <div class="w-14 h-14 rounded-xl bg-accent/10 flex flex-col items-center justify-center flex-shrink-0">
                <span class="text-sm font-bold leading-none text-accent">
                  {{ new Date(appt.startTime).getUTCDate() }}
                </span>
                <span class="text-xs text-tg-hint">
                  {{ new Date(appt.startTime).toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' }) }}
                </span>
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="font-semibold truncate">{{ appt.service?.title || 'Услуга' }}</div>
                <div class="text-sm text-tg-hint">
                  {{ appt.master?.firstName || appt.master?.username || 'Мастер' }}
                </div>
                <div class="text-sm text-tg-hint flex items-center gap-1 mt-1">
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {{ formatDate(appt.startTime) }}, {{ formatTime(appt.startTime) }}
                </div>
              </div>
              
              <span 
                class="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                :class="getStatusColor(appt.status)"
              >
                {{ getStatusText(appt.status) }}
              </span>
            </div>
            
            <!-- Actions -->
            <div class="flex gap-2 pt-3 border-t border-tg-hint/10">
              <button 
                @click="cancelAppointment(appt.id)"
                :disabled="cancellingId === appt.id"
                class="flex-1 btn btn-secondary text-sm py-2 text-danger"
              >
                <svg v-if="cancellingId === appt.id" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                <span v-else>Отменить</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Past -->
      <div v-if="pastAppointments.length > 0">
        <h2 class="text-sm font-semibold text-tg-hint uppercase tracking-wider mb-3 flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-tg-hint"></span>
          Прошедшие
          <span class="text-tg-hint">({{ pastAppointments.length }})</span>
        </h2>
        
        <div class="space-y-3">
          <div 
            v-for="appt in pastAppointments" 
            :key="appt.id" 
            class="card opacity-70"
          >
            <div class="flex items-start gap-3">
              <!-- Date/Time Badge -->
              <div class="w-14 h-14 rounded-xl bg-tg-secondary-bg flex flex-col items-center justify-center flex-shrink-0">
                <span class="text-sm font-bold leading-none">
                  {{ new Date(appt.startTime).getUTCDate() }}
                </span>
                <span class="text-xs text-tg-hint">
                  {{ new Date(appt.startTime).toLocaleDateString('ru-RU', { month: 'short', timeZone: 'UTC' }) }}
                </span>
              </div>
              
              <div class="flex-1 min-w-0">
                <div class="font-semibold truncate">{{ appt.service?.title || 'Услуга' }}</div>
                <div class="text-sm text-tg-hint">
                  {{ appt.master?.firstName || appt.master?.username || 'Мастер' }}
                </div>
                <div class="text-sm text-tg-hint">
                  {{ formatDate(appt.startTime) }}, {{ formatTime(appt.startTime) }}
                </div>
              </div>
              
              <span 
                class="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
                :class="getStatusColor(appt.status)"
              >
                {{ getStatusText(appt.status) }}
              </span>
            </div>
            
            <!-- Rebook button for completed -->
            <div v-if="appt.status === 'completed' || appt.status === 'confirmed'" class="mt-3 pt-3 border-t border-tg-hint/10">
              <!-- Review already exists -->
              <div v-if="appt.review" class="text-sm text-tg-hint mb-2 flex items-center gap-2">
                <svg class="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span>Вы оставили отзыв: {{ appt.review.rating }}/5</span>
              </div>
              
              <!-- Review Form -->
              <div v-else-if="showReviewForm === appt.id" class="mb-3 space-y-3">
                <div>
                  <label class="text-sm font-medium mb-2 block">Оцените услугу</label>
                  <div class="flex gap-2">
                    <button
                      v-for="star in 5"
                      :key="star"
                      @click="reviewRating = star"
                      class="w-10 h-10 flex items-center justify-center transition-transform active:scale-90"
                    >
                      <svg 
                        class="w-8 h-8"
                        :class="star <= reviewRating ? 'text-accent' : 'text-tg-hint/30'"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  </div>
                </div>
                
                <div>
                  <label class="text-sm font-medium mb-2 block">Комментарий (необязательно)</label>
                  <textarea
                    v-model="reviewComment"
                    placeholder="Расскажите о вашем опыте..."
                    rows="3"
                    class="w-full px-3 py-2 bg-tg-secondary-bg rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
                  ></textarea>
                </div>
                
                <div class="flex gap-2">
                  <button
                    @click="submitReview(appt.id)"
                    :disabled="submittingReview"
                    class="flex-1 btn btn-primary text-sm py-2"
                  >
                    {{ submittingReview ? 'Отправка...' : 'Отправить отзыв' }}
                  </button>
                  <button
                    @click="closeReviewForm"
                    :disabled="submittingReview"
                    class="flex-1 btn btn-secondary text-sm py-2"
                  >
                    Отмена
                  </button>
                </div>
              </div>
              
              <!-- Buttons -->
              <div v-else class="flex gap-2">
                <button 
                  v-if="appt.status === 'completed' && !appt.review"
                  @click="openReviewForm(appt.id)"
                  class="flex-1 btn btn-secondary text-sm py-2"
                >
                  ⭐ Оставить отзыв
                </button>
                <button 
                  @click="rebookAppointment(appt)"
                  class="flex-1 btn btn-secondary text-sm py-2"
                >
                  Записаться снова
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
    
    <!-- Favorites Tab -->
    <div v-if="activeTab === 'favorites'">
      <!-- Loading -->
      <div v-if="loadingFavorites" class="text-center py-12">
        <div class="spinner mx-auto mb-3"></div>
        <p class="text-tg-hint text-sm">Загрузка избранных...</p>
      </div>
      
      <!-- Empty State -->
      <div v-else-if="favoriteMasters.length === 0" class="text-center py-12">
        <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-tg-secondary-bg flex items-center justify-center">
          <svg class="w-8 h-8 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>
        <h3 class="font-semibold mb-1">Нет избранных мастеров</h3>
        <p class="text-tg-hint text-sm">Добавляйте мастеров в избранное для быстрого доступа</p>
      </div>
      
      <!-- Favorites List -->
      <div v-else class="space-y-3">
        <div
          v-for="master in favoriteMasters"
          :key="master.id"
          class="card"
        >
          <div class="flex items-start gap-3">
            <!-- Avatar -->
            <div 
              v-if="master.masterProfile?.avatarUrl"
              class="w-16 h-16 rounded-xl overflow-hidden bg-tg-bg shrink-0"
            >
              <img 
                :src="master.masterProfile.avatarUrl" 
                alt="Master avatar" 
                class="w-full h-full object-cover"
              />
            </div>
            <div 
              v-else
              class="w-16 h-16 rounded-xl bg-accent/15 flex items-center justify-center shrink-0"
            >
              <svg class="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate">
                {{ master.masterProfile?.displayName || master.firstName || 'Мастер' }}
              </div>
              <div v-if="master.masterProfile?.description" class="text-sm text-tg-hint truncate">
                {{ master.masterProfile.description }}
              </div>
              
              <!-- Rating -->
              <div v-if="master.rating && master.rating.count > 0" class="flex items-center gap-1 mt-1">
                <svg class="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span class="text-sm font-semibold">{{ master.rating.average }}</span>
                <span class="text-xs text-tg-hint">({{ master.rating.count }})</span>
              </div>
            </div>
          </div>
          
          <!-- Actions -->
          <div class="flex gap-2 mt-3 pt-3 border-t border-tg-hint/10">
            <button
              @click="goToBooking(master.id)"
              class="flex-1 btn btn-primary text-sm py-2"
            >
              📅 Записаться
            </button>
            <button
              @click="removeFavorite(master.id)"
              class="btn btn-secondary text-sm py-2 px-4"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

