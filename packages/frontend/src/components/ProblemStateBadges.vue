<script setup lang="ts">
import { AlertTriangle, CheckCircle2, FilePenLine, Sparkles, Star } from '@lucide/vue';

defineProps<{
  state?: {
    status?: 'PASSED' | 'ATTEMPTED' | 'NEW';
    favorite?: boolean;
    wrong?: boolean;
    hasDraft?: boolean;
  } | null;
  compact?: boolean;
}>();
</script>

<template>
  <span v-if="state" class="problem-state-badges" :class="{ compact }">
    <span v-if="state.status === 'PASSED'" class="state-badge passed" title="已通过">
      <CheckCircle2 :size="12" />已通过
    </span>
    <span v-else-if="state.status === 'ATTEMPTED'" class="state-badge attempted" title="有代码草稿或提交记录，但尚未通过">
      <FilePenLine :size="12" />写过未通过
    </span>
    <span v-else class="state-badge fresh" title="还没有代码或提交记录">
      <Sparkles :size="12" />新题目
    </span>
    <span v-if="state.favorite" class="state-badge favorite" title="已收藏"><Star :size="12" />收藏</span>
    <span v-if="state.wrong" class="state-badge wrong" title="错题"><AlertTriangle :size="12" />错题</span>
  </span>
</template>

<style scoped>
.problem-state-badges { display: inline-flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 4px; }
.state-badge { display: inline-flex; min-height: 22px; align-items: center; gap: 4px; padding: 3px 6px; border: 1px solid transparent; border-radius: 5px; font-size: 9px; font-weight: 800; line-height: 1; white-space: nowrap; }
.state-badge.passed { border-color: #b8dfcf; color: #1d7255; background: #ebf8f2; }
.state-badge.attempted { border-color: #e7cf9e; color: #89631b; background: #fff8e8; }
.state-badge.fresh { border-color: #cbd8e4; color: #61758a; background: #f4f7fa; }
.state-badge.favorite { border-color: #ecd78b; color: #846100; background: #fff8d8; }
.state-badge.wrong { border-color: #edc1bd; color: #a14039; background: #fff1f0; }
.compact .state-badge { min-height: 19px; padding: 2px 5px; font-size: 8px; }
.compact .state-badge svg { width: 10px; height: 10px; }
</style>
