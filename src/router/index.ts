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

export default router

