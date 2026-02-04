<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import api from '../../api';
import WebApp from '@twa-dev/sdk';
import { useRouter } from 'vue-router';
import YandexMap from '../../components/YandexMap.vue';
import ProxyAddressSearch from '../../components/ProxyAddressSearch.vue';

const router = useRouter();

// Handler для BackButton
let backButtonHandler: (() => void) | null = null;

const profile = ref({
  displayName: '',
  description: '',
  avatarUrl: '',
  phoneNumber: '',
  breakDuration: 15, // Время отдыха после услуги (по умолчанию 15 минут)
  workingDates: {} as Record<string, { start: string; end: string }>,
  location: {
    type: 'fixed' as 'fixed' | 'mobile' | 'both',
    address: {
      text: '',
      coordinates: [55.751244, 37.618423] as [number, number] // Москва по умолчанию
    }
  }
});
const services = ref<any[]>([]);
const categories = ref<any[]>([]); // Категории услуг
const newService = ref({ 
  title: '', 
  description: '', // Описание услуги
  price: 0, 
  duration: 60, 
  currency: 'RUB',
  locationType: 'at_client' as 'at_master' | 'at_client' | 'both', // По умолчанию "выезд" (всегда доступно)
  categoryId: null as number | null, // Категория услуги
  imageFile: null as File | null
});
const loading = ref(true);
const saving = ref(false);
const showAddService = ref(false);

// Для категорий
const showAddCategory = ref(false);
const newCategory = ref({ name: '', imageFile: null as File | null });
const categoryImagePreview = ref<string | null>(null);
const uploadingCategory = ref(false);
const editingCategory = ref<{ id: number; name: string; imageFile: File | null } | null>(null);
const editCategoryImagePreview = ref<string | null>(null);

// Для редактирования услуги
const editingService = ref<{ id: number; title: string; description: string; price: number; duration: number; currency: string; locationType: 'at_master' | 'at_client' | 'both'; categoryId: number | null; imageFile: File | null } | null>(null);
const editServiceImagePreview = ref<string | null>(null);

// Для аватара
const avatarFile = ref<File | null>(null);
const avatarPreview = ref<string | null>(null);
const uploadingAvatar = ref(false);

// Для превью изображения новой услуги
const serviceImagePreview = ref<string | null>(null);

// Для календаря
const currentMonth = ref(new Date());
const selectedDates = ref<Set<string>>(new Set());
const workingTime = ref({ start: '09:00', end: '18:00' });
const showVacationModal = ref(false);
const vacationStart = ref('');
const vacationEnd = ref('');

// Для карты
const showMap = ref(false);
const addressInput = ref('');
const mapCoordinates = ref<[number, number]>([55.751244, 37.618423]);

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

// Открыть модальное окно для выбора отпуска
const openVacationModal = () => {
  const today = new Date().toISOString().split('T')[0];
  vacationStart.value = today || '';
  vacationEnd.value = today || '';
  showVacationModal.value = true;
};

