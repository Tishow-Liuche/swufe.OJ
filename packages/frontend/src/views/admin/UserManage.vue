<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../api/client';

const users = ref<any[]>([]);
const loading = ref(true);
const msg = ref('');
const showResetPwd = ref('');
const newPassword = ref('123456');

onMounted(loadUsers);

async function loadUsers() {
  try {
    const { data } = await api.get('/api/user/admin/list');
    users.value = data;
  } catch (e: any) { msg.value = '加载失败: ' + (e.response?.data?.message || e.message); }
  finally { loading.value = false; }
}

async function setRole(userId: string, role: string) {
  try {
    await api.patch(`/api/user/admin/${userId}/role`, { role });
    msg.value = '角色已更新';
    loadUsers();
  } catch (e: any) { msg.value = '操作失败: ' + (e.response?.data?.message || e.message); }
}

async function resetPassword(userId: string) {
  try {
    await api.post(`/api/user/admin/${userId}/reset-password`, { password: newPassword.value });
    msg.value = '密码已重置为 ' + newPassword.value;
    showResetPwd.value = '';
  } catch (e: any) { msg.value = '重置失败: ' + (e.response?.data?.message || e.message); }
}
</script>

<template>
  <div class="page">
    <h2>用户管理</h2>
    <p v-if="msg" class="msg">{{ msg }}</p>
    <table v-if="!loading" class="table">
      <thead>
        <tr><th>用户名</th><th>昵称</th><th>角色</th><th>提交数</th><th>加入时间</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id">
          <td>{{ u.username }}</td>
          <td>{{ u.nickname || '-' }}</td>
          <td>
            <span class="role-tag" :class="u.role?.toLowerCase()">{{ u.role === 'ADMIN' ? '管理员' : u.role === 'TEACHER' ? '教师' : '学生' }}</span>
          </td>
          <td>{{ u._count?.submissions || 0 }}</td>
          <td>{{ u.createdAt?.slice(0, 10) }}</td>
          <td class="actions">
            <select @change="setRole(u.id, ($event.target as HTMLSelectElement).value)" :value="u.role">
              <option value="STUDENT">学生</option>
              <option value="TEACHER">教师</option>
              <option value="ADMIN">管理员</option>
            </select>
            <button v-if="showResetPwd !== u.id" class="btn-sm" @click="showResetPwd = u.id">重置密码</button>
            <span v-else class="reset-row">
              <input v-model="newPassword" size="8" />
              <button class="btn-sm btn-green" @click="resetPassword(u.id)">确认</button>
              <button class="btn-sm" @click="showResetPwd = ''">取消</button>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else>加载中...</p>
  </div>
</template>

<style scoped>
.page { max-width: 960px; margin: 0 auto; padding: 24px; }
h2 { margin-bottom: 16px; }
.msg { padding: 8px 12px; background: #e8f5e9; border-radius: 4px; margin-bottom: 12px; font-size: 13px; }
.table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.table th, .table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.table th { background: #f8f9fa; font-weight: 600; color: #666; }
.table tr:hover { background: #fafbfc; }
.role-tag { padding: 2px 8px; border-radius: 3px; font-size: 12px; font-weight: 600; }
.role-tag.admin { background: #fce4ec; color: #c62828; }
.role-tag.teacher { background: #e3f2fd; color: #1565c0; }
.role-tag.student { background: #e8f5e9; color: #2e7d32; }
.actions { display: flex; gap: 8px; align-items: center; }
.actions select { padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; }
.btn-sm { padding: 4px 12px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; }
.btn-green { background: #27ae60; color: #fff; border-color: #27ae60; }
.reset-row { display: flex; gap: 4px; align-items: center; }
.reset-row input { padding: 3px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; }
</style>
