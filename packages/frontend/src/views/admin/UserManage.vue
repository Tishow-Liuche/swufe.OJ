<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Check, Clock3, X } from '@lucide/vue';
import api from '../../api/client';

const users = ref<any[]>([]);
const loading = ref(true);
const msg = ref('');
const showResetPwd = ref('');
const newPassword = ref('');
const reviewing = ref('');
const classApplications = ref<any[]>([]);
const classReviewing = ref('');

onMounted(async () => { await Promise.all([loadUsers(), loadClassApplications()]); });

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

async function reviewTeacherApplication(userId: string, status: 'APPROVED' | 'REJECTED') {
  reviewing.value = userId;
  try {
    await api.patch(`/api/user/admin/${userId}/teacher-application`, { status });
    msg.value = status === 'APPROVED' ? '教师申请已批准' : '教师申请已拒绝';
    await loadUsers();
  } catch (e: any) {
    msg.value = '审核失败: ' + (e.response?.data?.message || e.message);
  } finally {
    reviewing.value = '';
  }
}

function applicationLabel(status: string) {
  return {
    PENDING: '待审核',
    APPROVED: '已通过',
    REJECTED: '已拒绝',
    NOT_REQUIRED: '未申请',
  }[status] || '未申请';
}

async function resetPassword(userId: string) {
  try {
    await api.post(`/api/user/admin/${userId}/reset-password`, { password: newPassword.value });
    msg.value = '密码已重置，目标账号的所有历史登录状态已失效，用户下次登录必须修改密码。';
    showResetPwd.value = '';
    newPassword.value = '';
  } catch (e: any) { msg.value = '重置失败: ' + (e.response?.data?.message || e.message); }
}

async function loadClassApplications() {
  try {
    const { data } = await api.get('/api/user/admin/classes');
    classApplications.value = data;
  } catch (e: any) { msg.value = '班级申请加载失败：' + (e.response?.data?.message || e.message); }
}

async function reviewClassApplication(classId: string, status: 'APPROVED' | 'REJECTED') {
  classReviewing.value = classId;
  try {
    await api.patch(`/api/user/admin/classes/${classId}`, { status });
    msg.value = status === 'APPROVED' ? '班级已批准并启用' : '班级申请已拒绝';
    await loadClassApplications();
  } catch (e: any) { msg.value = '班级审核失败：' + (e.response?.data?.message || e.message); }
  finally { classReviewing.value = ''; }
}
</script>

<template>
  <div class="page">
    <h2>用户管理</h2>
    <p v-if="msg" class="msg">{{ msg }}</p>
    <section class="class-review">
      <header><div><h3>班级创建审核</h3><p>仅审核通过的班级可以导入学生和发布教学内容。</p></div><span><Clock3 :size="15" />{{ classApplications.filter((item) => item.status === 'PENDING').length }} 待审核</span></header>
      <div v-if="classApplications.length" class="class-application-list">
        <article v-for="item in classApplications" :key="item.id" class="class-application">
          <div><span class="application-tag" :class="item.status?.toLowerCase()">{{ item.status === 'PENDING' ? '待审核' : item.status === 'APPROVED' ? '已通过' : '已拒绝' }}</span><strong>{{ item.name }}</strong><p>申请教师：{{ item.teacher?.nickname || item.teacher?.username || '未知教师' }} · {{ item.createdAt?.slice(0, 10) }}</p></div>
          <div v-if="item.status === 'PENDING'" class="class-review-actions"><button :disabled="classReviewing === item.id" class="approve-btn" @click="reviewClassApplication(item.id, 'APPROVED')">通过并启用</button><button :disabled="classReviewing === item.id" class="reject-btn" @click="reviewClassApplication(item.id, 'REJECTED')">拒绝</button></div>
          <small v-else>{{ item.status === 'APPROVED' ? '已启用' : item.reviewNote || '未通过' }}</small>
        </article>
      </div>
      <p v-else class="empty-review">暂无班级申请</p>
    </section>
    <div v-if="!loading" class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>用户</th><th>学校</th><th>当前角色</th><th>教师申请</th><th>提交数</th><th>加入时间</th><th>操作</th></tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id">
            <td><strong>{{ u.username }}</strong><small>{{ u.nickname || u.email }}</small></td>
            <td>{{ u.school || '-' }}</td>
            <td>
              <span class="role-tag" :class="u.role?.toLowerCase()">{{ u.role === 'ADMIN' ? '管理员' : u.role === 'TEACHER' ? '教师' : '学生' }}</span>
            </td>
            <td>
              <div class="application-cell">
                <span class="application-tag" :class="u.teacherApplicationStatus?.toLowerCase()">
                  {{ applicationLabel(u.teacherApplicationStatus) }}
                </span>
                <span v-if="u.teacherApplicationStatus === 'PENDING'" class="review-actions">
                  <button
                    type="button"
                    class="icon-action approve"
                    title="批准教师申请"
                    aria-label="批准教师申请"
                    :disabled="reviewing === u.id"
                    @click="reviewTeacherApplication(u.id, 'APPROVED')"
                  ><Check :size="15" aria-hidden="true" /></button>
                  <button
                    type="button"
                    class="icon-action reject"
                    title="拒绝教师申请"
                    aria-label="拒绝教师申请"
                    :disabled="reviewing === u.id"
                    @click="reviewTeacherApplication(u.id, 'REJECTED')"
                  ><X :size="15" aria-hidden="true" /></button>
                </span>
              </div>
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
                <input v-model="newPassword" type="password" minlength="8" placeholder="至少8位，含字母和数字" />
                <button class="btn-sm btn-green" @click="resetPassword(u.id)">确认</button>
                <button class="btn-sm" @click="showResetPwd = ''">取消</button>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else>加载中...</p>
  </div>
