import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: () => import('../views/Home.vue'),
    },
    {
      path: '/login',
      component: () => import('../views/Login.vue'),
    },
    {
      path: '/problems',
      component: () => import('../views/ProblemList.vue'),
    },
    {
      path: '/problems/:id',
      component: () => import('../views/ProblemDetail.vue'),
    },
    {
      path: '/submissions',
      component: () => import('../views/SubmissionList.vue'),
    },
    {
      path: '/submissions/:id',
      component: () => import('../views/SubmissionDetail.vue'),
    },
  ],
});

export default router;
