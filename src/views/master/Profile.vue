<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import api from '../../api';
import WebApp from '@twa-dev/sdk';
import { useRouter } from 'vue-router';

const router = useRouter();
const profile = ref({
  displayName: '',
  description: '',
  slotDuration: 60,
  workingDates: {} as Record<string, { start: string; end: string }>
});
const services = ref<any[]>([]);
const newService = ref({ title: '', price: 0, duration: 60, currency: 'RUB' });
const loading = ref(true);
const saving = ref(false);
const showAddService = ref(false);

// Для календаря
const currentMonth = ref(new Date());
const selectedDates = ref<Set<string>>(new Set());
const workingTime = ref({ start: '09:00', end: '18:00' });

// Генерация дней месяца
const calendarDays = computed(() => {
  const year = currentMonth.value.getFullYear();
  const month = currentMonth.value.getMonth();
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  const days = [];
  const startPadding = (firstDay.getDay() + 6) % 7; // Понедельник = 0
  
  // Пустые ячейки в начале
  for (let i = 0; i < startPadding; i++) {
    days.push(null);
  }
  
  // Дни месяца
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    const dateStr: string = date.toISOString().split('T')[0] as string;
    const isPast = date < new Date(new Date().setHours(0, 0, 0, 0));
    const hasSchedule = profile.value.workingDates?.[dateStr] !== undefined;
    const isSelected = selectedDates.value.has(dateStr);
    
    days.push({
      date: dateStr,
      day: day,
      isPast,
      hasSchedule,
      isSelected
    });
  }
  
  return days;
});

const monthName = computed(() => {
  return currentMonth.value.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
});

const prevMonth = () => {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() - 1);
  selectedDates.value.clear(); // Сбрасываем выделение при смене месяца
};

const nextMonth = () => {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1);
  selectedDates.value.clear(); // Сбрасываем выделение при смене месяца
};

const toggleDate = (dateStr: string, isPast: boolean) => {
  if (isPast) return;
  
  // Если это первый выбранный день - подставляем его время
  if (selectedDates.value.size === 0) {
    if (profile.value.workingDates[dateStr]) {
      // Если у дня уже есть расписание - берём его
      workingTime.value = { ...profile.value.workingDates[dateStr] };
    } else {
      // Если расписания нет - дефолт
      workingTime.value = { start: '09:00', end: '18:00' };
    }
  }
  
  if (selectedDates.value.has(dateStr)) {
    selectedDates.value.delete(dateStr);
    
    // Если сняли все выделения - сбрасываем время на дефолт
    if (selectedDates.value.size === 0) {
      workingTime.value = { start: '09:00', end: '18:00' };
    }
  } else {
    selectedDates.value.add(dateStr);
  }
  
  try {
    WebApp.HapticFeedback.selectionChanged();
  } catch {}
};

const removeSelectedDates = () => {
  const newDates = { ...profile.value.workingDates };
  selectedDates.value.forEach(dateStr => {
    delete newDates[dateStr];
  });
  profile.value.workingDates = newDates;
  selectedDates.value.clear();
  
  try {
    WebApp.HapticFeedback.notificationOccurred('success');
  } catch {}
};

// Массовое заполнение
const fillWeekdays = () => {
  const confirmed = confirm('Заполнить все будние дни (Пн-Пт) на 2 месяца вперёд расписанием 09:00-18:00?');
  if (!confirmed) return;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 2);
  
  let count = 0;
  const newDates = { ...profile.value.workingDates };
  
  for (let d = new Date(today); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    // Пн-Пт (1-5)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      const dateStr: string = d.toISOString().split('T')[0] as string;
      if (newDates[dateStr] === undefined) {
        newDates[dateStr] = { start: '09:00', end: '18:00' };
        count++;
      }
    }
  }
  
  profile.value.workingDates = newDates;
  
  try {
    WebApp.showAlert(`Добавлено рабочих дней: ${count}`);
    WebApp.HapticFeedback.notificationOccurred('success');
  } catch {
    alert(`Добавлено рабочих дней: ${count}`);
  }
};

