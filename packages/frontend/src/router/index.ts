import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('../views/Home.vue') },
    { path: '/login', component: () => import('../views/Login.vue') },
    { path: '/problems', component: () => import('../views/ProblemList.vue') },
    { path: '/problems/:id', component: () => import('../views/ProblemDetail.vue') },
    { path: '/leaderboard', component: () => import('../views/Leaderboard.vue') },
    { path: '/contests', component: () => import('../views/Contests.vue') },
    { path: '/problem-lists', component: () => import('../views/ProblemLists.vue'), meta: { requiresAuth: true } },
    { path: '/profile', component: () => import('../views/Profile.vue'), meta: { requiresAuth: true } },
    { path: '/external/accounts', component: () => import('../views/external/AccountBind.vue'), meta: { requiresAuth: true } },
    // 教师
    { path: '/teacher/classes', component: () => import('../views/teacher/ClassManage.vue') },
    // 管理员
    { path: '/admin/create-problem', component: () => import('../views/admin/CreateProblem.vue') },
    { path: '/admin/users', component: () => import('../views/admin/UserManage.vue') },
  ],
});

router.beforeEach(async (to) => {
  if (!to.matched.some((record) => record.meta.requiresAuth)) return true;

  const auth = useAuthStore();
  if (auth.token && !auth.user) await auth.fetchProfile();
  if (auth.isLoggedIn()) return true;

  return {
    path: '/login',
    query: { redirect: to.fullPath },
  };
});

export default router;
