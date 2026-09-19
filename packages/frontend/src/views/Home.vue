<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  CalendarDays,
  Layers3,
  ListChecks,
  UserRound,
  UsersRound,
} from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import api from '../api/client';
import { resolveQuickStartProblem } from '../utils/quick-start';

const router = useRouter();
const auth = useAuthStore();
const stats = ref({ problemCount: 0, submissionCount: 0, userCount: 0 });
const openingQuickStart = ref('');
const quickStartProblems = [
  { number: '01', remoteProblemId: 'P1001', title: '入门题 P1001', description: 'A+B Problem — 第一个程序' },
  { number: '02', remoteProblemId: 'P1007', title: '思维题 P1007', description: '独木桥 — 相遇转身等价直接穿过' },
  { number: '03', remoteProblemId: 'P1003', title: '模拟题 P1003', description: '铺地毯 — NOIP 提高组真题' },
];

function openAuthenticated(path: string) {
  if (auth.isLoggedIn()) {
    void router.push(path);
    return;
  }

  void router.push({ path: '/login', query: { redirect: path } });
}

function openProblemLibrary() {
  openAuthenticated('/problems');
}

async function openQuickStartProblem(remoteProblemId: string) {
  if (openingQuickStart.value) return;
  openingQuickStart.value = remoteProblemId;
  try {
    const { data } = await api.get('/api/problems', {
      params: { source: 'LUOGU', keyword: remoteProblemId, page: 1, pageSize: 100 },
    });
    const problem = resolveQuickStartProblem(data.items || [], remoteProblemId);
    if (problem) {
      await router.push(`/problems/${problem.id}`);
      return;
    }
  } catch {
    // Fall through to the searchable problem library.
  } finally {
    openingQuickStart.value = '';
  }
  await router.push({ path: '/problems', query: { source: 'LUOGU', keyword: remoteProblemId } });
}

onMounted(async () => {
  try {
    const res = await fetch('/api/stats');
    stats.value = await res.json();
  } catch (e) { /* ignore */ }
});
</script>

