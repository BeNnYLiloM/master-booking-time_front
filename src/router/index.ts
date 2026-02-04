import { createRouter, createWebHistory } from 'vue-router'

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
  // Если идем на Home, но пришли с другой страницы (не первый вход)
  // и роль уже есть - перенаправляем сразу на нужную страницу
  if (to.path === '/' && from.path !== '/') {
    const userRole = localStorage.getItem('userRole');
    
    if (userRole) {
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