// Отметить выходные/отпуск
const markVacation = () => {
  if (!vacationStart.value || !vacationEnd.value) {
    alert('Укажите начало и конец периода');
    return;
  }
  
  const start = new Date(vacationStart.value);
  const end = new Date(vacationEnd.value);
  
  if (start > end) {
    alert('Дата начала не может быть позже даты окончания');
    return;
  }
  
  // Удаляем все даты в диапазоне
  const newDates = { ...profile.value.workingDates };
  const current = new Date(start);
  let removedCount = 0;
  
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0] || '';
    if (dateStr && newDates[dateStr]) {
      delete newDates[dateStr];
      removedCount++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  profile.value.workingDates = newDates;
  showVacationModal.value = false;
  
  try {
    WebApp.HapticFeedback.notificationOccurred('success');
  } catch {}
  
  alert(`✅ Удалено рабочих дней: ${removedCount}`);
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
    // Скрываем MainButton (он был на Dashboard)
    WebApp.MainButton.hide();
    
    backButtonHandler = () => router.push('/master/dashboard');
    WebApp.BackButton.show();
    WebApp.BackButton.onClick(backButtonHandler);
  } catch {}
  
  try {
    // Загружаем профиль
    const profileRes = await api.get('/master/profile');
    if (profileRes.data.profile) {
      profile.value = {
        displayName: profileRes.data.profile.displayName || '',
        description: profileRes.data.profile.description || '',
        avatarUrl: profileRes.data.profile.avatarUrl || '',
        phoneNumber: profileRes.data.profile.phoneNumber || '',
        breakDuration: profileRes.data.profile.breakDuration ?? 15, // По умолчанию 15 минут
        workingDates: profileRes.data.profile.workingDates || {},
        location: profileRes.data.profile.location || {
          type: 'fixed',
          address: {
            text: '',
            coordinates: [55.751244, 37.618423]
          }
        }
      };
      
      // Инициализируем карту если адрес есть
      if (profile.value.location?.address?.text) {
        addressInput.value = profile.value.location.address.text;
        mapCoordinates.value = profile.value.location.address.coordinates;
      }
    }
    
    // Загружаем услуги
    const servicesRes = await api.get('/master/services');
    services.value = servicesRes.data.services;
    
    // Загружаем категории
    const categoriesRes = await api.get('/master/categories');
    categories.value = categoriesRes.data.categories;
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

// Обработчики для карты и адреса
const onAddressSelect = (data: { address: string; coordinates: [number, number] }) => {
  addressInput.value = data.address;
  mapCoordinates.value = data.coordinates;
  profile.value.location!.address = {
    text: data.address,
    coordinates: data.coordinates
  };
  showMap.value = true;
};

const onMapCoordinatesUpdate = (coords: [number, number]) => {
  mapCoordinates.value = coords;
  profile.value.location!.address!.coordinates = coords;
};

const onMapAddressChanged = (address: string) => {
  addressInput.value = address;
  profile.value.location!.address!.text = address;
};

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

// Обработчики для аватара
const onAvatarSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  
  if (file) {
    if (!file.type.startsWith('image/')) {
      try {
        WebApp.showAlert('Пожалуйста, выберите изображение');
      } catch {
        alert('Пожалуйста, выберите изображение');
      }
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      try {
        WebApp.showAlert('Файл слишком большой (макс. 5MB)');
      } catch {
        alert('Файл слишком большой (макс. 5MB)');
      }
      return;
    }
    
    avatarFile.value = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      avatarPreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const uploadAvatar = async () => {
  if (!avatarFile.value) return;
  
  uploadingAvatar.value = true;
  try {
    const formData = new FormData();
    formData.append('avatar', avatarFile.value);
    
    const res = await api.post('/master/profile/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    profile.value.avatarUrl = res.data.user.masterProfile?.avatarUrl || '';
    avatarFile.value = null;
    avatarPreview.value = null;
    
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
  } catch {
    try {
      WebApp.showAlert('Ошибка загрузки фото');
    } catch {
      alert('Ошибка загрузки фото');
    }
  } finally {
    uploadingAvatar.value = false;
  }
};

const deleteAvatar = async () => {
  const confirmed = confirm('Удалить фото профиля?');
  if (!confirmed) return;
  
  try {
    await api.delete('/master/profile/avatar');
    profile.value.avatarUrl = '';
    avatarFile.value = null;
    avatarPreview.value = null;
    
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
  } catch {
    try {
      WebApp.showAlert('Ошибка удаления фото');
    } catch {
      alert('Ошибка удаления фото');
    }
  }
};

// Обработчики для изображения услуги
const onServiceImageSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  
  if (file) {
    if (!file.type.startsWith('image/')) {
      try {
        WebApp.showAlert('Пожалуйста, выберите изображение');
      } catch {
        alert('Пожалуйста, выберите изображение');
      }
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      try {
        WebApp.showAlert('Файл слишком большой (макс. 5MB)');
      } catch {
        alert('Файл слишком большой (макс. 5MB)');
      }
      return;
    }
    
    newService.value.imageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      serviceImagePreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const addService = async () => {
  if (!newService.value.title.trim()) return;
  try {
    // Создаем услугу
    const res = await api.post('/master/services', {
      title: newService.value.title,
      description: newService.value.description,
      price: newService.value.price,
      duration: newService.value.duration,
      currency: newService.value.currency,
      locationType: newService.value.locationType,
      categoryId: newService.value.categoryId
    });
    
    const createdService = res.data.service;
    
    // Если есть изображение - загружаем его
    if (newService.value.imageFile) {
      const formData = new FormData();
      formData.append('image', newService.value.imageFile);
      
      try {
        const imgRes = await api.put(`/master/services/${createdService.id}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        createdService.imageUrl = imgRes.data.service.imageUrl;
      } catch (err) {
        console.error('Failed to upload service image:', err);
      }
    }
    
    services.value.push(createdService);
    newService.value = { title: '', description: '', price: 0, duration: 60, currency: 'RUB', locationType: 'at_client', categoryId: null, imageFile: null };
    serviceImagePreview.value = null;
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

const startEditService = (service: any) => {
  editingService.value = {
    id: service.id,
    title: service.title,
    description: service.description || '',
    price: service.price,
    duration: service.duration,
    currency: service.currency,
    locationType: service.locationType,
    categoryId: service.categoryId || null,
    imageFile: null
  };
  editServiceImagePreview.value = service.imageUrl || null;
  showAddService.value = false;
};

const cancelEditService = () => {
  editingService.value = null;
  editServiceImagePreview.value = null;
};

const onEditServiceImageSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  
  if (file) {
    if (!file.type.startsWith('image/')) {
      try {
        WebApp.showAlert('Пожалуйста, выберите изображение');
      } catch {
        alert('Пожалуйста, выберите изображение');
      }
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      try {
        WebApp.showAlert('Файл слишком большой (макс. 5MB)');
      } catch {
        alert('Файл слишком большой (макс. 5MB)');
      }
      return;
    }
    
    if (editingService.value) {
      editingService.value.imageFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        editServiceImagePreview.value = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }
};

const updateService = async () => {
  if (!editingService.value || !editingService.value.title.trim()) return;
  
  try {
    const serviceId = editingService.value.id;
    
    // Обновляем данные услуги
    const res = await api.put(`/master/services/${serviceId}`, {
      title: editingService.value.title,
      description: editingService.value.description,
      price: editingService.value.price,
      duration: editingService.value.duration,
      currency: editingService.value.currency,
      locationType: editingService.value.locationType,
      categoryId: editingService.value.categoryId
    });
    
    let updatedService = res.data.service;
    
    // Если есть новое изображение - загружаем его
    if (editingService.value.imageFile) {
      const formData = new FormData();
      formData.append('image', editingService.value.imageFile);
      
      try {
        const imgRes = await api.put(`/master/services/${serviceId}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        updatedService.imageUrl = imgRes.data.service.imageUrl;
      } catch (err) {
        console.error('Failed to upload service image:', err);
      }
    }
    
    // Обновляем в списке
    const index = services.value.findIndex(s => s.id === serviceId);
    if (index !== -1) {
      services.value[index] = updatedService;
    }
    
    editingService.value = null;
    editServiceImagePreview.value = null;
    
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
  } catch {
    try {
      WebApp.showAlert('Ошибка обновления услуги');
    } catch {
      alert('Ошибка обновления услуги');
    }
  }
};

// === КАТЕГОРИИ УСЛУГ ===

const onCategoryImageSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  
  if (file) {
    if (!file.type.startsWith('image/')) {
      try {
        WebApp.showAlert('Пожалуйста, выберите изображение');
      } catch {
        alert('Пожалуйста, выберите изображение');
      }
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      try {
        WebApp.showAlert('Файл слишком большой (макс. 5MB)');
      } catch {
        alert('Файл слишком большой (макс. 5MB)');
      }
      return;
    }
    
    newCategory.value.imageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      categoryImagePreview.value = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }
};

const addCategory = async () => {
  if (!newCategory.value.name.trim()) return;
  
  uploadingCategory.value = true;
  
  try {
    // Создаем категорию
    const res = await api.post('/master/categories', {
      name: newCategory.value.name
    });
    
    let category = res.data.category;
    
    // Если есть изображение - загружаем его
    if (newCategory.value.imageFile) {
      const formData = new FormData();
      formData.append('image', newCategory.value.imageFile);
      
      try {
        const imgRes = await api.post(`/master/categories/${category.id}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        category.imageUrl = imgRes.data.category.imageUrl;
      } catch (err) {
        console.error('Failed to upload category image:', err);
      }
    }
    
    categories.value.push(category);
    newCategory.value = { name: '', imageFile: null };
    categoryImagePreview.value = null;
    showAddCategory.value = false;
    
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
  } catch {
    try {
      WebApp.showAlert('Ошибка создания категории');
    } catch {
      alert('Ошибка создания категории');
    }
  } finally {
    uploadingCategory.value = false;
  }
};

const deleteCategory = async (id: number) => {
  const confirmed = confirm('Удалить категорию? Услуги останутся без категории.');
  if (!confirmed) return;
  
  try {
    await api.delete(`/master/categories/${id}`);
    categories.value = categories.value.filter(c => c.id !== id);
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

const startEditCategory = (category: any) => {
  editingCategory.value = {
    id: category.id,
    name: category.name,
    imageFile: null
  };
  editCategoryImagePreview.value = category.imageUrl || null;
  showAddCategory.value = false;
};

const cancelEditCategory = () => {
  editingCategory.value = null;
  editCategoryImagePreview.value = null;
};

const onEditCategoryImageSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  
  if (file) {
    if (!file.type.startsWith('image/')) {
      try {
        WebApp.showAlert('Пожалуйста, выберите изображение');
      } catch {
        alert('Пожалуйста, выберите изображение');
      }
      return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
      try {
        WebApp.showAlert('Файл слишком большой (макс. 5MB)');
      } catch {
        alert('Файл слишком большой (макс. 5MB)');
      }
      return;
    }
    
    if (editingCategory.value) {
      editingCategory.value.imageFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        editCategoryImagePreview.value = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  }
};

const updateCategory = async () => {
  if (!editingCategory.value || !editingCategory.value.name.trim()) return;
  
  try {
    const categoryId = editingCategory.value.id;
    
    // Обновляем данные категории
    const res = await api.put(`/master/categories/${categoryId}`, {
      name: editingCategory.value.name
    });
    
    let updatedCategory = res.data.category;
    
    // Если есть новое изображение - загружаем его
    if (editingCategory.value.imageFile) {
      const formData = new FormData();
      formData.append('image', editingCategory.value.imageFile);
      
      try {
        const imgRes = await api.post(`/master/categories/${categoryId}/image`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        updatedCategory.imageUrl = imgRes.data.category.imageUrl;
      } catch (err) {
        console.error('Failed to upload category image:', err);
      }
    }
    
    // Обновляем в списке
    const index = categories.value.findIndex(c => c.id === categoryId);
    if (index !== -1) {
      categories.value[index] = updatedCategory;
    }
    
    editingCategory.value = null;
    editCategoryImagePreview.value = null;
    
    try {
      WebApp.HapticFeedback.notificationOccurred('success');
    } catch {}
  } catch {
    try {
      WebApp.showAlert('Ошибка обновления категории');
    } catch {
      alert('Ошибка обновления категории');
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
        <!-- Avatar Upload -->
        <div>
          <label class="text-xs text-tg-hint mb-1.5 block">Фото профиля</label>
          <div class="flex items-center gap-3">
            <div class="relative">
              <div 
                v-if="avatarPreview || profile.avatarUrl" 
                class="w-20 h-20 rounded-xl overflow-hidden bg-tg-bg"
              >
                <img 
                  :src="avatarPreview || profile.avatarUrl" 
                  alt="Avatar" 
                  class="w-full h-full object-cover"
                />
              </div>
              <div 
                v-else 
                class="w-20 h-20 rounded-xl bg-tg-bg flex items-center justify-center"
              >
                <svg class="w-8 h-8 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
            </div>
            
            <div class="flex-1 flex flex-col gap-2">
              <label class="btn bg-accent/15 text-accent text-sm py-2 cursor-pointer">
                <svg class="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Выбрать фото
                <input 
                  type="file" 
                  accept="image/*" 
                  class="hidden" 
                  @change="onAvatarSelect"
                />
              </label>
              
              <div class="flex gap-2">
                <button 
                  v-if="avatarFile"
                  @click="uploadAvatar"
                  :disabled="uploadingAvatar"
                  class="flex-1 btn bg-success text-white text-sm py-2"
                >
                  <svg v-if="uploadingAvatar" class="w-4 h-4 animate-spin inline" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                  {{ uploadingAvatar ? 'Загрузка...' : 'Загрузить' }}
                </button>
                
                <button 
                  v-if="profile.avatarUrl && !avatarFile"
                  @click="deleteAvatar"
                  class="btn bg-danger/15 text-danger text-sm py-2 px-3"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <p class="text-xs text-tg-hint mt-1.5">Максимум 5MB, форматы: JPG, PNG, WEBP</p>
        </div>

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
        <div>
          <label class="text-xs text-tg-hint mb-1.5 block">Номер телефона</label>
          <input 
            v-model="profile.phoneNumber" 
            type="tel"
            placeholder="+7 (999) 123-45-67"
            class="w-full p-3 rounded-xl"
          />
          <p class="text-xs text-tg-hint mt-1.5">Для связи с клиентами</p>
        </div>

        <div>
          <label class="text-xs text-tg-hint mb-1.5 block">Время отдыха после услуги</label>
          <select 
            v-model.number="profile.breakDuration" 
            class="w-full p-3 rounded-xl"
          >
            <option :value="0">Без перерыва</option>
            <option :value="5">5 минут</option>
            <option :value="10">10 минут</option>
            <option :value="15">15 минут</option>
            <option :value="20">20 минут</option>
            <option :value="30">30 минут</option>
            <option :value="45">45 минут</option>
            <option :value="60">1 час</option>
          </select>
          <p class="text-xs text-tg-hint mt-1.5">
            Буфер времени между записями для отдыха и подготовки
          </p>
        </div>
      </div>
    </div>

    <!-- Location Section -->
    <div class="card mb-4">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center">
          <svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div>
          <h2 class="font-semibold">Местоположение</h2>
          <p class="text-xs text-tg-hint">Где вы работаете</p>
        </div>
      </div>

      <!-- Location Type -->
      <div class="space-y-3 mb-4">
        <label class="text-xs text-tg-hint mb-2 block">Тип работы</label>
        
        <div class="space-y-2">
          <label class="flex items-center gap-3 p-3 rounded-xl border border-tg-hint/20 cursor-pointer transition-colors"
                 :class="profile.location?.type === 'fixed' ? 'border-accent bg-accent/5' : ''">
            <input 
              type="radio" 
              v-model="profile.location!.type" 
              value="fixed"
              class="w-4 h-4 text-accent"
            />
            <div class="flex-1">
              <div class="font-medium text-sm">Принимаю у себя</div>
              <div class="text-xs text-tg-hint">Клиент приходит к вам</div>
            </div>
          </label>

          <label class="flex items-center gap-3 p-3 rounded-xl border border-tg-hint/20 cursor-pointer transition-colors"
                 :class="profile.location?.type === 'mobile' ? 'border-accent bg-accent/5' : ''">
            <input 
              type="radio" 
              v-model="profile.location!.type" 
              value="mobile"
              class="w-4 h-4 text-accent"
            />
            <div class="flex-1">
              <div class="font-medium text-sm">Выезжаю к клиенту</div>
              <div class="text-xs text-tg-hint">Вы едете на адрес клиента</div>
            </div>
          </label>

          <label class="flex items-center gap-3 p-3 rounded-xl border border-tg-hint/20 cursor-pointer transition-colors"
                 :class="profile.location?.type === 'both' ? 'border-accent bg-accent/5' : ''">
            <input 
              type="radio" 
              v-model="profile.location!.type" 
              value="both"
              class="w-4 h-4 text-accent"
            />
            <div class="flex-1">
              <div class="font-medium text-sm">Оба варианта</div>
              <div class="text-xs text-tg-hint">Можете принять и выехать</div>
            </div>
          </label>
        </div>
      </div>

      <!-- Address Input (if fixed or both) -->
      <div v-if="profile.location?.type === 'fixed' || profile.location?.type === 'both'" class="space-y-3">
        <label class="text-xs text-tg-hint mb-2 block">Ваш адрес</label>
        
        <ProxyAddressSearch
          v-model="addressInput"
          placeholder="Начните вводить адрес..."
          @select="onAddressSelect"
        />

        <!-- Map -->
        <div v-if="showMap || profile.location?.address?.text" class="mt-3">
          <YandexMap
            :coordinates="mapCoordinates"
            :draggable="true"
            height="250px"
            @update:coordinates="onMapCoordinatesUpdate"
            @address-changed="onMapAddressChanged"
          />
          <p class="text-xs text-tg-hint mt-2">
            💡 Перетащите маркер для точного указания места
          </p>
        </div>
      </div>

      <div v-if="profile.location?.type === 'mobile'" class="p-3 bg-blue-500/10 rounded-xl">
        <p class="text-xs text-tg-hint">
          📍 Клиент укажет адрес при записи
        </p>
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
        class="w-full mb-3 btn bg-accent/15 text-accent text-sm py-2.5"
      >
        <svg class="w-4 h-4 inline mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Заполнить Пн-Пт на 2 месяца
      </button>
      
      <!-- Vacation/Days Off Button -->
      <button 
        @click="openVacationModal"
        class="w-full mb-4 btn bg-blue-500/15 text-blue-500 text-sm py-2.5"
      >
        <svg class="w-4 h-4 inline mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Отметить отпуск/выходные
      </button>

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

    <!-- Categories Section -->
    <div class="card mb-4">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
            <svg class="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          <div>
            <h2 class="font-semibold">Категории услуг</h2>
            <p class="text-xs text-tg-hint">Группировка для удобства клиентов</p>
          </div>
        </div>
        <button 
          v-if="!editingCategory"
          @click="showAddCategory = !showAddCategory"
          class="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center transition-transform"
          :class="{ 'rotate-45': showAddCategory }"
        >
          <svg class="w-5 h-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      <!-- Add Category Form -->
      <transition name="slide">
        <div v-if="showAddCategory" class="mb-4 p-3 rounded-xl bg-tg-bg">
          <div>
            <label class="text-xs text-tg-hint mb-1.5 block">Название</label>
            <input 
              v-model="newCategory.name" 
              placeholder="Например: Ногтевой сервис"
              class="w-full p-3 rounded-xl mb-3"
            />
          </div>
          
          <div class="mb-3">
            <label class="text-xs text-tg-hint mb-1.5 block">Изображение (опционально)</label>
            <div v-if="categoryImagePreview" class="mb-2">
              <div class="relative w-full h-40 rounded-xl overflow-hidden bg-tg-secondary-bg">
                <img 
                  :src="categoryImagePreview" 
                  class="w-full h-full object-cover" 
                />
                <button 
                  @click="categoryImagePreview = null; newCategory.imageFile = null"
                  class="absolute top-2 right-2 w-8 h-8 rounded-lg bg-danger/90 flex items-center justify-center text-white"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <label class="btn bg-purple-500/15 text-purple-500 text-sm py-2 cursor-pointer w-full">
              <svg class="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Выбрать изображение
              <input type="file" accept="image/*" class="hidden" @change="onCategoryImageSelect" />
            </label>
          </div>

          <div class="flex gap-2">
            <button 
              @click="addCategory"
              :disabled="!newCategory.name.trim() || uploadingCategory"
              class="flex-1 btn btn-accent"
            >
              {{ uploadingCategory ? 'Создание...' : 'Создать' }}
            </button>
            <button 
              @click="showAddCategory = false; newCategory = { name: '', imageFile: null }; categoryImagePreview = null"
              class="btn bg-tg-secondary-bg"
            >
              Отмена
            </button>
          </div>
        </div>
      </transition>

      <!-- Edit Category Form -->
      <transition name="slide">
        <div v-if="editingCategory" class="mb-4 p-3 rounded-xl bg-tg-bg">
          <div>
            <label class="text-xs text-tg-hint mb-1.5 block">Название</label>
            <input 
              v-model="editingCategory.name" 
              class="w-full p-3 rounded-xl mb-3"
            />
          </div>
          
          <div class="mb-3">
            <label class="text-xs text-tg-hint mb-1.5 block">Изображение</label>
            <div v-if="editCategoryImagePreview" class="mb-2">
              <div class="relative w-full h-40 rounded-xl overflow-hidden bg-tg-secondary-bg">
                <img 
                  :src="editCategoryImagePreview" 
                  class="w-full h-full object-cover" 
                />
                <button 
                  @click="editCategoryImagePreview = null; editingCategory!.imageFile = null"
                  class="absolute top-2 right-2 w-8 h-8 rounded-lg bg-danger/90 flex items-center justify-center text-white"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <label class="btn bg-purple-500/15 text-purple-500 text-sm py-2 cursor-pointer w-full">
              <svg class="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Изменить изображение
              <input type="file" accept="image/*" class="hidden" @change="onEditCategoryImageSelect" />
            </label>
          </div>

          <div class="flex gap-2">
            <button 
              @click="updateCategory"
              :disabled="!editingCategory.name.trim()"
              class="flex-1 btn btn-accent"
            >
              Сохранить
            </button>
            <button 
              @click="cancelEditCategory"
              class="btn bg-tg-secondary-bg"
            >
              Отмена
            </button>
          </div>
        </div>
      </transition>

      <!-- Categories List -->
      <div v-if="categories.length > 0" class="space-y-2">
        <div 
          v-for="category in categories" 
          :key="category.id"
          class="flex items-center gap-3 p-3 rounded-xl bg-tg-secondary-bg"
        >
          <div v-if="category.imageUrl" class="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
            <img :src="category.imageUrl" class="w-full h-full object-cover" />
          </div>
          <div v-else class="w-12 h-12 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
            <svg class="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div>
          
          <div class="flex-1">
            <h3 class="font-medium">{{ category.name }}</h3>
          </div>
          
          <div class="flex gap-2">
            <button 
              @click="startEditCategory(category)"
              class="p-2 rounded-lg bg-blue-500/10 text-blue-500"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button 
              @click="deleteCategory(category.id)"
              class="p-2 rounded-lg bg-danger/10 text-danger"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <p v-else class="text-sm text-tg-hint text-center py-4">
        Категории помогают клиентам быстрее найти нужную услугу
      </p>
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
          <!-- Service Image Upload -->
          <div class="mb-3">
            <label class="text-xs text-tg-hint mb-1.5 block">Фото услуги</label>
            <div v-if="serviceImagePreview" class="mb-2">
              <div class="relative w-full h-40 rounded-xl overflow-hidden bg-tg-secondary-bg">
                <img 
                  :src="serviceImagePreview" 
                  alt="Service preview" 
                  class="w-full h-full object-cover"
                />
                <button 
                  @click="serviceImagePreview = null; newService.imageFile = null"
                  class="absolute top-2 right-2 w-8 h-8 rounded-lg bg-danger/90 flex items-center justify-center text-white"
                >
                  <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <label class="btn bg-accent/15 text-accent text-sm py-2 cursor-pointer w-full">
              <svg class="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {{ serviceImagePreview ? 'Изменить фото' : 'Добавить фото' }}
              <input 
                type="file" 
                accept="image/*" 
                class="hidden" 
                @change="onServiceImageSelect"
              />
            </label>
          </div>

          <input 
            v-model="newService.title" 
            placeholder="Название услуги" 
            class="w-full p-3 rounded-xl mb-2"
          />
          
          <!-- Description -->
          <textarea
            v-model="newService.description"
            placeholder="Описание услуги (опционально)"
            rows="3"
            class="w-full p-3 rounded-xl mb-2 resize-none"
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
          
          <!-- Category Selection -->
          <div v-if="categories.length > 0" class="mb-3">
            <label class="text-xs text-tg-hint mb-2 block">Категория (опционально)</label>
            <select 
              v-model="newService.categoryId"
              class="w-full p-3 rounded-xl"
            >
              <option :value="null">Без категории</option>
              <option 
                v-for="category in categories" 
                :key="category.id" 
                :value="category.id"
              >
                {{ category.name }}
              </option>
            </select>
          </div>
          
          <!-- Location Type -->
          <div class="mb-3">
            <label class="text-xs text-tg-hint mb-2 block">Где оказывается услуга?</label>
            
            <!-- Если адрес НЕ настроен - показываем подсказку -->
            <div v-if="!profile.location?.address?.text" class="p-3 bg-yellow-500/10 rounded-xl mb-2">
              <p class="text-xs text-yellow-600">
                💡 Укажите адрес выше, чтобы выбрать "У мастера"
              </p>
            </div>
            
            <div class="space-y-2">
              <label 
                :class="[
                  'flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg transition-colors',
                  !profile.location?.address?.text ? 'opacity-50 cursor-not-allowed' : ''
                ]"
              >
                <input 
                  type="radio" 
                  v-model="newService.locationType" 
                  value="at_master"
                  :disabled="!profile.location?.address?.text"
                  class="w-4 h-4"
                />
                <span>У мастера {{ profile.location?.address?.text ? '📍' : '(настройте адрес)' }}</span>
              </label>
              
              <label class="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg transition-colors">
                <input 
                  type="radio" 
                  v-model="newService.locationType" 
                  value="at_client"
                  class="w-4 h-4"
                />
                <span>У клиента (выезд) 🚗</span>
              </label>
              
              <label 
                v-if="profile.location?.address?.text" 
                class="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg transition-colors"
              >
                <input 
                  type="radio" 
                  v-model="newService.locationType" 
                  value="both"
                  class="w-4 h-4"
                />
                <span>Оба варианта</span>
              </label>
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
        <!-- Edit Service Form -->
        <transition name="slide">
          <div v-if="editingService" class="mb-4 p-3 rounded-xl bg-accent/10 border border-accent/20">
            <div class="flex items-center justify-between mb-3">
              <h3 class="font-semibold text-accent">Редактирование услуги</h3>
              <button 
                @click="cancelEditService"
                class="text-xs btn bg-tg-bg text-tg-hint py-1.5 px-3"
              >
                Отмена
              </button>
            </div>

            <!-- Edit Service Image Upload -->
            <div class="mb-3">
              <label class="text-xs text-tg-hint mb-1.5 block">Фото услуги</label>
              <div v-if="editServiceImagePreview" class="mb-2">
                <div class="relative w-full h-40 rounded-xl overflow-hidden bg-tg-secondary-bg">
                  <img 
                    :src="editServiceImagePreview" 
                    alt="Service preview" 
                    class="w-full h-full object-cover"
                  />
                  <button 
                    @click="editServiceImagePreview = null; editingService.imageFile = null"
                    class="absolute top-2 right-2 w-8 h-8 rounded-lg bg-danger/90 flex items-center justify-center text-white"
                  >
                    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <label class="btn bg-accent/15 text-accent text-sm py-2 cursor-pointer w-full">
                <svg class="w-4 h-4 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {{ editServiceImagePreview ? 'Изменить фото' : 'Добавить фото' }}
                <input 
                  type="file" 
                  accept="image/*" 
                  class="hidden" 
                  @change="onEditServiceImageSelect"
                />
              </label>
            </div>

            <input 
              v-model="editingService.title" 
              placeholder="Название услуги" 
              class="w-full p-3 rounded-xl mb-2"
            />
            
            <!-- Description for Edit -->
            <textarea
              v-model="editingService.description"
              placeholder="Описание услуги (опционально)"
              rows="3"
              class="w-full p-3 rounded-xl mb-2 resize-none"
            />
            
            <div class="grid grid-cols-2 gap-2 mb-3">
              <div class="relative">
                <input 
                  v-model="editingService.price" 
                  type="number" 
                  placeholder="Цена"
                  class="w-full p-3 rounded-xl pr-10"
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-tg-hint text-sm">₽</span>
              </div>
              <div class="relative">
                <input 
                  v-model="editingService.duration" 
                  type="number" 
                  placeholder="Время"
                  class="w-full p-3 rounded-xl pr-12"
                />
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-tg-hint text-sm">мин</span>
              </div>
            </div>
            
            <!-- Category Selection for Edit -->
            <div v-if="categories.length > 0" class="mb-3">
              <label class="text-xs text-tg-hint mb-2 block">Категория (опционально)</label>
              <select 
                v-model="editingService.categoryId"
                class="w-full p-3 rounded-xl"
              >
                <option :value="null">Без категории</option>
                <option 
                  v-for="category in categories" 
                  :key="category.id" 
                  :value="category.id"
                >
                  {{ category.name }}
                </option>
              </select>
            </div>
            
            <!-- Location Type for Edit -->
            <div class="mb-3">
              <label class="text-xs text-tg-hint mb-2 block">Где оказывается услуга?</label>
              <div class="space-y-2">
                <label 
                  :class="[
                    'flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg transition-colors',
                    !profile.location?.address?.text ? 'opacity-50 cursor-not-allowed' : ''
                  ]"
                >
                  <input 
                    type="radio" 
                    v-model="editingService.locationType" 
                    value="at_master"
                    :disabled="!profile.location?.address?.text"
                    class="w-4 h-4"
                  />
                  <span>У мастера {{ profile.location?.address?.text ? '📍' : '(настройте адрес)' }}</span>
                </label>
                
                <label class="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg transition-colors">
                  <input 
                    type="radio" 
                    v-model="editingService.locationType" 
                    value="at_client"
                    class="w-4 h-4"
                  />
                  <span>У клиента (выезд) 🚗</span>
                </label>
                
                <label 
                  v-if="profile.location?.address?.text" 
                  class="flex items-center gap-2 text-sm cursor-pointer p-2 rounded-lg transition-colors"
                >
                  <input 
                    type="radio" 
                    v-model="editingService.locationType" 
                    value="both"
                    class="w-4 h-4"
                  />
                  <span>Оба варианта</span>
                </label>
              </div>
            </div>
            
            <button 
              @click="updateService" 
              :disabled="!editingService.title.trim()"
              class="w-full btn bg-accent text-white disabled:opacity-50"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              Сохранить изменения
            </button>
          </div>
        </transition>

        <div 
          v-for="s in services" 
          :key="s.id" 
          class="flex items-center gap-3 p-3 rounded-xl bg-tg-bg group"
        >
          <!-- Service Image -->
          <div 
            v-if="s.imageUrl" 
            class="w-16 h-16 rounded-lg overflow-hidden bg-tg-secondary-bg shrink-0"
          >
            <img 
              :src="s.imageUrl" 
              :alt="s.title" 
              class="w-full h-full object-cover"
            />
          </div>
          <div 
            v-else 
            class="w-16 h-16 rounded-lg bg-tg-secondary-bg flex items-center justify-center shrink-0"
          >
            <svg class="w-6 h-6 text-tg-hint" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>

          <div class="flex-1 min-w-0">
            <div class="font-medium truncate">{{ s.title }}</div>
            <div class="text-xs text-tg-hint">
              {{ s.price }} {{ s.currency }} • {{ s.duration }} мин
            </div>
          </div>
          
          <button 
            @click="startEditService(s)" 
            class="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center"
          >
            <svg class="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          
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
  
  <!-- Vacation Modal -->
  <div 
    v-if="showVacationModal"
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    @click.self="showVacationModal = false"
  >
    <div class="card max-w-md w-full animate-scale-in">
      <h3 class="text-lg font-bold mb-4">Отметить отпуск/выходные</h3>
      <p class="text-sm text-tg-hint mb-4">
        Выберите период, в который вы НЕ работаете. Все рабочие дни в этом периоде будут удалены.
      </p>
      
      <div class="space-y-3 mb-4">
        <div>
          <label class="text-sm font-medium mb-1.5 block">Начало периода</label>
          <input 
            type="date"
            v-model="vacationStart"
            class="w-full p-3 rounded-xl bg-tg-bg"
          />
        </div>
        
        <div>
          <label class="text-sm font-medium mb-1.5 block">Конец периода</label>
          <input 
            type="date"
            v-model="vacationEnd"
            class="w-full p-3 rounded-xl bg-tg-bg"
          />
        </div>
      </div>
      
      <div class="flex gap-2">
        <button
          @click="markVacation"
          class="flex-1 btn btn-primary text-sm py-2.5"
        >
          Удалить дни
        </button>
        <button
          @click="showVacationModal = false"
          class="flex-1 btn btn-secondary text-sm py-2.5"
        >
          Отмена
        </button>
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