<template>
  <div class="home">
    <section class="hero">
      <div class="hero-shell">
        <div class="hero-content">
          <span class="hero-eyebrow">西财奇点OJ</span>
          <h1 class="hero-title">SWUFE <em>Singularity OJ</em></h1>
          <p class="hero-subtitle">西财奇点OJ · 面向程序设计与算法竞赛的在线评测训练平台</p>
          <p class="hero-desc">多源题库 · 实时评测 · 教学管理 · 能力分析 · 竞赛训练</p>
          <div class="hero-actions">
            <button class="btn-primary" @click="openProblemLibrary">进入题库 <ArrowRight :size="18" aria-hidden="true" /></button>
            <button v-if="!auth.isLoggedIn()" class="btn-outline" @click="router.push('/login')">登录 / 注册</button>
            <button v-else class="btn-outline" @click="openAuthenticated('/profile')">个人中心</button>
          </div>
          <div class="hero-stats">
            <div class="stat-bubble">
              <span class="stat-num">{{ stats.problemCount }}</span>
              <span class="stat-txt">道题目</span>
            </div>
            <div class="stat-bubble">
              <span class="stat-num">{{ stats.submissionCount }}</span>
              <span class="stat-txt">次提交</span>
            </div>
            <div class="stat-bubble">
              <span class="stat-num">{{ stats.userCount }}</span>
              <span class="stat-txt">位用户</span>
            </div>
          </div>
        </div>

      </div>
    </section>

    <section class="features" aria-labelledby="feature-heading">
      <div class="section-heading">
        <div>
          <span class="section-kicker">学习空间</span>
          <h2 id="feature-heading">从一道题，开始今天的训练</h2>
        </div>
        <p>题目练习、数据反馈与赛事训练集中在同一个学习空间。</p>
      </div>

      <div class="feature-showcase-grid">
        <button type="button" class="feature-banner problem-banner" @click="openProblemLibrary">
          <span class="banner-copy">
            <span class="banner-kicker"><BookOpenCheck :size="18" aria-hidden="true" /> 练习空间</span>
            <strong>题库</strong>
            <span class="banner-divider" aria-hidden="true"></span>
            <span class="banner-description">本地原创与第三方 OJ 题目统一管理，支持搜索、筛选、标签。</span>
            <span class="banner-action">开始练习 <ArrowRight :size="18" aria-hidden="true" /></span>
          </span>
        </button>

        <button type="button" class="feature-banner contest-banner" @click="openAuthenticated('/contests')">
          <span class="banner-copy">
            <span class="banner-kicker">赛事训练</span>
            <strong>比赛</strong>
            <span class="banner-divider" aria-hidden="true"></span>
            <span class="banner-description">查看赛事公告、赛制说明与赛后训练安排，随时准备迎接下一场挑战。</span>
            <span class="banner-action">查看比赛 <ArrowRight :size="18" aria-hidden="true" /></span>
          </span>
        </button>
      </div>

      <div class="utility-grid">
        <button type="button" class="utility-card leaderboard-card" @click="openAuthenticated('/leaderboard')">
          <span class="utility-icon"><BarChart3 :size="24" aria-hidden="true" /></span>
          <span><strong>排行榜</strong><small>查看全站训练排名与解题数据</small></span>
          <ArrowRight :size="18" aria-hidden="true" />
        </button>
        <button type="button" class="utility-card list-card" @click="openAuthenticated('/problem-lists')">
          <span class="utility-icon"><ListChecks :size="24" aria-hidden="true" /></span>
          <span><strong>题单</strong><small>按专题沉淀自己的训练计划</small></span>
          <ArrowRight :size="18" aria-hidden="true" />
        </button>
        <button type="button" class="utility-card profile-card" @click="openAuthenticated('/profile')">
          <span class="utility-icon"><UserRound :size="24" aria-hidden="true" /></span>
          <span><strong>个人中心</strong><small>回顾提交记录与成长轨迹</small></span>
          <ArrowRight :size="18" aria-hidden="true" />
        </button>
      </div>

      <div v-if="auth.isTeacher() || auth.isAdmin()" class="role-tools">
        <button v-if="auth.isTeacher()" type="button" class="role-tool role-tool--classes" @click="router.push('/teacher/classes')">
          <span class="role-tool-icon"><UsersRound :size="20" aria-hidden="true" /></span>
          <span class="role-tool-copy"><strong>班级管理</strong><small>学生与教学空间</small></span>
          <ArrowRight class="role-tool-arrow" :size="18" aria-hidden="true" />
        </button>
        <button v-if="auth.isAdmin()" type="button" class="role-tool role-tool--problems" @click="router.push('/admin/create-problem')">
          <span class="role-tool-icon"><Layers3 :size="20" aria-hidden="true" /></span>
          <span class="role-tool-copy"><strong>录入题目</strong><small>建设平台题库</small></span>
          <ArrowRight class="role-tool-arrow" :size="18" aria-hidden="true" />
        </button>
        <button v-if="auth.isAdmin()" type="button" class="role-tool role-tool--users" @click="router.push('/admin/users')">
          <span class="role-tool-icon"><CalendarDays :size="20" aria-hidden="true" /></span>
          <span class="role-tool-copy"><strong>用户管理</strong><small>维护平台成员</small></span>
          <ArrowRight class="role-tool-arrow" :size="18" aria-hidden="true" />
        </button>
      </div>
    </section>

    <!-- 快速入口 -->
    <section class="quick-links">
      <h2>快速开始</h2>
      <div class="quick-grid">
        <button
          v-for="item in quickStartProblems"
          :key="item.remoteProblemId"
          type="button"
          class="quick-item"
          :disabled="Boolean(openingQuickStart)"
          @click="openQuickStartProblem(item.remoteProblemId)"
        >
          <span class="quick-num">{{ item.number }}</span>
          <span>
            <strong>{{ item.title }}</strong>
            <p>{{ item.description }}</p>
          </span>
        </button>
        <button type="button" class="quick-item" @click="router.push('/admin/create-problem')">
          <span class="quick-num">＋</span>
          <span>
            <strong>创建题目</strong>
            <p>录入原创题目到平台题库</p>
          </span>
        </button>
      </div>
    </section>

    <!-- 页脚 -->
    <footer class="footer">
      <p>SWUFE Singularity OJ · 西财奇点OJ · 多源 OJ 教学与竞赛平台</p>
    </footer>
  </div>
</template>

<style scoped>
.home { max-width: 100%; margin: 0; padding: 0; }