onMounted(async () => {
  try {
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(() => router.push('/master/dashboard'));
  } catch {}
  
  try {
    // Загружаем профиль
    const profileRes = await api.get('/master/profile');
    if (profileRes.data.profile) {
      profile.value = {
        displayName: profileRes.data.profile.displayName || '',
        description: profileRes.data.profile.description || '',
        slotDuration: profileRes.data.profile.slotDuration || 60,
        workingDates: profileRes.data.profile.workingDates || {}
      };
    }
    
    // Загружаем услуги
    const servicesRes = await api.get('/master/services');
    services.value = servicesRes.data.services;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

onUnmounted(() => {
  try {
    WebApp.BackButton.hide();
  } catch {}
});

const saveProfile = async () => {
  saving.value = true;
  try {
    // Применяем время к выделенным дням
    if (selectedDates.value.size > 0) {
      const newDates = { ...profile.value.workingDates };
      selectedDates.value.forEach(dateStr => {
        newDates[dateStr] = { ...workingTime.value };
      });
      profile.value.workingDates = newDates;
      selectedDates.value.clear();
    }
    
    await api.put('/master/profile', profile.value);
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
      WebApp.showAlert('Настройки сохранены!');
    } catch {
      alert('Настройки сохранены!');
    }
  } catch {
    try {
      WebApp.showAlert('Ошибка сохранения');
    } catch {
      alert('Ошибка сохранения');
    }
  } finally {
    saving.value = false;
  }
};

const addService = async () => {
  if (!newService.value.title.trim()) return;
  try {
    const res = await api.post('/master/services', newService.value);
    services.value.push(res.data.service);
    newService.value = { title: '', price: 0, duration: 60, currency: 'RUB' };
    showAddService.value = false;
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
  } catch {
    try {
      WebApp.showAlert('Ошибка создания услуги');
    } catch {
      alert('Ошибка создания услуги');
    }
  }
};

const deleteService = async (id: number) => {
  try {
    await api.delete(`/master/services/${id}`);
    services.value = services.value.filter(s => s.id !== id);
    try {
      WebApp.HapticFeedback.notificationOccurred('warning');
    } catch {}
  } catch {
    try {
      WebApp.showAlert('Ошибка удаления');
    } catch {
      alert('Ошибка удаления');
    }
  }
};
</script>

<template>
  <div class="p-4 pb-24 animate-fade-in">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <button 
        @click="router.push('/master/dashboard')" 
        class="w-10 h-10 rounded-xl bg-tg-secondary-bg flex items-center justify-center"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div>
        <h1 class="text-xl font-bold">Настройки</h1>
        <p class="text-xs text-tg-hint">Расписание и услуги</p>
      </div>
    </div>

    <!-- Profile Info Section -->
    <div class="card mb-4">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-gradient-end/15 flex items-center justify-center">
          <svg class="w-5 h-5 text-gradient-end" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </div>
        <div>
          <h2 class="font-semibold">О вас</h2>
          <p class="text-xs text-tg-hint">Информация для клиентов</p>
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label class="text-xs text-tg-hint mb-1.5 block">Имя / Название</label>
          <input 
            v-model="profile.displayName" 
            placeholder="Как вас называть клиентам"
            class="w-full p-3 rounded-xl"
          />
        </div>
        <div>
          <label class="text-xs text-tg-hint mb-1.5 block">Специализация</label>
          <input 
            v-model="profile.description" 
            placeholder="Например: Парикмахер-стилист, Мастер маникюра"
            class="w-full p-3 rounded-xl"
          />
          <p class="text-xs text-tg-hint mt-1.5">Будет показано клиентам в уведомлениях</p>
        </div>
      </div>
    </div>

    <!-- Schedule Section -->
    <div class="card mb-4">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
          <svg class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 class="font-semibold">График работы</h2>
          <p class="text-xs text-tg-hint">Выберите рабочие дни</p>
        </div>
      </div>

      <!-- Quick Fill Button -->
      <button 
        @click="fillWeekdays"
        class="w-full mb-4 btn bg-accent/15 text-accent text-sm py-2.5"
      >
        <svg class="w-4 h-4 inline mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Заполнить Пн-Пт на 2 месяца
      </button>

      <!-- Slot Duration -->
      <div class="mb-4">
        <label class="text-xs text-tg-hint mb-1.5 block">Длительность слота (мин)</label>
        <div class="flex gap-2">
          <button 
            v-for="dur in [30, 60, 90, 120]" 
            :key="dur"
            @click="profile.slotDuration = dur"
            class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
            :class="profile.slotDuration === dur 
              ? 'bg-accent text-white' 
              : 'bg-tg-bg'"
          >
            {{ dur }}
          </button>
        </div>
      </div>

      <!-- Calendar Navigation -->
      <div class="flex items-center justify-between mb-3">
        <button @click="prevMonth" class="w-8 h-8 rounded-lg bg-tg-bg flex items-center justify-center">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span class="font-semibold capitalize">{{ monthName }}</span>
        <button @click="nextMonth" class="w-8 h-8 rounded-lg bg-tg-bg flex items-center justify-center">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <!-- Calendar Grid -->
      <div class="mb-4">
        <div class="grid grid-cols-7 gap-1 mb-2">
          <div v-for="day in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']" :key="day" 
               class="text-xs text-center text-tg-hint font-medium py-1">
            {{ day }}
          </div>
        </div>
        <div class="grid grid-cols-7 gap-1">
          <button
            v-for="(day, idx) in calendarDays"
            :key="idx"
            @click="day && !day.isPast && day.date ? toggleDate(day.date, day.isPast) : null"
            :disabled="!day || day.isPast"
            class="aspect-square rounded-lg text-sm font-medium transition-all"
            :class="{
              'bg-tg-bg': day && !day.isPast && !day.hasSchedule && !day.isSelected,
              'bg-success/15 text-success': day && day.hasSchedule && !day.isSelected,
              'bg-accent text-white': day && day.isSelected,
              'opacity-30': day && day.isPast,
              'invisible': !day
            }"
          >
            {{ day?.day }}
          </button>
        </div>
      </div>

      <!-- Legend -->
      <div class="flex items-center gap-4 mb-4 text-xs">
        <div class="flex items-center gap-1.5">
          <div class="w-4 h-4 rounded bg-accent"></div>
          <span class="text-tg-hint">Выделено</span>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-4 h-4 rounded bg-success/15"></div>
          <span class="text-tg-hint">Рабочий день</span>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-4 h-4 rounded bg-tg-bg"></div>
          <span class="text-tg-hint">Выходной</span>
        </div>
      </div>

      <!-- Time Settings for Selected Days -->
      <div v-if="selectedDates.size > 0" class="mb-4 p-4 rounded-xl bg-accent/10 border border-accent/20">
        <div class="flex items-center justify-between mb-3">
          <div>
            <div class="font-semibold text-accent">Выбрано дней: {{ selectedDates.size }}</div>
            <div class="text-xs text-tg-hint">Укажите рабочее время</div>
          </div>
          <button 
            @click="removeSelectedDates"
            class="text-xs btn bg-danger/15 text-danger py-1.5 px-3 shrink-0"
          >
            Удалить
          </button>
        </div>
        
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-sm text-tg-hint mb-1.5 block">Начало</label>
            <input 
              type="time"
              v-model="workingTime.start"
              class="time-input w-full p-3 rounded-xl bg-tg-bg text-center text-lg font-semibold"
            />
          </div>
          <div>
            <label class="text-sm text-tg-hint mb-1.5 block">Конец</label>
            <input 
              type="time"
              v-model="workingTime.end"
              class="time-input w-full p-3 rounded-xl bg-tg-bg text-center text-lg font-semibold"
            />
          </div>
        </div>
      </div>

      <button 
        @click="saveProfile" 
        :disabled="saving"
        class="w-full btn btn-primary"
      >
        <svg v-if="saving" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        {{ saving ? 'Сохранение...' : 'Сохранить настройки' }}
      </button>
    </div>

    <!-- Services Section -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-end/15 flex items-center justify-center">
            <svg class="w-5 h-5 text-gradient-end" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h2 class="font-semibold">Услуги</h2>
            <p class="text-xs text-tg-hint">{{ services.length }} услуг</p>
          </div>
        </div>
        <button 
          @click="showAddService = !showAddService"
          class="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center transition-transform"
          :class="{ 'rotate-45': showAddService }"
        >
          <svg class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <!-- Add Service Form -->
      <transition name="slide">
        <div v-if="showAddService" class="mb-4 p-3 rounded-xl bg-tg-bg">
          <input 
            v-model="newService.title" 
            placeholder="Название услуги" 
            class="w-full p-3 rounded-xl mb-2"
          />
          <div class="grid grid-cols-2 gap-2 mb-3">
            <div class="relative">
              <input 
                v-model="newService.price" 
                type="number" 
                placeholder="Цена"
                class="w-full p-3 rounded-xl pr-10"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-tg-hint text-sm">₽</span>
            </div>
            <div class="relative">
              <input 
                v-model="newService.duration" 
                type="number" 
                placeholder="Время"
                class="w-full p-3 rounded-xl pr-12"
              />
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-tg-hint text-sm">мин</span>
            </div>
          </div>
          <button 
            @click="addService" 
            :disabled="!newService.title.trim()"
            class="w-full btn bg-success text-white disabled:opacity-50"
          >
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Добавить услугу
          </button>
        </div>
      </transition>

      <!-- Services List -->
      <div v-if="loading" class="py-8 text-center">
        <div class="spinner mx-auto"></div>
      </div>
      
      <div v-else-if="services.length === 0" class="py-8 text-center">
        <p class="text-tg-hint text-sm">Добавьте первую услугу</p>
      </div>

      <div v-else class="space-y-2">
        <div 
          v-for="s in services" 
          :key="s.id" 
          class="flex items-center gap-3 p-3 rounded-xl bg-tg-bg group"
        >
          <div class="flex-1 min-w-0">
            <div class="font-medium truncate">{{ s.title }}</div>
            <div class="text-xs text-tg-hint">
              {{ s.price }} {{ s.currency }} • {{ s.duration }} мин
            </div>
          </div>
          <button 
            @click="deleteService(s.id)" 
            class="w-8 h-8 rounded-lg bg-danger/10 flex items-center justify-center"
          >
            <svg class="w-4 h-4 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: all 0.2s ease;
}

.slide-enter-from,
.slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.animate-scale-in {
  animation: scaleIn 0.2s ease;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* Фикс для iPhone - явные стили для time input */
.time-input {
  -webkit-appearance: none;
  appearance: none;
  border: none;
  outline: none;
  color: var(--tg-theme-text-color);
  background-color: var(--tg-theme-bg-color);
}

.time-input::-webkit-calendar-picker-indicator {
  filter: invert(1);
  cursor: pointer;
}
</style>
