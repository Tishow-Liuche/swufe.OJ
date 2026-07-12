<template>
  <div class="home">
    <h1>西财在线评测平台</h1>
    <p>编程学习与竞赛训练一站式平台</p>
    <div class="actions">
      <router-link to="/problems" class="btn">进入题库</router-link>
      <router-link to="/login" class="btn btn-outline">登录 / 注册</router-link>
    </div>
  </div>
</template>

<style scoped>
.home { text-align: center; padding: 80px 20px; }
h1 { font-size: 36px; color: #1a1a2e; }
p { color: #666; margin: 16px 0 40px; font-size: 18px; }
.actions { display: flex; gap: 16px; justify-content: center; }
.btn {
  padding: 12px 32px;
  background: #4fc3f7;
  color: #1a1a2e;
  border-radius: 6px;
  text-decoration: none;
  font-weight: bold;
}
.btn-outline { background: transparent; border: 2px solid #4fc3f7; }
</style>