/* Hero */
.hero {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid #dce9ff;
  background:
    radial-gradient(ellipse at 78% 35%, rgba(196, 219, 255, 0.75), transparent 43%),
    radial-gradient(ellipse at 102% 108%, rgba(187, 212, 255, 0.72), transparent 37%),
    radial-gradient(ellipse at -4% 15%, rgba(255, 255, 255, 0.96), transparent 34%),
    linear-gradient(118deg, #f9fcff 0%, #edf5ff 46%, #d7e8ff 100%);
  color: #1d2b45;
  font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
}

.hero-shell {
  position: relative;
  z-index: 1;
  display: grid;
  width: min(1680px, calc(100% - 64px));
  min-height: clamp(500px, 34vw, 660px);
  grid-template-columns: minmax(0, 1fr);
  margin: 0 auto;
}

.hero-content {
  position: relative;
  z-index: 3;
  padding: clamp(84px, 7.2vw, 132px) 0 56px clamp(52px, 8.25vw, 156px);
}

.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #3571d9;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.12em;
}

.hero-title {
  margin: 13px 0 8px;
  color: #1b2b49;
  font-size: clamp(45px, 5.2vw, 62px);
  font-weight: 850;
  letter-spacing: -0.065em;
  line-height: 1.04;
}

.hero-title em {
  color: #2874eb;
  font-style: normal;
}

.hero-subtitle {
  margin: 0;
  color: #33496e;
  font-family: 'Noto Sans SC Variable', sans-serif;
  font-size: 17px;
  font-weight: 540;
  letter-spacing: 0;
}

.hero-desc {
  margin: 11px 0 25px;
  color: #7890b3;
  font-family: 'Noto Sans SC Variable', sans-serif;
  font-size: 12px;
  letter-spacing: 0.01em;
}

.hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }

.btn-primary {
  display: inline-flex;
  min-height: 46px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 27px;
  border: 0;
  border-radius: 7px;
  background: linear-gradient(135deg, #2f7cf2, #2163db);
  box-shadow: 0 9px 17px rgba(38, 103, 217, 0.24);
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 760;
  transition: transform 160ms ease, box-shadow 160ms ease;
}

.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 13px 22px rgba(38, 103, 217, 0.31); }

