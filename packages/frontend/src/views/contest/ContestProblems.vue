<script setup lang="ts">
import { computed } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { canManageContest, problemDisplayTitle, type Contest } from './contest';
const props = defineProps<{ contest: Contest }>(); const auth = useAuthStore();
const canEnter = computed(() => canManageContest(props.contest, auth.user) || (props.contest.state !== 'UPCOMING' && !!props.contest.participant));
function label(index: number) { let n = index + 1; let result = ''; while(n) { n--; result = String.fromCharCode(65 + n % 26) + result; n = Math.floor(n / 26); } return result; }
</script>
<template>
  <section class="arena-problems">
    <div class="arena-section-head"><h2>比赛题目</h2><span>{{ contest._count?.problems ?? contest.problems.length }} 题</span></div>
    <p v-if="!canEnter" class="arena-empty">{{ contest.state === 'UPCOMING' ? '比赛尚未开始，开赛后显示题目。' : '请先在报名页报名，再进入比赛题目。' }}</p>
    <div v-else-if="contest.problems.length" class="arena-table-wrap">
      <table class="arena-table"><thead><tr><th scope="col">编号</th><th scope="col">题目</th><th v-if="contest.mode === 'IOI'" scope="col">分值</th><th scope="col">操作</th></tr></thead>
        <tbody><tr v-for="(item, index) in contest.problems" :key="item.id"><td class="problem-letter">{{ label(index) }}</td><td><router-link :to="{ path: `/problems/${item.problem.id}`, query: { contestId: contest.id } }" target="_blank" rel="noopener">{{ problemDisplayTitle(item.problem) }}</router-link></td><td v-if="contest.mode === 'IOI'">{{ item.score }}</td><td><router-link :to="{ path: `/problems/${item.problem.id}`, query: { contestId: contest.id } }" target="_blank" rel="noopener">进入题目</router-link></td></tr></tbody>
      </table>
    </div>
    <p v-else class="arena-empty">暂无比赛题目。</p>
  </section>
</template>
