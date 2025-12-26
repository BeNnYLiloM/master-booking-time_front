<script setup lang="ts">
import { ref, onMounted, watch, computed, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import api from '../../api';
import WebApp from '@twa-dev/sdk';
import YandexMap from '../../components/YandexMap.vue';
import AddressSearch from '../../components/AddressSearch.vue';

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
const error = ref<string | null>(null);
const masterWorkingDates = ref<Record<string, any>>({});
const currentMonth = ref(new Date());
const masterProfile = ref<any>(null);

// Location state
const selectedLocationType = ref<'at_master' | 'at_client' | null>(null);
const clientAddress = ref('');
const clientCoordinates = ref<[number, number]>([55.751244, 37.618423]);
const showClientMap = ref(false);

let mainButtonHandler: (() => void) | null = null;

// Генерация дней месяца для календаря
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
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Дни месяца
  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(year, month, day);
    const dateStr: string = date.toISOString().split('T')[0] as string;
    const isPast = date < today;
    const hasSchedule = masterWorkingDates.value[dateStr] !== undefined;
    const isSelected = selectedDate.value === dateStr;
    
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
};

const nextMonth = () => {
  currentMonth.value = new Date(currentMonth.value.getFullYear(), currentMonth.value.getMonth() + 1);
};

onMounted(async () => {
  try {
    // Загружаем услуги
    const servicesRes = await api.get(`/public/services/${masterId}`);
    services.value = servicesRes.data.services;
    
    // Загружаем рабочие дни мастера и профиль
    const masterRes = await api.get(`/public/master/${masterId}`);
    masterWorkingDates.value = masterRes.data.masterProfile?.workingDates || {};
    masterProfile.value = masterRes.data.masterProfile || null;
    
    if (Object.keys(masterWorkingDates.value).length === 0) {
      error.value = 'У мастера не настроено рабочее расписание';
      return;
    }
    
    // Устанавливаем первый рабочий день и текущий месяц
    const firstWorkingDay = Object.keys(masterWorkingDates.value)
      .filter(date => new Date(date) >= new Date(new Date().setHours(0, 0, 0, 0)))
      .sort()[0];
    
    if (firstWorkingDay) {
      selectedDate.value = firstWorkingDay;
      currentMonth.value = new Date(firstWorkingDay);
    } else {
      error.value = 'У мастера нет доступных рабочих дней';
      return;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
});

watch([step, selectedService, selectedSlot, selectedLocationType, clientAddress], () => {
  if (!isTelegram.value) return;
  
  try {
    if (mainButtonHandler) {
      WebApp.MainButton.offClick(mainButtonHandler);
      mainButtonHandler = null;
    }

    if (step.value === 1 && canGoToTimeSelection.value) {
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

// Проверка может ли клиент перейти к выбору времени
const canGoToTimeSelection = computed(() => {
  if (!selectedService.value) return false;
  
  // Если услуга 'both' - нужен выбор места
  if (selectedService.value.locationType === 'both') {
    if (!selectedLocationType.value) return false;
    // Если выбран 'at_client' - нужен адрес
    if (selectedLocationType.value === 'at_client' && !clientAddress.value.trim()) return false;
  }
  
  // Если услуга 'at_client' - нужен адрес
  if (selectedService.value.locationType === 'at_client' && !clientAddress.value.trim()) {
    return false;
  }
  
  return true;
});

const goToStep2 = () => {
  if (!canGoToTimeSelection.value) return;
  step.value = 2;
  loadSlots();
};

// Обработчики для карты клиента
const onClientAddressSelect = (data: { address: string; coordinates: [number, number] }) => {
  clientAddress.value = data.address;
  clientCoordinates.value = data.coordinates;
  showClientMap.value = true;
};

const onClientMapCoordinatesUpdate = (coords: [number, number]) => {
  clientCoordinates.value = coords;
};

const onClientMapAddressChanged = (address: string) => {
  clientAddress.value = address;
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
    const bookingData: any = {
      masterId: Number(masterId),
      serviceId: selectedService.value.id,
      dateStr: selectedDate.value,
      timeStr: selectedSlot.value
    };
    
    // Добавляем информацию о локации
    const finalLocationType = selectedLocationType.value || selectedService.value.locationType;
    bookingData.locationType = finalLocationType;
    
    // Если услуга у клиента - передаем адрес
    if (finalLocationType === 'at_client') {
      bookingData.address = {
        text: clientAddress.value,
        coordinates: clientCoordinates.value
      };
    }
    
    await api.post('/appointments', bookingData);
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
  
  // Определяем нужен ли выбор места
  if (s.locationType === 'both') {
    // Нужен выбор места - переходим к Step 1.5
    selectedLocationType.value = null;
  } else {
    // Автоматически устанавливаем locationType
    selectedLocationType.value = s.locationType;
  }
  
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

const selectDay = (date: string | undefined, isPast: boolean, hasSchedule: boolean) => {
  if (!date || isPast || !hasSchedule) return;
  
  selectedDate.value = date;
  loadSlots();
  
  if (isTelegram.value) {
    try { WebApp.HapticFeedback.selectionChanged(); } catch {}
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

        <div v-else-if="error" class="py-12 text-center">
          <div class="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <svg class="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p class="text-tg-hint text-sm">{{ error }}</p>
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

        <!-- Location Selection (if service is 'both') -->
        <div v-if="selectedService && selectedService.locationType === 'both'" class="mt-6 card">
          <h3 class="font-semibold mb-3">Где хотите получить услугу?</h3>
          
          <div class="space-y-2">
            <label 
              class="flex items-start gap-3 p-3 rounded-xl border border-tg-hint/20 cursor-pointer transition-colors"
              :class="selectedLocationType === 'at_master' ? 'border-accent bg-accent/5' : ''"
            >
              <input 
                type="radio" 
                v-model="selectedLocationType" 
                value="at_master"
                class="w-4 h-4 mt-0.5"
              />
              <div class="flex-1">
                <div class="font-medium text-sm">У мастера</div>
                <div v-if="masterProfile?.location?.address?.text" class="text-xs text-tg-hint mt-1">
                  📍 {{ masterProfile.location.address.text }}
                </div>
              </div>
            </label>

            <label 
              class="flex items-start gap-3 p-3 rounded-xl border border-tg-hint/20 cursor-pointer transition-colors"
              :class="selectedLocationType === 'at_client' ? 'border-accent bg-accent/5' : ''"
            >
              <input 
                type="radio" 
                v-model="selectedLocationType" 
                value="at_client"
                class="w-4 h-4 mt-0.5"
              />
              <div class="flex-1">
                <div class="font-medium text-sm">Вызвать к себе</div>
                <div class="text-xs text-tg-hint mt-1">Мастер приедет к вам</div>
              </div>
            </label>
          </div>
        </div>

        <!-- Client Address Input (if 'at_client' selected or service is 'at_client') -->
        <div v-if="selectedService && (selectedLocationType === 'at_client' || selectedService.locationType === 'at_client')" class="mt-4 card">
          <h3 class="font-semibold mb-3">Ваш адрес</h3>
          
          <AddressSearch
            v-model="clientAddress"
            placeholder="Начните вводить адрес..."
            @select="onClientAddressSelect"
          />

          <!-- Client Map -->
          <div v-if="showClientMap || clientAddress" class="mt-3">
            <YandexMap
              :coordinates="clientCoordinates"
              :draggable="true"
              height="200px"
              @update:coordinates="onClientMapCoordinatesUpdate"
              @address-changed="onClientMapAddressChanged"
            />
            <p class="text-xs text-tg-hint mt-2">
              💡 Перетащите маркер для точного указания места
            </p>
          </div>
        </div>

        <!-- Browser Button -->
        <button 
          v-if="canGoToTimeSelection && !isTelegram"
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
          
          <!-- Календарь -->
          <div class="card mb-4">
            <!-- Навигация месяца -->
            <div class="flex items-center justify-between mb-4">
              <button
                @click="prevMonth"
                class="w-9 h-9 rounded-lg bg-tg-secondary-bg hover:bg-tg-secondary-bg/70 transition-colors flex items-center justify-center"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <h3 class="text-base font-semibold capitalize">{{ monthName }}</h3>
              
              <button
                @click="nextMonth"
                class="w-9 h-9 rounded-lg bg-tg-secondary-bg hover:bg-tg-secondary-bg/70 transition-colors flex items-center justify-center"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
            
            <!-- Дни недели -->
            <div class="grid grid-cols-7 gap-1 mb-2">
              <div v-for="day in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']" :key="day" 
                   class="text-center text-xs text-tg-hint font-medium py-1">
                {{ day }}
              </div>
            </div>
            
            <!-- Дни месяца -->
            <div class="grid grid-cols-7 gap-1">
              <button
                v-for="(day, idx) in calendarDays"
                :key="idx"
                @click="selectDay(day?.date, day?.isPast || false, day?.hasSchedule || false)"
                :disabled="!day || day.isPast || !day.hasSchedule"
                class="aspect-square rounded-lg text-sm font-medium transition-all relative"
                :class="{
                  'invisible': !day,
                  'bg-green-500/20 text-green-600 hover:bg-green-500/30': day?.hasSchedule && !day.isSelected && !day.isPast,
                  'bg-accent text-white': day?.isSelected,
                  'bg-tg-secondary-bg text-tg-hint opacity-40 cursor-not-allowed': day && (!day.hasSchedule || day.isPast)
                }"
              >
                <span v-if="day">{{ day.day }}</span>
              </button>
            </div>
            
            <!-- Легенда -->
            <div class="flex gap-4 mt-4 text-xs text-tg-hint">
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded bg-green-500/20"></div>
                <span>Рабочий день</span>
              </div>
              <div class="flex items-center gap-1.5">
                <div class="w-3 h-3 rounded bg-accent"></div>
                <span>Выбрано</span>
              </div>
            </div>
          </div>
          
          <p class="text-xs text-tg-hint capitalize">Выбрано: {{ formatSelectedDate }}</p>
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
