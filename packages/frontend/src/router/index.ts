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
    { path: '/admin/import', component: () => import('../views/ImportProblems.vue') },
    { path: '/admin/create-problem', component: () => import('../views/admin/CreateProblem.vue') },
    { path: '/profile', component: () => import('../views/Profile.vue') },
  ],
});

export default router;
