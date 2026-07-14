<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Braces,
  CalendarDays,
  Code2,
  Layers3,
  ListChecks,
  Sparkles,
  Trophy,
  UserRound,
  UsersRound,
} from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const stats = ref({ problemCount: 0, submissionCount: 0, userCount: 0 });

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
      <div class="hero-content">
        <h1 class="hero-title">西财 OJ</h1>
        <p class="hero-subtitle">面向程序设计与算法竞赛的在线评测训练平台</p>
        <p class="hero-desc">多源题库 · 实时评测 · 教学管理 · 能力分析 · 竞赛训练</p>
        <div class="hero-actions">
          <button class="btn-primary" @click="openProblemLibrary">进入题库</button>
          <button v-if="!auth.isLoggedIn()" class="btn-outline" @click="router.push('/login')">登录 / 注册</button>
          <button v-else class="btn-outline" @click="router.push('/profile')">个人中心</button>
        </div>
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
    </section>

    <section class="features" aria-labelledby="feature-heading">
      <div class="section-heading">
        <div>
          <span class="section-kicker"><Sparkles :size="16" aria-hidden="true" /> 学习空间</span>
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
          <span class="problem-art" aria-hidden="true">
            <span class="art-blob blob-one"></span>
            <span class="art-blob blob-two"></span>
            <span class="code-bubble"><Braces :size="28" /></span>
            <span class="code-window window-back"><Code2 :size="52" /><i></i><i></i><i></i></span>
            <span class="code-window window-front"><Code2 :size="58" /><i></i><i></i><i></i></span>
            <span class="art-base base-one"></span>
            <span class="art-base base-two"></span>
          </span>
        </button>

        <button type="button" class="feature-banner contest-banner" @click="openAuthenticated('/contests')">
          <span class="banner-copy">
            <span class="banner-kicker"><Trophy :size="18" aria-hidden="true" /> 赛事训练</span>
            <strong>比赛</strong>
            <span class="banner-divider" aria-hidden="true"></span>
            <span class="banner-description">查看赛事公告、赛制说明与赛后训练安排，随时准备迎接下一场挑战。</span>
            <span class="banner-action">查看比赛 <ArrowRight :size="18" aria-hidden="true" /></span>
          </span>
          <span class="contest-art" aria-hidden="true">
            <span class="contest-ring ring-one"></span>
            <span class="contest-ring ring-two"></span>
            <span class="contest-star star-one">✦</span>
            <span class="contest-star star-two">✦</span>
            <span class="contest-star star-three">✦</span>
            <span class="trophy-pedestal pedestal-back"></span>
            <span class="trophy-pedestal pedestal-front"></span>
            <span class="trophy-cup"><Trophy :size="72" stroke-width="1.55" /></span>
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
        <button v-if="auth.isTeacher()" type="button" class="role-tool" @click="router.push('/teacher/classes')">
          <UsersRound :size="20" aria-hidden="true" /> 班级管理
        </button>
        <button v-if="auth.isAdmin()" type="button" class="role-tool" @click="router.push('/admin/create-problem')">
          <Layers3 :size="20" aria-hidden="true" /> 录入题目
        </button>
        <button v-if="auth.isAdmin()" type="button" class="role-tool" @click="router.push('/admin/users')">
          <CalendarDays :size="20" aria-hidden="true" /> 用户管理
        </button>
      </div>
    </section>

    <!-- 快速入口 -->
    <section class="quick-links">
      <h2>快速开始</h2>
      <div class="quick-grid">
        <div class="quick-item" @click="router.push('/problems/cmriknmx400054gvlv12udy5v')">
          <span class="quick-num">01</span>
          <div>
            <strong>入门题 P1001</strong>
            <p>A+B Problem — 第一个程序</p>
          </div>
        </div>
        <div class="quick-item" @click="router.push('/problems/cmriknmya00104gvl9k1ll45d')">
          <span class="quick-num">02</span>
          <div>
            <strong>思维题 P1007</strong>
            <p>独木桥 — 相遇转身等价直接穿过</p>
          </div>
        </div>
        <div class="quick-item" @click="router.push('/problems/cmriknmxh000f4gvl9d3id1dl')">
          <span class="quick-num">03</span>
          <div>
            <strong>模拟题 P1003</strong>
            <p>铺地毯 — NOIP 提高组真题</p>
          </div>
        </div>
        <div class="quick-item" @click="router.push('/admin/create-problem')">
          <span class="quick-num">＋</span>
          <div>
            <strong>创建题目</strong>
            <p>录入原创题目到平台题库</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 页脚 -->
    <footer class="footer">
      <p>西南财经大学 · 多源 OJ 教学与竞赛平台</p>
      <p class="footer-tech">Vue 3 + NestJS + PostgreSQL + go-judge</p>
    </footer>
  </div>
</template>

