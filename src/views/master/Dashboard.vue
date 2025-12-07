<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import api from '../../api';
import WebApp from '@twa-dev/sdk';

const router = useRouter();
const appointments = ref<any[]>([]);
const user = ref<any>(null);
const loading = ref(true);
const copied = ref(false);
const processingId = ref<number | null>(null);

// Выбранная дата для фильтрации
const selectedDate = ref<string | null>(null); // null = показать все

// Генерация 14 дней для выбора
const calendarDays = computed(() => {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Считаем записи на этот день
    const count = appointments.value.filter(a => {
      const apptDate = new Date(a.startTime).toISOString().split('T')[0];
      return apptDate === dateStr;
    }).length;
    
    days.push({
      date: dateStr,
      day: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
      num: date.getDate(),
      month: date.toLocaleDateString('ru-RU', { month: 'short' }),
      isToday: i === 0,
      count
    });
  }
  return days;
});

// Фильтрованные записи по выбранной дате
const filteredAppointments = computed(() => {
  if (!selectedDate.value) {
    return appointments.value;
  }
  return appointments.value.filter(a => {
    const apptDate = new Date(a.startTime).toISOString().split('T')[0];
    return apptDate === selectedDate.value;
  });
});

// Записи на сегодня (для статистики)
const todayAppointments = computed(() => {
  const today = new Date().toISOString().split('T')[0];
  return appointments.value.filter(a => {
    const apptDate = new Date(a.startTime).toISOString().split('T')[0];
    return apptDate === today;
  });
});

const bookingLink = computed(() => {
  if (!user.value) return '';
  const botUsername = import.meta.env.VITE_BOT_USERNAME || 'your_bot';
  return `https://t.me/${botUsername}?startapp=book_${user.value.id}`;
});

const copyLink = async () => {
  await navigator.clipboard.writeText(bookingLink.value);
  copied.value = true;
  try {
    WebApp.HapticFeedback.notificationOccurred('success');
  } catch {}
  setTimeout(() => copied.value = false, 2000);
};

const shareLink = () => {
  try {
    WebApp.switchInlineQuery(bookingLink.value, ['users', 'groups', 'channels']);
  } catch {
    copyLink();
  }
};

const formatTime = (date: string) => {
  return new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'confirmed': return 'bg-success/15 text-success';
    case 'pending': return 'bg-warning/15 text-warning';
    case 'cancelled': return 'bg-danger/15 text-danger';
    default: return 'bg-tg-hint/15 text-tg-hint';
  }
};

const getStatusText = (status: string) => {
  switch (status) {
    case 'confirmed': return 'Подтверждено';
    case 'pending': return 'Ожидает';
    case 'cancelled': return 'Отменено';
    case 'completed': return 'Завершено';
    default: return status;
  }
};

// Подсчёт ожидающих записей
const pendingCount = computed(() => {
  return appointments.value.filter(a => a.status === 'pending').length;
});

// Подтверждение записи
const confirmAppointment = async (id: number) => {
  processingId.value = id;
  try {
    await api.patch(`/appointments/${id}/confirm`);
    const appt = appointments.value.find(a => a.id === id);
    if (appt) appt.status = 'confirmed';
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
  } catch (e: any) {
    alert(e.response?.data?.error || 'Ошибка подтверждения');
  } finally {
    processingId.value = null;
  }
};

// Отклонение записи
const rejectAppointment = async (id: number) => {
  const confirmed = confirm('Отклонить запись? Клиент получит уведомление.');
  if (!confirmed) return;
  
  processingId.value = id;
  try {
    await api.patch(`/appointments/${id}/reject`);
    const appt = appointments.value.find(a => a.id === id);
    if (appt) appt.status = 'cancelled';
    try {
      WebApp.HapticFeedback.notificationOccurred('warning');
    } catch {}
  } catch (e: any) {
    alert(e.response?.data?.error || 'Ошибка отклонения');
  } finally {
    processingId.value = null;
  }
};