.btn-outline {
  min-height: 46px;
  padding: 0 27px;
  border: 1px solid #3b7de5;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.62);
  color: #286ce1;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 760;
  transition: background 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.btn-outline:hover { transform: translateY(-2px); background: #fff; box-shadow: 0 10px 18px rgba(62, 112, 189, 0.13); }

.hero-stats {
  display: flex;
  gap: 12px;
  margin-top: 35px;
}

.stat-bubble {
  display: flex;
  min-width: 99px;
  min-height: 73px;
  flex-direction: column;
  justify-content: center;
  padding: 12px 17px;
  border: 1px solid rgba(199, 217, 246, 0.66);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.61);
  box-shadow: 0 8px 17px rgba(68, 104, 153, 0.08);
  backdrop-filter: blur(7px);
}

.stat-num { color: #2b73e9; font-size: 25px; font-weight: 820; line-height: 1; }
.stat-txt { margin-top: 7px; color: #7b8eac; font-family: 'Noto Sans SC Variable', sans-serif; font-size: 11px; }

.hero-stats { display: flex; gap: 32px; justify-content: center; margin-top: 48px; position: relative; z-index: 1; }
.stat-bubble { text-align: center; padding: 16px 32px; background: rgba(255,255,255,0.06); border-radius: 12px; backdrop-filter: blur(4px); }
.stat-num { display: block; font-size: 32px; font-weight: 800; color: #4fc3f7; }
.stat-txt { display: block; font-size: 13px; color: #78909c; margin-top: 2px; }

/* Learning space */
.features {
  width: min(1680px, calc(100% - 64px));
  margin: 0 auto;
  padding: 62px 0 38px;
  font-family: 'Manrope Variable', 'Noto Sans SC Variable', sans-serif;
}

.section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 28px;
  margin: 0 4px 25px;
}

.section-kicker,
.banner-kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 760;
  letter-spacing: 0.08em;
}

.section-kicker {
  color: #2966ca;
}

.section-heading h2 {
  margin: 7px 0 0;
  color: #17233a;
  font-size: clamp(25px, 3vw, 34px);
  font-weight: 800;
  letter-spacing: -0.04em;
}

.section-heading > p {
  max-width: 350px;
  margin: 0 0 3px;
  color: #64718a;
  font-size: 13px;
  line-height: 1.8;
}

.feature-showcase-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}

.feature-banner {
  position: relative;
  display: flex;
  min-height: 292px;
  overflow: hidden;
  align-items: stretch;
  padding: 39px 42px;
  border: 1px solid transparent;
  border-radius: 22px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: transform 220ms ease, box-shadow 220ms ease, border-color 220ms ease;
  isolation: isolate;
}

.feature-banner:hover {
  transform: translateY(-4px);
}

.feature-banner:focus-visible,
.utility-card:focus-visible,
.role-tool:focus-visible {
  outline: 3px solid #1c6dd0;
  outline-offset: 3px;
}

.banner-copy {
  position: relative;
  z-index: 3;
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: flex-start;
}

.banner-copy strong {
  margin-top: 15px;
  color: #17233a;
  font-size: clamp(34px, 4.2vw, 49px);
  font-weight: 820;
  letter-spacing: -0.06em;
  line-height: 1;
}

.banner-divider {
  width: 54px;
  height: 5px;
  margin: 22px 0 17px;
  border-radius: 20px;
  background: #3976ec;
}

.banner-description {
  color: #53617e;
  font-family: 'Noto Sans SC Variable', sans-serif;
  font-size: 14px;
  line-height: 1.75;
}

.banner-action {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: auto;
  color: #1e5fc5;
  font-size: 13px;
  font-weight: 760;
}

.problem-banner {
  border-color: #d3e1fc;
  background:
    radial-gradient(circle at 94% 15%, rgba(255, 255, 255, 0.85) 0 2px, transparent 3px) 0 0 / 19px 19px,
    radial-gradient(ellipse at 15% 115%, rgba(156, 199, 255, 0.31), transparent 44%),
    radial-gradient(ellipse at 92% 105%, rgba(185, 212, 255, 0.55), transparent 42%),
    linear-gradient(120deg, #f8fbff 0%, #eaf3ff 57%, #d4e5ff 100%);
  box-shadow: 0 15px 35px rgba(55, 108, 192, 0.13);
}

.problem-banner:hover {
  border-color: #89b5ff;
  box-shadow: 0 21px 42px rgba(55, 108, 192, 0.19);
}

.contest-banner {
  background:
    radial-gradient(circle at 84% 16%, rgba(182, 241, 255, 0.25) 0 2px, transparent 3px) 0 0 / 24px 24px,
    radial-gradient(circle at 0% 120%, rgba(87, 228, 236, 0.28), transparent 38%),
    radial-gradient(circle at 100% 95%, rgba(128, 137, 255, 0.46), transparent 40%),
    linear-gradient(122deg, #1647d6 0%, #3157e6 50%, #574ad3 100%);
  box-shadow: 0 15px 35px rgba(44, 61, 187, 0.25);
}

.contest-banner:hover {
  border-color: rgba(188, 215, 255, 0.7);
  box-shadow: 0 22px 43px rgba(44, 61, 187, 0.34);
}

.contest-banner .banner-kicker,
.contest-banner .banner-copy strong,
.contest-banner .banner-description,
.contest-banner .banner-action {
  color: #fff;
}

.contest-banner .banner-kicker { color: #d9edff; }
.contest-banner .banner-description { color: #dbe5ff; }
.contest-banner .banner-action { color: #fff; }
.contest-banner .banner-divider { background: #74e2f1; }

.utility-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 18px;
}

.utility-card {
  display: grid;
  min-height: 112px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  padding: 19px 20px;
  border: 1px solid #dce5f3;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(38, 56, 89, 0.06);
  color: #6c7890;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

.utility-card:hover {
  transform: translateY(-3px);
  border-color: #aac7fa;
  box-shadow: 0 14px 25px rgba(38, 56, 89, 0.1);
}

.utility-card > span:nth-child(2) {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.utility-card strong {
  color: #1d2c46;
  font-size: 15px;
  font-weight: 780;
}

.utility-card small {
  overflow: hidden;
  color: #728097;
  font-family: 'Noto Sans SC Variable', sans-serif;
  font-size: 11px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.utility-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 13px;
}

.leaderboard-card .utility-icon { background: #fff3d7; color: #d58618; }
.list-card .utility-icon { background: #e4f9f3; color: #16866b; }
.profile-card .utility-icon { background: #ecebff; color: #5a55c6; }

.role-tools {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.role-tool {
  display: grid;
  min-height: 112px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 13px;
  padding: 19px 20px;
  border: 1px solid #dce5f3;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(38, 56, 89, 0.06);
  color: #6c7890;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.role-tool:hover {
  border-color: #aac7fa;
  box-shadow: 0 14px 25px rgba(38, 56, 89, 0.1);
  transform: translateY(-3px);
}

.role-tool-icon {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 13px;
  background: var(--role-icon-surface);
  color: var(--role-icon-color);
}

.role-tool-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.role-tool-copy strong { color: #1d2c46; font-size: 15px; font-weight: 780; }
.role-tool-copy small { overflow: hidden; color: #728097; font-family: 'Noto Sans SC Variable', sans-serif; font-size: 11px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.role-tool-arrow { color: #6c7890; }

.role-tool--classes { --role-icon-surface: #e5f0ff; --role-icon-color: #2874e9; }
.role-tool--problems { --role-icon-surface: #e4f9f3; --role-icon-color: #16866b; }
.role-tool--users { --role-icon-surface: #ecebff; --role-icon-color: #5a55c6; }

/* Quick links */
.quick-links { width: min(1440px, calc(100% - 64px)); margin: 0 auto; padding: 0 0 56px; }
.quick-links h2 { text-align: center; font-size: 28px; color: #1a1a2e; margin-bottom: 28px; }
.quick-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.quick-item {
  display: flex; align-items: center; gap: 14px; padding: 16px;
  width: 100%; border: 0; text-align: left; font: inherit;
  background: #fff; border-radius: 10px; cursor: pointer;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); transition: all 0.2s;
}
.quick-item:hover { background: #f0f8ff; transform: translateX(4px); }
.quick-item:disabled { cursor: wait; opacity: 0.72; transform: none; }
.quick-num {
  width: 36px; height: 36px; border-radius: 8px; background: #e3f2fd;
  color: #1565c0; display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: bold; flex-shrink: 0;
}
.quick-item strong { display: block; font-size: 14px; color: #1a1a2e; margin-bottom: 2px; }
.quick-item p { margin: 0; font-size: 12px; color: #999; }

/* Footer */
.footer { text-align: center; padding: 40px 20px; color: #999; font-size: 13px; border-top: 1px solid #f0f0f0; }

@media (max-width: 900px) {
  .hero-shell {
    width: min(100% - 40px, 900px);
    min-height: 420px;
    grid-template-columns: minmax(0, 1fr);
  }

  .hero-content { padding-left: 0; }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 9px;
  }

  .section-heading > p { max-width: 540px; }
  .feature-showcase-grid { grid-template-columns: 1fr; }
  .feature-banner { min-height: 285px; }
}

@media (max-width: 700px) {
  .hero-shell {
    display: block;
    width: min(100% - 32px, 560px);
    min-height: 0;
  }

  .hero-content {
    min-height: 385px;
    padding: 56px 0 35px;
    text-align: center;
  }

  .hero-eyebrow,
  .hero-actions,
  .hero-stats { justify-content: center; }

  .hero-subtitle { font-size: 15px; }
  .hero-desc { font-size: 11px; }

  .hero-content > * { position: relative; z-index: 2; }

  .features {
    width: min(100% - 24px, 560px);
    padding-top: 40px;
  }

  .feature-banner { padding: 29px 25px; border-radius: 18px; }
  .banner-copy { width: 100%; }
  .utility-grid { grid-template-columns: 1fr; }
  .role-tools { grid-template-columns: 1fr; }
  .utility-card,
  .role-tool { min-height: 90px; }
}

@media (max-width: 560px) {
  .hero-content { min-height: 371px; padding-top: 49px; }
  .hero-title { font-size: 46px; }
  .hero-subtitle { max-width: 310px; margin-right: auto; margin-left: auto; line-height: 1.6; }
  .hero-actions { gap: 9px; }
  .btn-primary,
  .btn-outline { min-height: 43px; padding: 0 18px; font-size: 13px; }
  .hero-stats { gap: 8px; margin-top: 30px; }
  .stat-bubble { min-width: 84px; min-height: 67px; padding: 10px 12px; }
  .stat-num { font-size: 21px; }
  .stat-txt { font-size: 10px; }

  .feature-banner { min-height: 340px; }
  .banner-copy { width: 100%; }
  .banner-description { max-width: 255px; }
}

@media (max-width: 768px) {
  .quick-grid { grid-template-columns: 1fr 1fr; }
  .hero-stats { gap: 12px; }
  .stat-bubble { padding: 12px 20px; }
  .stat-num { font-size: 24px; }
}
</style>