</template>

<style scoped>
.page { max-width: 1280px; margin: 0 auto; padding: 24px; }
h2 { margin-bottom: 16px; }
.msg { padding: 8px 12px; background: #e8f5e9; border-radius: 4px; margin-bottom: 12px; font-size: 13px; }
.table-wrap { overflow-x: auto; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.table th, .table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.table th { background: #f8f9fa; font-weight: 600; color: #666; }
.table tr:hover { background: #fafbfc; }
.table td strong, .table td small { display: block; white-space: nowrap; }
.table td small { margin-top: 3px; color: #8a929c; font-size: 11px; font-weight: 400; }
.role-tag { padding: 2px 8px; border-radius: 3px; font-size: 12px; font-weight: 600; }
.role-tag.admin { background: #fce4ec; color: #c62828; }
.role-tag.teacher { background: #e3f2fd; color: #1565c0; }
.role-tag.student { background: #e8f5e9; color: #2e7d32; }
.application-cell, .review-actions { display: flex; align-items: center; gap: 6px; }
.application-tag { padding: 2px 7px; border-radius: 3px; background: #eef1f4; color: #68717e; font-size: 11px; white-space: nowrap; }
.application-tag.pending { background: #fff3df; color: #9b5d08; }
.application-tag.approved { background: #e5f5ed; color: #13724d; }
.application-tag.rejected { background: #fdebea; color: #a5352d; }
.icon-action { display: inline-grid; width: 28px; height: 28px; place-items: center; border: 1px solid #d9dee5; border-radius: 50%; background: #fff; cursor: pointer; }
.icon-action.approve { color: #13724d; }
.icon-action.reject { color: #b13931; }
.icon-action:hover:not(:disabled) { background: #f0f3f6; }
.icon-action:disabled { opacity: 0.45; cursor: wait; }
.actions { display: flex; gap: 8px; align-items: center; }
.actions select { padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px; }
.btn-sm { padding: 4px 12px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; }
.btn-green { background: #27ae60; color: #fff; border-color: #27ae60; }
.reset-row { display: flex; gap: 4px; align-items: center; }
.reset-row input { padding: 3px 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; }
.class-review { margin:0 0 18px; padding:18px; border:1px solid #dfe8ef; border-radius:12px; background:#fff; box-shadow:0 4px 14px rgba(31,64,95,.04); }.class-review header { display:flex; align-items:center; justify-content:space-between; gap:15px; }.class-review h3 { margin:0; font-size:16px; }.class-review header p { margin:4px 0 0; color:#8290a0; font-size:12px; }.class-review header>span { display:flex; align-items:center; gap:5px; padding:6px 8px; color:#98600c; border-radius:6px; background:#fff1d8; font-size:11px; font-weight:800; }.class-application-list { display:grid; gap:9px; margin-top:15px; }.class-application { display:flex; align-items:center; justify-content:space-between; gap:15px; padding:12px; border:1px solid #edf0f3; border-radius:9px; background:#fcfdff; }.class-application strong { display:block; margin-top:7px; font-size:14px; }.class-application p,.class-application small { margin:5px 0 0; color:#7f8e9d; font-size:11px; }.class-review-actions { display:flex; gap:7px; }.class-review-actions button { padding:6px 9px; border-radius:6px; font-size:12px; font-weight:800; cursor:pointer; }.approve-btn { color:#fff; border:1px solid #197452; background:#21845f; }.reject-btn { color:#9d3933; border:1px solid #e5bfbc; background:#fff; }.class-review-actions button:disabled { opacity:.5; cursor:wait; }.empty-review { margin:16px 0 0; color:#8e9aa7; font-size:13px; }@media(max-width:700px){.class-application{align-items:flex-start;flex-direction:column}.class-review header{align-items:flex-start;flex-direction:column}}
</style>
