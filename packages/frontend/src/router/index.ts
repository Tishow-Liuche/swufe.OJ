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
    { path: '/community', component: () => import('../views/CommunityHub.vue'), meta: { requiresAuth: true } },
    { path: '/problem-lists', component: () => import('../views/ProblemLists.vue'), meta: { requiresAuth: true } },
    { path: '/learning-plans/:id', component: () => import('../views/LearningPlanDetail.vue'), meta: { requiresAuth: true } },
    { path: '/check-in', component: () => import('../views/CheckIn.vue'), meta: { requiresAuth: true } },
    { path: '/profile', component: () => import('../views/Profile.vue'), meta: { requiresAuth: true } },
    { path: '/messages', component: () => import('../views/Messages.vue'), meta: { requiresAuth: true } },
    { path: '/notifications', component: () => import('../views/Notifications.vue'), meta: { requiresAuth: true } },
    { path: '/classes', component: () => import('../views/StudentClasses.vue'), meta: { requiresAuth: true, requiresStudent: true } },
    { path: '/classes/:classId/assignments', component: () => import('../views/StudentClassAssignments.vue'), meta: { requiresAuth: true, requiresStudent: true } },
    { path: '/change-password', component: () => import('../views/ChangePassword.vue'), meta: { requiresAuth: true } },
    { path: '/external/accounts', component: () => import('../views/external/AccountBind.vue'), meta: { requiresAuth: true } },
    // 教师
    { path: '/teacher/classes', component: () => import('../views/teacher/ClassManage.vue'), meta: { requiresAuth: true, requiresTeacher: true } },
    // 管理员
    { path: '/admin/create-problem', component: () => import('../views/admin/CreateProblem.vue'), meta: { requiresAuth: true, requiresTeacher: true } },
    { path: '/admin/problems/history', component: () => import('../views/admin/ProblemHistory.vue'), meta: { requiresAuth: true, requiresTeacher: true } },
    { path: '/admin/problems/:id/edit', component: () => import('../views/admin/EditProblem.vue'), meta: { requiresAuth: true, requiresTeacher: true } },
    { path: '/admin/import-atcoder', component: () => import('../views/admin/AtCoderImport.vue'), meta: { requiresAuth: true, requiresTeacher: true } },
    { path: '/admin/users', component: () => import('../views/admin/UserManage.vue'), meta: { requiresAuth: true, requiresAdmin: true } },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);

  if (requiresAuth && !auth.isLoggedIn()) {
    await auth.restoreSession();
  }

  if (requiresAuth && !auth.isLoggedIn()) {
    return {
      path: '/login',
      query: { redirect: to.fullPath },
    };
  }

  if (auth.user?.mustChangePassword && to.path !== '/change-password') {
    return { path: '/change-password', query: { redirect: to.fullPath } };
  }

  if (requiresAuth && to.meta.requiresTeacher && !auth.isTeacher()) return '/problems';
  if (requiresAuth && to.meta.requiresStudent && !auth.isStudent()) return '/problems';
  if (requiresAuth && to.meta.requiresAdmin && !auth.isAdmin()) return '/problems';

  return true;
});

export default router;
