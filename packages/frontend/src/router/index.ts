import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('../views/Home.vue') },
    { path: '/login', component: () => import('../views/Login.vue') },
    { path: '/problems', component: () => import('../views/ProblemList.vue') },
    { path: '/problems/:id', component: () => import('../views/ProblemDetail.vue') },
    { path: '/leaderboard', component: () => import('../views/Leaderboard.vue') },
    { path: '/contests', component: () => import('../views/Contests.vue') },
    { path: '/problem-lists', component: () => import('../views/ProblemLists.vue') },
    { path: '/profile', component: () => import('../views/Profile.vue') },
    { path: '/external/accounts', component: () => import('../views/external/AccountBind.vue') },
    // 教师
    { path: '/teacher/classes', component: () => import('../views/teacher/ClassManage.vue') },
    // 管理员
    { path: '/admin/create-problem', component: () => import('../views/admin/CreateProblem.vue') },
    { path: '/admin/users', component: () => import('../views/admin/UserManage.vue') },
  ],
});

export default router;
