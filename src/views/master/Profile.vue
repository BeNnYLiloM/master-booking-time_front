<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import api from '../../api';
import WebApp from '@twa-dev/sdk';
import { useRouter } from 'vue-router';

const router = useRouter();
const profile = ref({
  displayName: '',
  description: '',
  workStartHour: 10,
  workEndHour: 20,
  slotDuration: 60,
  daysOff: [] as number[]
});
const services = ref<any[]>([]);
const newService = ref({ title: '', price: 0, duration: 60, currency: 'RUB' });
const loading = ref(true);
const saving = ref(false);
const showAddService = ref(false);

const weekDays = [
  { id: 0, name: 'Вс' },
  { id: 1, name: 'Пн' },
  { id: 2, name: 'Вт' },
  { id: 3, name: 'Ср' },
  { id: 4, name: 'Чт' },
  { id: 5, name: 'Пт' },
  { id: 6, name: 'Сб' },
];

const toggleDayOff = (dayId: number) => {
  const idx = profile.value.daysOff.indexOf(dayId);
  if (idx > -1) {
    profile.value.daysOff.splice(idx, 1);
  } else {
    profile.value.daysOff.push(dayId);
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
      profile.value = { ...profile.value, ...profileRes.data.profile };
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
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <h2 class="font-semibold">Расписание</h2>
          <p class="text-xs text-tg-hint">Рабочие часы и выходные</p>
        </div>
      </div>

      <!-- Working Hours -->
      <div class="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label class="text-xs text-tg-hint mb-1.5 block">Начало работы</label>
          <div class="relative">
            <input 
              type="number" 
              v-model="profile.workStartHour" 
              min="0" 
              max="23"
              class="w-full p-3 rounded-xl text-center font-semibold"
            />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-tg-hint text-sm">:00</span>
          </div>
        </div>
        <div>
          <label class="text-xs text-tg-hint mb-1.5 block">Конец работы</label>
          <div class="relative">
            <input 
              type="number" 
              v-model="profile.workEndHour" 
              min="0" 
              max="23"
              class="w-full p-3 rounded-xl text-center font-semibold"
            />
            <span class="absolute right-3 top-1/2 -translate-y-1/2 text-tg-hint text-sm">:00</span>
          </div>
        </div>
      </div>

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

      <!-- Days Off -->
      <div>
        <label class="text-xs text-tg-hint mb-1.5 block">Выходные дни</label>
        <div class="flex gap-2">
          <button 
            v-for="day in weekDays" 
            :key="day.id"
            @click="toggleDayOff(day.id)"
            class="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
            :class="profile.daysOff.includes(day.id) 
              ? 'bg-danger/15 text-danger' 
              : 'bg-tg-bg'"
          >
            {{ day.name }}
          </button>
        </div>
      </div>

      <button 
        @click="saveProfile" 
        :disabled="saving"
        class="w-full btn btn-primary mt-4"
      >
        <svg v-if="saving" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        {{ saving ? 'Сохранение...' : 'Сохранить расписание' }}
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
</style>
