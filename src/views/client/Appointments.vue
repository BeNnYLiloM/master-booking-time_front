<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../api';
import WebApp from '@twa-dev/sdk';

const router = useRouter();
const appointments = ref<any[]>([]);
const loading = ref(true);
const cancellingId = ref<number | null>(null);

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
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  if (d.toDateString() === today.toDateString()) {
    return 'Сегодня';
  }
  if (d.toDateString() === tomorrow.toDateString()) {
    return 'Завтра';
  }
  
  return d.toLocaleDateString('ru-RU', { 
    day: 'numeric', 
    month: 'short',
    weekday: 'short'
  });
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('ru-RU', { 
    hour: '2-digit', 
    minute: '2-digit' 
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

onMounted(async () => {
  try {
    // Авторизация
    await api.post('/auth/login', { initData: WebApp.initData || '' });
    
    // Получаем записи
    const res = await api.get('/appointments');
    appointments.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="p-4 pb-24 animate-fade-in">
    <!-- Header -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold">Мои записи</h1>
      <p class="text-tg-hint text-sm">Управляйте своими записями</p>
    </div>

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
                  {{ new Date(appt.startTime).getDate() }}
                </span>
                <span class="text-xs text-tg-hint">
                  {{ new Date(appt.startTime).toLocaleDateString('ru-RU', { month: 'short' }) }}
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
                  {{ new Date(appt.startTime).getDate() }}
                </span>
                <span class="text-xs text-tg-hint">
                  {{ new Date(appt.startTime).toLocaleDateString('ru-RU', { month: 'short' }) }}
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
              <button 
                @click="rebookAppointment(appt)"
                class="w-full btn btn-secondary text-sm py-2"
              >
                Записаться снова
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

