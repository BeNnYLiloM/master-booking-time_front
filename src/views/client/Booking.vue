<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../api';
import WebApp from '@twa-dev/sdk';

const route = useRoute();
const router = useRouter();
const masterId = route.params.masterId;

const isTelegram = computed(() => {
  try {
    return !!WebApp.initData && WebApp.initData.length > 0;
  } catch {
    return false;
  }
});

// State
const step = ref(1);
const services = ref<any[]>([]);
const selectedService = ref<any>(null);
const selectedDate = ref(new Date().toISOString().split('T')[0]);
const slots = ref<{time: string, isAvailable: boolean}[]>([]);
const selectedSlot = ref<string | null>(null);
const loading = ref(true);
const loadingSlots = ref(false);
const booking = ref(false);
const dateInputRef = ref<HTMLInputElement | null>(null);

let mainButtonHandler: (() => void) | null = null;

// Generate next 7 days for quick selection
const nextDays = computed(() => {
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    days.push({
      date: date.toISOString().split('T')[0],
      day: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
      num: date.getDate(),
      isToday: i === 0
    });
  }
  return days;
});

onMounted(async () => {
  try {
    const servicesRes = await api.get(`/public/services/${masterId}`);
    services.value = servicesRes.data.services;
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

watch([step, selectedService, selectedSlot], () => {
  if (!isTelegram.value) return;
  
  try {
    if (mainButtonHandler) {
      WebApp.MainButton.offClick(mainButtonHandler);
      mainButtonHandler = null;
    }

    if (step.value === 1 && selectedService.value) {
      mainButtonHandler = goToStep2;
      WebApp.MainButton.setText('Выбрать время →');
      WebApp.MainButton.onClick(mainButtonHandler);
      WebApp.MainButton.show();
    } else if (step.value === 2 && selectedSlot.value) {
      mainButtonHandler = bookAppointment;
      WebApp.MainButton.setText('Записаться ✓');
      WebApp.MainButton.onClick(mainButtonHandler);
      WebApp.MainButton.show();
    } else {
      WebApp.MainButton.hide();
    }
  } catch {}
});

onUnmounted(() => {
  if (isTelegram.value && mainButtonHandler) {
    try {
      WebApp.MainButton.offClick(mainButtonHandler);
      WebApp.MainButton.hide();
    } catch {}
  }
});

const goToStep2 = () => {
  step.value = 2;
  loadSlots();
};

const loadSlots = async () => {
  if (!selectedService.value) return;
  
  loadingSlots.value = true;
  slots.value = [];
  selectedSlot.value = null;
  try {
    const res = await api.get(`/slots`, { 
      params: { 
        masterId, 
        date: selectedDate.value,
        serviceId: selectedService.value.id
      } 
    });
    slots.value = res.data;
  } catch (e) {
    console.error(e);
  } finally {
    loadingSlots.value = false;
  }
};

const bookAppointment = async () => {
  if (!selectedSlot.value) return;
  
  booking.value = true;
  
  if (isTelegram.value) {
    try { WebApp.MainButton.showProgress(); } catch {}
  }
  
  try {
    await api.post('/appointments', {
      masterId: Number(masterId),
      serviceId: selectedService.value.id,
      dateStr: selectedDate.value,
      timeStr: selectedSlot.value
    });
    step.value = 3;
    
    if (isTelegram.value) {
      try { WebApp.HapticFeedback.notificationOccurred('success'); } catch {}
    }
  } catch (e: any) {
    const errorMsg = e.response?.data?.error || 'Ошибка записи';
    alert(errorMsg + '. Попробуйте другое время.');
    loadSlots();
  } finally {
    booking.value = false;
    if (isTelegram.value) {
      try { WebApp.MainButton.hideProgress(); } catch {}
    }
  }
};

const selectService = (s: any) => {
  selectedService.value = s;
  if (isTelegram.value) {
    try { WebApp.HapticFeedback.selectionChanged(); } catch {}
  }
};

const selectSlot = (time: string) => {
  selectedSlot.value = time;
  if (isTelegram.value) {
    try { WebApp.HapticFeedback.selectionChanged(); } catch {}
  }
};

const selectDay = (date: string | undefined) => {
  if (date) {
    selectedDate.value = date;
    loadSlots();
  }
};

// Проверяем, входит ли выбранная дата в быстрый выбор (7 дней)
const isCustomDate = computed(() => {
  return !nextDays.value.some(d => d.date === selectedDate.value);
});

// Определяем мобильное устройство
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Открыть date picker (для десктопа)
const openDatePicker = () => {
  const input = dateInputRef.value;
  if (!input) return;
  
  try {
    input.showPicker();
  } catch {
    // Если showPicker не поддерживается, ничего не делаем
    // На мобильных сработает нативный клик по input
  }
};

// Обработка выбора даты из нативного picker
const onDateChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.value) {
    selectedDate.value = target.value;
    loadSlots();
  }
};

const formatSelectedDate = computed(() => {
  const date = new Date(selectedDate.value || new Date());
  return date.toLocaleDateString('ru-RU', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  });
});
</script>

