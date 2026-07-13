<script setup lang="ts">
import { ref, onMounted } from 'vue';
import api from '../../api/client';

const platforms = ref<any[]>([]);
const accounts = ref<any[]>([]);
const devices = ref<any[]>([]);
const loading = ref(true);
const msg = ref('');
const newBind = ref({ platform: 'CODEFORCES', remoteUsername: '' });

onMounted(async () => { await loadAll(); });

async function loadAll() {
  loading.value = true;
  try {
    const [pRes, aRes, dRes] = await Promise.all([
      api.get('/api/external/platforms'),
      api.get('/api/external/accounts'),
      api.get('/api/external/devices'),
    ]);
    platforms.value = pRes.data;
    accounts.value = aRes.data;
    devices.value = dRes.data;
  } catch (e: any) { msg.value = '加载失败'; }
  finally { loading.value = false; }
}

async function bind() {
  try {
    await api.post('/api/external/accounts', newBind.value);
    newBind.value.remoteUsername = '';
    msg.value = '绑定成功';
    loadAll();
  } catch (e: any) { msg.value = e.response?.data?.message || '绑定失败'; }
}

async function unbind(id: string) {
  try { await api.delete(`/api/external/accounts/${id}`); loadAll(); }
  catch (e: any) { msg.value = '解绑失败'; }
}

async function verify(id: string, username: string) {
  try { await api.post(`/api/external/accounts/${id}/helper-verify`, { remoteUsername: username }); loadAll(); }
  catch (e: any) { msg.value = '验证失败'; }
}

async function revokeDevice(id: string) {
  try { await api.delete(`/api/external/devices/${id}`); loadAll(); }
  catch (e: any) { msg.value = '撤销失败'; }
}
</script>

<template>
  <div class="page">
    <h2>第三方账号管理</h2>
    <p v-if="msg" class="msg">{{ msg }}</p>

    <div v-if="loading" class="loading">加载中...</div>

    <template v-else>
      <!-- 绑定账号 -->
      <div class="card">
        <h3>绑定新账号</h3>
        <div class="bind-row">
          <select v-model="newBind.platform" class="input">
            <option v-for="p in platforms" :key="p.code" :value="p.code" :disabled="!p.enabled">
              {{ p.name }} {{ p.enabled ? '' : '(暂停)' }}
            </option>
          </select>
          <input v-model="newBind.remoteUsername" placeholder="第三方用户名" class="input" />
          <button @click="bind" class="btn">绑定</button>
        </div>
      </div>

      <!-- 已绑定账号 -->
      <div class="card" v-if="accounts.length > 0">
        <h3>已绑定账号 ({{ accounts.length }})</h3>
        <table class="table">
          <thead><tr><th>平台</th><th>用户名</th><th>验证状态</th><th>Helper</th><th>最近提交</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="a in accounts" :key="a.id">
              <td>{{ a.platform }}</td>
              <td>{{ a.remoteUsername }}</td>
              <td>
                <span :class="a.ownershipVerified ? 'tag-green' : 'tag-yellow'">
                  {{ a.ownershipVerified ? '已验证' : '未验证' }}
                </span>
              </td>
              <td>
                <span :class="a.helperConnected ? 'tag-green' : 'tag-gray'">
                  {{ a.status === 'SUBMISSION_READY' ? '就绪' : a.helperConnected ? '已连接' : '离线' }}
                </span>
              </td>
              <td>{{ a.lastSuccessfulSubmissionAt ? new Date(a.lastSuccessfulSubmissionAt).toLocaleString('zh-CN') : '-' }}</td>
              <td class="actions">
                <button v-if="!a.ownershipVerified" class="btn-sm" @click="verify(a.id, a.remoteUsername)">验证</button>
                <button class="btn-sm btn-red" @click="unbind(a.id)">解绑</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Helper 设备 -->
      <div class="card">
        <h3>Helper 设备 ({{ devices.length }})</h3>
        <table class="table" v-if="devices.length > 0">
          <thead><tr><th>设备</th><th>浏览器</th><th>版本</th><th>状态</th><th>最后活动</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="d in devices" :key="d.id">
              <td>{{ d.deviceName }}</td><td>{{ d.browserName }}</td><td>{{ d.extensionVersion }}</td>
              <td><span :class="d.status === 'ONLINE' ? 'tag-green' : 'tag-red'">{{ d.status }}</span></td>
              <td>{{ new Date(d.lastSeenAt).toLocaleString('zh-CN') }}</td>
              <td><button class="btn-sm btn-red" @click="revokeDevice(d.id)">撤销</button></td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">暂无设备。请安装浏览器 Helper 扩展。</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page { max-width: 800px; margin: 0 auto; padding: 24px; }
h2 { margin-bottom: 16px; }
h3 { margin: 0 0 12px; font-size: 15px; }
.msg { padding: 8px 12px; background: #e8f5e9; border-radius: 4px; margin-bottom: 12px; font-size: 13px; }
.card { background: #fff; border-radius: 10px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.bind-row { display: flex; gap: 10px; }
.input { padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; flex: 1; }
.btn { padding: 8px 20px; background: #4fc3f7; color: #1a1a2e; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
.table { width: 100%; border-collapse: collapse; }
.table th, .table td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
.table th { background: #f8f9fa; font-weight: 600; color: #666; }
.tag-green { padding: 2px 8px; background: #e8f5e9; color: #2e7d32; border-radius: 3px; font-size: 12px; font-weight: 600; }
.tag-yellow { padding: 2px 8px; background: #fff8e1; color: #e65100; border-radius: 3px; font-size: 12px; font-weight: 600; }
.tag-gray { padding: 2px 8px; background: #f0f0f0; color: #666; border-radius: 3px; font-size: 12px; font-weight: 600; }
.tag-red { padding: 2px 8px; background: #fce4ec; color: #c62828; border-radius: 3px; font-size: 12px; font-weight: 600; }
.actions { display: flex; gap: 6px; }
.btn-sm { padding: 4px 10px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; }
.btn-red { color: #e74c3c; border-color: #e74c3c; }
.loading, .empty { color: #999; text-align: center; padding: 20px; }
</style>