<style scoped>
.home { max-width: 100%; margin: 0; padding: 0; }

/* Hero */
.hero {
  background: linear-gradient(135deg, #0f0c29, #1a1a2e, #16213e);
  color: #fff; padding: 72px 40px 56px; text-align: center;
  position: relative; overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute; top: -100px; right: -100px;
  width: 400px; height: 400px;
  background: radial-gradient(circle, rgba(79,195,247,0.15), transparent);
  border-radius: 50%;
}
.hero-content { position: relative; z-index: 1; max-width: 720px; margin: 0 auto; }
.hero-title { font-size: 52px; font-weight: 800; margin: 0; background: linear-gradient(90deg, #4fc3f7, #81d4fa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.hero-subtitle { font-size: 20px; color: #b0bec5; margin: 12px 0 8px; }
.hero-desc { font-size: 14px; color: #78909c; margin-bottom: 28px; }
.hero-actions { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
.btn-primary {
  padding: 14px 40px; background: #4fc3f7; color: #0f0c29;
  border: none; border-radius: 8px; font-size: 18px; font-weight: bold;
  cursor: pointer; transition: transform 0.2s, box-shadow 0.2s;
}
.btn-primary:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(79,195,247,0.4); }
.btn-outline {
  padding: 14px 40px; background: transparent; color: #4fc3f7;
  border: 2px solid #4fc3f7; border-radius: 8px; font-size: 18px; font-weight: bold;
  cursor: pointer; transition: all 0.2s;
}
.btn-outline:hover { background: rgba(79,195,247,0.1); }

.hero-stats { display: flex; gap: 32px; justify-content: center; margin-top: 48px; position: relative; z-index: 1; }
.stat-bubble { text-align: center; padding: 16px 32px; background: rgba(255,255,255,0.06); border-radius: 12px; backdrop-filter: blur(4px); }
.stat-num { display: block; font-size: 32px; font-weight: 800; color: #4fc3f7; }
.stat-txt { display: block; font-size: 13px; color: #78909c; margin-top: 2px; }

/* Learning space */
.features {
  width: min(1240px, calc(100% - 40px));
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
  width: min(56%, 350px);
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

.problem-art,
.contest-art {
  position: absolute;
  z-index: 1;
  pointer-events: none;
}

.problem-art {
  right: -19px;
  bottom: -8px;
  width: 55%;
  height: 100%;
}

.art-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(1px);
}

.blob-one {
  top: 22px;
  right: 26px;
  width: 190px;
  height: 190px;
  background: rgba(167, 197, 255, 0.3);
}

.blob-two {
  right: 147px;
  bottom: -34px;
  width: 164px;
  height: 90px;
  border-radius: 54% 46% 0 0;
  background: rgba(255, 255, 255, 0.62);
}

.code-bubble {
  position: absolute;
  top: 29px;
  left: 32px;
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border: 1px solid rgba(123, 176, 255, 0.55);
  border-radius: 17px 17px 17px 4px;
  background: linear-gradient(145deg, #83ddff, #3d85ef);
  box-shadow: 0 10px 20px rgba(63, 133, 239, 0.2);
  color: #fff;
  transform: rotate(-6deg);
}

.code-window {
  position: absolute;
  display: flex;
  width: 176px;
  height: 124px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border: 7px solid rgba(226, 240, 255, 0.7);
  border-radius: 15px;
  background: linear-gradient(135deg, #639bf8, #2363dd);
  box-shadow: 0 19px 28px rgba(39, 94, 187, 0.23);
  color: #fff;
}

.code-window i {
  position: absolute;
  left: 21px;
  width: 43px;
  height: 4px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.54);
}

.code-window i:nth-of-type(1) { top: 25px; width: 27px; }
.code-window i:nth-of-type(2) { bottom: 28px; width: 52px; }
.code-window i:nth-of-type(3) { bottom: 18px; width: 33px; }

.window-back {
  right: 25px;
  bottom: 27px;
  opacity: 0.46;
  transform: rotate(5deg) scale(0.9);
}

.window-front {
  right: 71px;
  bottom: 37px;
  transform: rotate(-4deg);
}

.art-base {
  position: absolute;
  bottom: 0;
  border-radius: 9px 9px 3px 3px;
  box-shadow: 0 13px 18px rgba(48, 112, 210, 0.18);
}

.base-one {
  right: 53px;
  width: 170px;
  height: 32px;
  background: linear-gradient(135deg, #3678ed, #245fd2);
  transform: skewY(-9deg);
}

.base-two {
  right: 16px;
  bottom: 12px;
  width: 84px;
  height: 31px;
  background: linear-gradient(135deg, #54d8db, #3b9eea);
  transform: rotate(-10deg);
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

.contest-art {
  right: 3%;
  bottom: 0;
  width: 50%;
  height: 100%;
}

.contest-ring {
  position: absolute;
  right: -85px;
  bottom: -155px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 50%;
}

.ring-one { width: 350px; height: 350px; }
.ring-two { right: -17px; bottom: -108px; width: 270px; height: 270px; border-color: rgba(121, 230, 255, 0.26); }

.contest-star {
  position: absolute;
  color: #62e5f7;
  font-size: 29px;
  text-shadow: 0 0 18px rgba(104, 229, 255, 0.7);
}

.star-one { top: 39px; left: 26px; }
.star-two { top: 91px; right: 40px; color: #ffce6e; font-size: 22px; }
.star-three { top: 129px; left: 71px; color: #a3b5ff; font-size: 19px; }

.trophy-pedestal {
  position: absolute;
  right: 13%;
  bottom: 17px;
  border-radius: 18px 18px 8px 8px;
  transform: skewY(-7deg);
}

.pedestal-back {
  width: 158px;
  height: 72px;
  background: linear-gradient(135deg, #ecf5ff, #98b9ff);
  box-shadow: 0 20px 28px rgba(7, 29, 127, 0.29);
}

.pedestal-front {
  right: 19%;
  bottom: 28px;
  width: 95px;
  height: 35px;
  border: 1px solid rgba(255, 255, 255, 0.48);
  background: linear-gradient(135deg, #477fff, #2542c8);
}

.trophy-cup {
  position: absolute;
  right: 19%;
  bottom: 61px;
  display: grid;
  width: 100px;
  height: 100px;
  place-items: center;
  border: 3px solid rgba(230, 248, 255, 0.76);
  border-radius: 50% 50% 44% 44%;
  background: linear-gradient(145deg, rgba(236, 250, 255, 0.9), rgba(141, 188, 255, 0.7));
  box-shadow: inset 13px 8px 18px rgba(255, 255, 255, 0.5), 0 13px 23px rgba(8, 34, 131, 0.32);
  color: #fff;
}

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
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 15px;
}

.role-tool {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid #cddcf4;
  border-radius: 10px;
  background: #f4f8ff;
  color: #315fae;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 720;
}

.role-tool:hover { border-color: #8db1ec; background: #eaf2ff; }

/* Quick links */
.quick-links { max-width: 1100px; margin: 0 auto; padding: 0 20px 56px; }
.quick-links h2 { text-align: center; font-size: 28px; color: #1a1a2e; margin-bottom: 28px; }
.quick-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.quick-item {
  display: flex; align-items: center; gap: 14px; padding: 16px;
  background: #fff; border-radius: 10px; cursor: pointer;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06); transition: all 0.2s;
}
.quick-item:hover { background: #f0f8ff; transform: translateX(4px); }
.quick-num {
  width: 36px; height: 36px; border-radius: 8px; background: #e3f2fd;
  color: #1565c0; display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: bold; flex-shrink: 0;
}
.quick-item strong { display: block; font-size: 14px; color: #1a1a2e; margin-bottom: 2px; }
.quick-item p { margin: 0; font-size: 12px; color: #999; }

/* Footer */
.footer { text-align: center; padding: 40px 20px; color: #999; font-size: 13px; border-top: 1px solid #f0f0f0; }
.footer-tech { font-size: 11px; color: #bbb; margin-top: 4px; }

@media (max-width: 900px) {
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 9px;
  }

  .section-heading > p { max-width: 540px; }
  .feature-showcase-grid { grid-template-columns: 1fr; }
  .feature-banner { min-height: 285px; }
  .problem-art { width: 47%; }
  .contest-art { width: 44%; }
}

@media (max-width: 700px) {
  .features {
    width: min(100% - 24px, 560px);
    padding-top: 40px;
  }

  .feature-banner { padding: 29px 25px; border-radius: 18px; }
  .banner-copy { width: 60%; }
  .utility-grid { grid-template-columns: 1fr; }
  .utility-card { min-height: 90px; }
}

@media (max-width: 560px) {
  .feature-banner { min-height: 340px; }
  .banner-copy { width: 100%; }
  .banner-description { max-width: 255px; }
  .problem-art { right: -74px; width: 65%; opacity: 0.72; }
  .contest-art { right: -50px; width: 66%; opacity: 0.72; }
  .code-bubble { left: 18px; transform: scale(0.82) rotate(-6deg); }
  .window-back { right: 4px; }
  .window-front { right: 47px; transform: scale(0.86) rotate(-4deg); }
  .trophy-cup { right: 19%; transform: scale(0.82); transform-origin: bottom right; }
  .trophy-pedestal { right: 8%; transform: scale(0.85) skewY(-7deg); transform-origin: bottom right; }
}

@media (max-width: 768px) {
  .quick-grid { grid-template-columns: 1fr 1fr; }
  .hero-stats { gap: 12px; }
  .stat-bubble { padding: 12px 20px; }
  .stat-num { font-size: 24px; }
}
</style>