const selectDay = (date: string | null | undefined) => {
  // Если кликнули на уже выбранный день — сбрасываем фильтр
  if (selectedDate.value === date) {
    selectedDate.value = null;
  } else {
    selectedDate.value = date ?? null;
  }
  try {
    WebApp.HapticFeedback.selectionChanged();
  } catch {}
};

// Форматирование заголовка списка
const listTitle = computed(() => {
  if (!selectedDate.value) return 'Все записи';
  
  const today = new Date().toISOString().split('T')[0];
  if (selectedDate.value === today) return 'Сегодня';
  
  const date = new Date(selectedDate.value);
  return date.toLocaleDateString('ru-RU', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  });
});

onMounted(async () => {
  try {
    const authRes = await api.post('/auth/login', { initData: WebApp.initData || '' });
    user.value = authRes.data.user;

    const res = await api.get('/appointments');
    appointments.value = res.data;
    
    try {
      WebApp.MainButton.setText('⚙️ Настройки');
      WebApp.MainButton.onClick(() => router.push('/master/profile'));
      WebApp.MainButton.show();
    } catch {}
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
      <h1 class="text-2xl font-bold mb-1">
        Привет, <span class="gradient-text">{{ user?.firstName || 'Мастер' }}</span> 👋
      </h1>
      <p class="text-tg-hint text-sm">Управляйте записями и услугами</p>
    </div>

    <!-- Quick Stats -->
    <div class="grid grid-cols-3 gap-3 mb-6">
      <div class="card">
        <div class="text-2xl font-bold text-accent">{{ todayAppointments.length }}</div>
        <div class="text-xs text-tg-hint mt-1">Сегодня</div>
      </div>
      <div class="card">
        <div class="text-2xl font-bold text-warning">{{ pendingCount }}</div>
        <div class="text-xs text-tg-hint mt-1">Ожидают</div>
      </div>
      <div class="card">
        <div class="text-2xl font-bold text-tg-text">{{ appointments.length }}</div>
        <div class="text-xs text-tg-hint mt-1">Всего</div>
      </div>
    </div>

    <!-- Share Link Card -->
    <div v-if="user" class="card mb-6">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
          <svg class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </div>
        <div class="flex-1">
          <div class="font-semibold text-sm">Ссылка для клиентов</div>
          <div class="text-xs text-tg-hint">Отправьте клиентам для записи</div>
        </div>
      </div>
      
      <div class="flex gap-2">
        <button 
          @click="copyLink" 
          class="flex-1 btn text-sm py-2.5 min-w-0"
          :class="copied ? 'bg-success/15 text-success' : 'btn-secondary'"
        >
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path v-if="!copied" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          {{ copied ? 'Готово' : 'Копировать' }}
        </button>
        <button @click="shareLink" class="flex-1 btn btn-primary text-sm py-2.5 min-w-0">
          <svg class="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
          Отправить
        </button>
      </div>
    </div>

    <!-- Navigation -->
    <router-link 
      to="/master/profile" 
      class="card flex items-center gap-3 mb-6 active:scale-[0.98] transition-transform"
    >
      <div class="w-10 h-10 rounded-xl bg-tg-bg flex items-center justify-center">
        <svg class="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <div class="flex-1">
        <div class="font-medium">Настройки</div>
        <div class="text-xs text-tg-hint">Услуги, расписание</div>
      </div>
      <svg class="w-5 h-5 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    </router-link>

    <!-- Calendar Strip -->
    <div class="mb-6">
      <div class="flex items-center justify-between mb-3">
        <label class="text-sm font-semibold">Расписание</label>
        <button 
          v-if="selectedDate"
          @click="selectDay(null)"
          class="text-xs text-accent font-medium"
        >
          Показать все
        </button>
      </div>
      <div class="overflow-x-auto -mx-4 px-4">
        <div class="flex gap-2 pt-2 pb-2">
          <button 
            v-for="d in calendarDays" 
            :key="d.date"
            @click="selectDay(d.date)"
            class="flex-shrink-0 w-14 py-2 rounded-xl text-center transition-all relative"
            :class="selectedDate === d.date 
              ? 'bg-accent text-white' 
              : (d.isToday && selectedDate !== null)
                ? 'bg-accent/15 text-accent' 
                : 'bg-tg-secondary-bg'"
          >
            <div class="text-xs opacity-70">{{ d.day }}</div>
            <div class="text-lg font-bold">{{ d.num }}</div>
            
            <!-- Индикатор записей -->
            <div 
              v-if="d.count > 0" 
              class="absolute -top-1.5 -right-1 min-w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
              :class="selectedDate === d.date 
                ? 'bg-white text-accent' 
                : 'bg-accent text-white'"
            >
              {{ d.count > 9 ? '9+' : d.count }}
            </div>
          </button>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-10">
      <div class="spinner mx-auto mb-3"></div>
      <p class="text-tg-hint text-sm">Загрузка записей...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="filteredAppointments.length === 0" class="text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-tg-secondary-bg flex items-center justify-center">
        <svg class="w-8 h-8 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 class="font-semibold mb-1">
        {{ selectedDate ? 'Нет записей на этот день' : 'Записей пока нет' }}
      </h3>
      <p class="text-tg-hint text-sm">
        {{ selectedDate ? 'Выберите другую дату' : 'Поделитесь ссылкой с клиентами!' }}
      </p>
    </div>

    <!-- Appointments List -->
    <div v-else class="space-y-4">
      <h2 class="text-sm font-semibold text-tg-hint uppercase tracking-wider capitalize">
        {{ listTitle }}
        <span class="text-accent ml-1">({{ filteredAppointments.length }})</span>
      </h2>
      
      <div class="space-y-3">
        <div 
          v-for="appt in filteredAppointments" 
          :key="appt.id" 
          class="card"
        >
          <div class="flex items-center gap-3">
            <!-- Плашка с датой/временем -->
            <div class="w-14 h-14 rounded-xl bg-accent/10 flex flex-col items-center justify-center flex-shrink-0">
              <!-- Если выбран конкретный день — показываем только время -->
              <template v-if="selectedDate">
                <span class="text-lg font-bold leading-none text-accent">{{ formatTime(appt.startTime).split(':')[0] }}</span>
                <span class="text-xs text-tg-hint">{{ formatTime(appt.startTime).split(':')[1] }}</span>
              </template>
              <!-- Если все записи — показываем дату и время -->
              <template v-else>
                <span class="text-sm font-bold leading-none text-accent">{{ new Date(appt.startTime).getDate() }} {{ new Date(appt.startTime).toLocaleDateString('ru-RU', { month: 'short' }) }}</span>
                <span class="text-xs text-tg-hint mt-0.5">{{ formatTime(appt.startTime) }}</span>
              </template>
            </div>
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate">{{ appt.client?.firstName || 'Клиент' }}</div>
              <div class="text-sm text-tg-hint truncate">{{ appt.service?.title }}</div>
            </div>
            <span 
              class="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
              :class="getStatusColor(appt.status)"
            >
              {{ getStatusText(appt.status) }}
            </span>
          </div>
          
          <!-- Кнопки для pending записей -->
          <div v-if="appt.status === 'pending'" class="flex gap-2 mt-3 pt-3 border-t border-tg-hint/10">
            <button 
              @click="confirmAppointment(appt.id)"
              :disabled="processingId === appt.id"
              class="flex-1 btn bg-success/15 text-success text-sm py-2"
            >
              <svg v-if="processingId === appt.id" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
              </svg>
              <span v-else>✓ Подтвердить</span>
            </button>
            <button 
              @click="rejectAppointment(appt.id)"
              :disabled="processingId === appt.id"
              class="flex-1 btn bg-danger/15 text-danger text-sm py-2"
            >
              ✕ Отклонить
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
