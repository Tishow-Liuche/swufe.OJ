<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTimestamp } from '@vueuse/core';
import api from '../../api/client';
import { useAuthStore } from '../../stores/auth';
import { canManageContest, dateText, errorText, type Contest } from './contest';
const props = defineProps<{ contest: Contest }>();
const emit = defineEmits<{ reload: [] }>();
const auth = useAuthStore();
const studentId = ref(auth.user?.studentId || '');
const realName = ref(''); const password = ref('');
const busy = ref(false); const error = ref('');
const now = useTimestamp({ interval: 1000 });
const registrationOpen = computed(() => props.contest.state !== 'ENDED' &&
  (!props.contest.registerStart || now.value >= Date.parse(props.contest.registerStart)) &&
  (!props.contest.registerEnd || now.value <= Date.parse(props.contest.registerEnd)));
async function act(virtual = false) {
  if (busy.value) return; busy.value = true; error.value = '';
  try {
    await api.post(`/api/contests/${props.contest.id}/${virtual ? 'virtual' : 'register'}`, virtual ? {} : {
      studentId: studentId.value.trim(), realName: realName.value.trim(), password: password.value,
    }); emit('reload');
  } catch(e) { error.value = errorText(e, virtual ? '无法开始虚拟比赛' : '报名失败'); }
  finally { busy.value = false; }
}
</script>
<template>
  <section class="arena-registration">
    <div class="arena-section-head"><h2>比赛报名</h2><span v-if="contest.participant" class="arena-success">{{ contest.participant.isVirtual ? '已加入虚拟比赛' : '已报名' }}</span></div>
    <p v-if="error" class="arena-error" role="alert">{{ error }}</p>
    <div class="arena-registration-grid">
      <div>
        <h3>比赛说明</h3><p class="arena-description">{{ contest.description || '暂无补充说明。' }}</p>
        <dl class="arena-facts">
          <div><dt>报名开始</dt><dd>{{ contest.registerStart ? dateText(contest.registerStart) : '不限' }}</dd></div>
          <div><dt>报名截止</dt><dd>{{ contest.registerEnd ? dateText(contest.registerEnd) : '比赛结束前' }}</dd></div>
          <div><dt>计分规则</dt><dd>{{ contest.mode === 'ACM' ? `ACM 赛制，每次错误罚时 ${contest.penaltyTime} 分钟` : 'IOI 赛制，按每题最高得分计分' }}</dd></div>
          <div><dt>封榜规则</dt><dd>{{ contest.freezeTime ? dateText(contest.freezeTime) + ' 起封榜' : '不封榜' }}</dd></div>
          <div><dt>题目数量</dt><dd>{{ contest._count?.problems ?? contest.problems.length }} 题</dd></div>
        </dl>
      </div>
      <div class="arena-register-box">
        <template v-if="contest.participant">
          <h3>参赛状态</h3><p>{{ contest.state === 'UPCOMING' ? '报名成功，请等待比赛开始。' : contest.state === 'ENDED' ? '比赛已结束，可查看排名及提交记录。' : '可以从比赛题目页进入作答。' }}</p>
          <router-link class="arena-button" :to="`/contests/${contest.id}/problems`">查看比赛题目</router-link>
        </template>
        <form v-else-if="registrationOpen" :class="{ 'campus-registration': contest.visibility === 'CAMPUS_PRIVATE' }" @submit.prevent="act()">
          <h3>报名信息</h3>
          <template v-if="contest.visibility === 'CAMPUS_PRIVATE'">
            <p>需在<router-link to="/profile" target="_blank" rel="noopener">个人中心</router-link>绑定学号，榜单显示“学号_姓名”。</p>
            <label>学号<input v-model="studentId" required inputmode="numeric" pattern="[0-9]{8}" maxlength="8" placeholder="与绑定学号一致" /></label>
            <label>姓名<input v-model="realName" required maxlength="40" autocomplete="name" placeholder="真实姓名" /></label>
          </template>
          <label v-if="contest.visibility === 'PASSWORD'">比赛密码<input v-model="password" type="password" required autocomplete="off" /></label>
          <p v-if="contest.visibility === 'PUBLIC'">确认报名后，可在比赛开始时进入题目。</p>
          <button class="arena-button" :disabled="busy">{{ busy ? '提交中…' : '确认报名' }}</button>
        </form>
        <p v-else class="arena-empty">{{ contest.state === 'ENDED' ? '比赛已结束，报名已关闭。' : '当前不在报名时间内。' }}</p>
        <button v-if="contest.state === 'ENDED' && contest.allowUpsolve && !contest.participant && (contest.visibility === 'PUBLIC' || canManageContest(contest, auth.user))" class="arena-button secondary" :disabled="busy" @click="act(true)">开始虚拟比赛</button>
      </div>
    </div>
  </section>
</template>