<template>
  <div class="min-h-screen min-h-dvh pb-28 animate-fade-in">
    <!-- Progress Bar -->
    <div class="sticky top-0 z-10 bg-tg-bg p-4">
      <div class="flex items-center gap-2 mb-2">
        <div 
          v-for="i in 3" 
          :key="i"
          class="h-1 flex-1 rounded-full transition-all duration-300"
          :class="step >= i ? 'bg-accent' : 'bg-tg-secondary-bg'"
        ></div>
      </div>
      <div class="flex justify-between text-xs text-tg-hint">
        <span :class="{ 'text-accent font-semibold': step === 1 }">Услуга</span>
        <span :class="{ 'text-accent font-semibold': step === 2 }">Время</span>
        <span :class="{ 'text-accent font-semibold': step === 3 }">Готово</span>
      </div>
    </div>

    <div class="p-4">
      <!-- Step 1: Select Service -->
      <div v-if="step === 1">
        <h1 class="text-2xl font-bold mb-1">Выберите услугу</h1>
        <p class="text-tg-hint text-sm mb-6">Что вы хотите сделать?</p>

        <div v-if="loading" class="py-12 text-center">
          <div class="spinner mx-auto mb-3"></div>
          <p class="text-tg-hint text-sm">Загрузка услуг...</p>
        </div>

        <div v-else class="space-y-3">
          <button 
            v-for="s in services" 
            :key="s.id" 
            @click="selectService(s)"
            class="w-full text-left card transition-all active:scale-[0.98]"
            :class="selectedService?.id === s.id ? 'ring-2 ring-accent' : ''"
          >
            <div class="flex items-center gap-3">
              <div 
                class="w-12 h-12 rounded-xl flex items-center justify-center"
                :class="selectedService?.id === s.id 
                  ? 'bg-accent text-white' 
                  : 'bg-tg-bg'"
              >
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              </div>
              <div class="flex-1">
                <div class="font-semibold">{{ s.title }}</div>
                <div class="text-sm text-tg-hint">{{ s.duration }} мин</div>
              </div>
              <div class="text-right">
                <div class="font-bold text-accent">{{ s.price }} ₽</div>
              </div>
            </div>
          </button>
        </div>

        <!-- Browser Button -->
        <button 
          v-if="selectedService && !isTelegram"
          @click="goToStep2"
          class="fixed bottom-4 left-4 right-4 btn btn-primary text-lg py-4"
        >
          Выбрать время →
        </button>
      </div>

      <!-- Step 2: Select Date & Time -->
      <div v-if="step === 2">
        <button 
          @click="step = 1; selectedSlot = null" 
          class="flex items-center gap-1 text-tg-hint text-sm mb-4 active:opacity-70"
        >
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
          Назад
        </button>

        <h1 class="text-2xl font-bold mb-4">Выберите время</h1>
        
        <!-- Selected Service Summary -->
        <div class="card mb-6 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
            <svg class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div class="flex-1">
            <div class="font-medium">{{ selectedService?.title }}</div>
            <div class="text-xs text-tg-hint">{{ selectedService?.duration }} мин • {{ selectedService?.price }} ₽</div>
          </div>
        </div>

        <!-- Date Quick Selection -->
        <div class="mb-6">
          <label class="text-sm font-semibold mb-3 block">Дата</label>
          <div class="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            <button 
              v-for="d in nextDays" 
              :key="d.date"
              @click="selectDay(d.date)"
              class="flex-shrink-0 w-14 py-3 rounded-xl text-center transition-all"
              :class="selectedDate === d.date 
                ? 'bg-accent text-white' 
                : 'bg-tg-secondary-bg'"
            >
              <div class="text-xs opacity-70">{{ d.day }}</div>
              <div class="text-lg font-bold">{{ d.num }}</div>
              <div v-if="d.isToday" class="w-1.5 h-1.5 rounded-full bg-current mx-auto mt-1 opacity-60"></div>
            </button>
            
            <!-- Кнопка "Другая дата" -->
            <div 
              class="flex-shrink-0 w-14 py-3 rounded-xl text-center transition-all relative cursor-pointer overflow-hidden"
              :class="isCustomDate ? 'bg-accent text-white' : 'bg-tg-secondary-bg'"
              @click="openDatePicker"
            >
              <div class="text-xs opacity-70">ещё</div>
              <svg class="w-5 h-5 mx-auto mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <!-- Date input внутри кнопки -->
              <input 
                ref="dateInputRef"
                type="date" 
                :value="selectedDate"
                @input="onDateChange"
                :min="new Date().toISOString().split('T')[0]"
                class="absolute inset-0 w-full h-full cursor-pointer"
                :style="{ opacity: isMobile ? 0.01 : 0, fontSize: '16px' }"
                :tabindex="isMobile ? 0 : -1"
              />
            </div>
          </div>
          
          <p class="text-xs text-tg-hint mt-3 capitalize">{{ formatSelectedDate }}</p>
        </div>

        <!-- Time Slots -->
        <div>
          <label class="text-sm font-semibold mb-3 block">Время</label>
          
          <div v-if="loadingSlots" class="py-8 text-center">
            <div class="spinner mx-auto mb-3"></div>
            <p class="text-tg-hint text-sm">Загрузка слотов...</p>
          </div>

          <div v-else-if="slots.length === 0" class="py-8 text-center">
            <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-tg-secondary-bg flex items-center justify-center">
              <svg class="w-8 h-8 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p class="text-tg-hint font-medium">Нет свободных слотов</p>
            <p class="text-tg-hint text-sm">Выберите другую дату</p>
          </div>

          <div v-else class="grid grid-cols-4 gap-2">
            <button 
              v-for="slot in slots" 
              :key="slot.time"
              @click="selectSlot(slot.time)"
              class="py-3 rounded-xl text-center font-medium transition-all active:scale-95"
              :class="selectedSlot === slot.time 
                ? 'bg-accent text-white' 
                : 'bg-tg-secondary-bg'"
            >
              {{ slot.time }}
            </button>
          </div>
        </div>

        <!-- Browser Button -->
        <button 
          v-if="selectedSlot && !isTelegram"
          @click="bookAppointment"
          :disabled="booking"
          class="fixed bottom-4 left-4 right-4 btn btn-primary text-lg py-4 disabled:opacity-50"
        >
          <svg v-if="booking" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
          {{ booking ? 'Записываем...' : 'Записаться ✓' }}
        </button>
      </div>

      <!-- Step 3: Success -->
      <div v-if="step === 3" class="text-center py-8">
        <!-- Success Animation -->
        <div class="relative mb-8">
          <div class="w-24 h-24 mx-auto rounded-full bg-success/15 flex items-center justify-center">
            <div class="w-16 h-16 rounded-full bg-success flex items-center justify-center">
              <svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
        </div>

        <h1 class="text-2xl font-bold mb-2">Вы записаны! 🎉</h1>
        <p class="text-tg-hint mb-8">Ждём вас в назначенное время</p>

        <!-- Booking Details Card -->
        <div class="card text-left mb-6">
          <div class="flex items-center gap-3 pb-3 mb-3" style="border-bottom: 1px solid var(--tg-theme-hint-color, #ccc); opacity: 0.2;">
          </div>
          <div class="flex items-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <svg class="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <div class="font-semibold">{{ selectedService?.title }}</div>
              <div class="text-xs text-tg-hint">{{ selectedService?.duration }} мин</div>
            </div>
          </div>
          
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-gradient-end/15 flex items-center justify-center">
              <svg class="w-5 h-5 text-gradient-end" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <div class="font-semibold capitalize">{{ formatSelectedDate }}</div>
              <div class="text-xs text-tg-hint">в {{ selectedSlot }}</div>
            </div>
          </div>
        </div>

        <div class="flex gap-3">
          <button 
            @click="router.replace('/')"
            class="flex-1 btn btn-secondary"
          >
            На главную
          </button>
          <router-link 
            to="/client/appointments"
            class="flex-1 btn btn-primary"
          >
            Мои записи
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>
