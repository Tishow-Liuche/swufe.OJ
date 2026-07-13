<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const auth = useAuthStore();
const stats = ref({ problemCount: 0, submissionCount: 0, userCount: 0 });

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
          <button class="btn-primary" @click="router.push('/problems')">进入题库</button>
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

    <!-- 功能入口 -->
    <section class="features">
      <h2>平台功能</h2>
      <div class="feature-grid">
        <div class="feature-card" @click="router.push('/problems')">
          <div class="card-icon icon-bank">📚</div>
          <h3>题库</h3>
          <p>本地原创 + 第三方 OJ 题目统一管理，支持搜索、筛选、标签</p>
        </div>
        <div class="feature-card" @click="router.push('/profile')">
          <div class="card-icon icon-submit">📊</div>
          <h3>个人中心</h3>
          <p>提交记录 · 热力图 · 统计概览 · 语言分布 · 难度分析 · 连续打卡</p>
        </div>
        <div v-if="auth.isAdmin()" class="feature-card" @click="router.push('/admin/create-problem')">
          <div class="card-icon icon-create">✍️</div>
          <h3>录题</h3>
          <p>Markdown 编辑器 + ZIP 测试数据上传，支持 Special Judge</p>
        </div>
        <div v-if="auth.isTeacher()" class="feature-card" @click="router.push('/teacher/classes')">
          <div class="card-icon icon-class">🎓</div>
          <h3>班级管理</h3>
          <p>创建班级、批量导入学生、布置作业、发布比赛</p>
        </div>
        <div v-if="auth.isAdmin()" class="feature-card" @click="router.push('/admin/users')">
          <div class="card-icon icon-admin">⚙️</div>
          <h3>系统管理</h3>
          <p>用户管理、角色分配、权限控制</p>
        </div>
        <div class="feature-card disabled">
          <div class="card-icon icon-list">📋</div>
          <h3>题单<span class="badge-soon">即将推出</span></h3>
          <p>教师创建分层题单，学生按阶段训练，记录完成进度</p>
        </div>
        <div class="feature-card disabled">
          <div class="card-icon icon-contest">🏆</div>
          <h3>比赛<span class="badge-soon">即将推出</span></h3>
          <p>ACM/ICPC · IOI 双赛制，封榜 · 排名 · 虚拟赛 · 赛后补题</p>
        </div>
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

/* Features */
.features { max-width: 1100px; margin: 0 auto; padding: 56px 20px 32px; }
.features h2 { text-align: center; font-size: 28px; color: #1a1a2e; margin-bottom: 36px; }
.feature-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.feature-card {
  background: #fff; border-radius: 12px; padding: 28px 24px;
  text-align: center; cursor: pointer; transition: all 0.25s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid transparent;
  position: relative;
}
.feature-card:hover { transform: translateY(-4px); box-shadow: 0 8px 24px rgba(0,0,0,0.1); border-color: #4fc3f7; }
.feature-card.disabled { cursor: default; opacity: 0.7; }
.feature-card.disabled:hover { transform: none; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-color: transparent; }
.card-icon { font-size: 36px; margin-bottom: 12px; }
.feature-card h3 { margin: 0 0 8px; font-size: 18px; color: #1a1a2e; }
.feature-card p { margin: 0; font-size: 13px; color: #888; line-height: 1.6; }
.badge-soon {
  display: inline-block; margin-left: 8px; padding: 1px 8px;
  background: #e3f2fd; color: #1565c0; border-radius: 10px; font-size: 11px; font-weight: 600;
}

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

@media (max-width: 768px) {
  .feature-grid { grid-template-columns: 1fr; }
  .quick-grid { grid-template-columns: 1fr 1fr; }
  .hero-stats { gap: 12px; }
  .stat-bubble { padding: 12px 20px; }
  .stat-num { font-size: 24px; }
}
</style>
