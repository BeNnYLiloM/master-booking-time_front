import { createRouter, createWebHistory } from 'vue-router'
import { debugHelper } from '../utils/debugHelper'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('../views/Home.vue')
    },
    {
      path: '/master/profile',
      name: 'MasterProfile',
      component: () => import('../views/master/Profile.vue')
    },
    {
        path: '/master/dashboard',
        name: 'MasterDashboard',
        component: () => import('../views/master/Dashboard.vue')
    },
    {
      path: '/booking/:masterId',
      name: 'Booking',
      component: () => import('../views/client/Booking.vue')
    },
    {
      path: '/client/appointments',
      name: 'ClientAppointments',
      component: () => import('../views/client/Appointments.vue')
    }
  ]
})

// Навигационный guard для предотвращения повторной авторизации
router.beforeEach((to, from, next) => {
  debugHelper.log('info', `[Router] Навигация: ${from.path} → ${to.path}`);
  
  // Если идем на Home, но пришли с другой страницы (не первый вход)
  // и роль уже есть - перенаправляем сразу на нужную страницу
  if (to.path === '/' && from.path !== '/') {
    const userRole = localStorage.getItem('userRole');
    
    if (userRole) {
      debugHelper.log('info', `[Router] Redirect к ${userRole === 'master' ? 'dashboard' : 'appointments'}`);
      // Уже авторизованы - перенаправляем на нужную страницу
      if (userRole === 'master') {
        next('/master/dashboard');
      } else {
        next('/client/appointments');
      }
      return;
    }
  }
  
  next();
});

export default router

