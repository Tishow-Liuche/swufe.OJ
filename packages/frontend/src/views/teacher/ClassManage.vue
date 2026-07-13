<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../api/client';

interface ClassInfo { id: string; name: string; course?: string; members?: number; createdAt: string; }
const classes = ref<ClassInfo[]>([]);
const loading = ref(true);
const msg = ref('');
const newClassName = ref('');
const importClassId = ref('');
const importText = ref('');

onMounted(loadClasses);

async function loadClasses() {
  try {
    const { data } = await api.get('/api/teacher/classes');
    classes.value = data;
  } catch (e: any) { msg.value = '加载失败'; }
  finally { loading.value = false; }
}

async function createClass() {
  if (!newClassName.value) return;
  try {
    await api.post('/api/teacher/classes', { name: newClassName.value });
    newClassName.value = '';
    msg.value = '班级已创建';
    loadClasses();
  } catch (e: any) { msg.value = '创建失败: ' + (e.response?.data?.message || e.message); }
}

async function importStudents() {
  if (!importClassId.value || !importText.value) return;
  const usernames = importText.value.split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
  try {
    const { data } = await api.post(`/api/teacher/classes/${importClassId.value}/import`, { usernames });
    msg.value = `导入完成: 成功 ${data.added} 人, 跳过 ${data.skipped} 人`;
    importText.value = '';
    loadClasses();
  } catch (e: any) { msg.value = '导入失败: ' + (e.response?.data?.message || e.message); }
}
</script>

<template>
  <div class="page">
    <h2>班级管理</h2>
    <p v-if="msg" class="msg">{{ msg }}</p>

    <!-- 创建班级 -->
    <div class="card">
      <h3>创建班级</h3>
      <div class="row">
        <input v-model="newClassName" placeholder="班级名称, 如: 2024 级计算机 1 班" class="input" @keyup.enter="createClass" />
        <button class="btn" @click="createClass">创建</button>
      </div>
    </div>

    <!-- 导入学生 -->
    <div class="card">
      <h3>批量导入学生</h3>
      <div class="row">
        <select v-model="importClassId" class="input">
          <option value="">选择班级</option>
          <option v-for="c in classes" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </div>
      <textarea v-model="importText" rows="4" placeholder="输入用户名, 每行一个或用逗号分隔" class="textarea"></textarea>
      <button class="btn btn-blue" @click="importStudents" :disabled="!importClassId">导入</button>
    </div>

    <!-- 班级列表 -->
    <div v-if="!loading" class="card">
      <h3>我的班级 ({{ classes.length }})</h3>
      <table v-if="classes.length" class="table">
        <thead><tr><th>班级名</th><th>课程</th><th>人数</th><th>创建时间</th></tr></thead>
        <tbody>
          <tr v-for="c in classes" :key="c.id">
            <td>{{ c.name }}</td>
            <td>{{ c.course || '-' }}</td>
            <td>{{ c.members || 0 }}</td>
            <td>{{ c.createdAt?.slice(0, 10) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">暂无班级, 请创建一个</p>
    </div>
    <p v-else>加载中...</p>
  </div>
</template>

<style scoped>
.page { max-width: 800px; margin: 0 auto; padding: 24px; }
h2 { margin-bottom: 16px; }
h3 { margin: 0 0 12px; font-size: 15px; }
.msg { padding: 8px 12px; background: #e8f5e9; border-radius: 4px; margin-bottom: 12px; font-size: 13px; }
.card { background: #fff; border-radius: 10px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.row { display: flex; gap: 10px; margin-bottom: 12px; align-items: center; }
.input { flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; }
.textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 13px; margin-bottom: 8px; box-sizing: border-box; resize: vertical; font-family: inherit; }
.btn { padding: 8px 20px; background: #4fc3f7; color: #1a1a2e; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
.btn-blue { background: #3498db; color: #fff; }
.btn:disabled { opacity: 0.5; cursor: default; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.table th { background: #f8f9fa; font-weight: 600; color: #666; }
.empty { color: #999; text-align: center; padding: 20px; font-size: 14px; }
</style>
