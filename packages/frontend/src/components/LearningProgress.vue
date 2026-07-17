<script setup lang="ts">
defineProps<{
  daily?: any;
  planProgress?: any;
}>();
</script>

<template>
  <div class="learning-progress">
    <section class="progress-group">
      <div class="progress-copy">
        <span>今日计划</span>
        <strong>{{ daily?.progress?.completed || 0 }} / {{ daily?.progress?.total || 0 }}</strong>
        <small>已完成 / 今日题目</small>
      </div>
      <div class="progress-visual">
        <div class="track"><i :style="{ width: `${daily?.progress?.percent || 0}%` }"></i></div>
        <b>{{ daily?.progress?.percent || 0 }}%</b>
      </div>
    </section>
    <section class="progress-group accent">
      <div class="progress-copy">
        <span>总计划打卡</span>
        <strong>{{ planProgress?.checkedInDays || 0 }} / {{ planProgress?.totalDays || 0 }}</strong>
        <small>已打卡 / 计划天数</small>
      </div>
      <div class="progress-visual">
        <div class="track"><i :style="{ width: `${planProgress?.percent || 0}%` }"></i></div>
        <b>{{ planProgress?.percent || 0 }}%</b>
      </div>
    </section>
  </div>
</template>

<style scoped>
.learning-progress { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 18px; border: 1px solid #e2e8f0; background: #fff; }
.progress-group { display: grid; grid-template-columns: minmax(150px, .8fr) 1.2fr; align-items: center; gap: 24px; min-width: 0; padding: 20px 22px; border-left: 3px solid #4fc3f7; }
.progress-group + .progress-group { border-top: 0; border-left-color: #0f766e; box-shadow: inset 1px 0 #e2e8f0; }
.progress-copy span, .progress-copy small { display: block; color: #64748b; font-size: 12px; }
.progress-copy strong { display: block; margin: 5px 0 3px; color: #0f172a; font-size: 26px; line-height: 1; }
.progress-visual { display: flex; align-items: center; gap: 12px; min-width: 0; }
.track { flex: 1; height: 8px; overflow: hidden; border-radius: 4px; background: #e2e8f0; }
.track i { display: block; height: 100%; border-radius: inherit; background: #4fc3f7; transition: width .25s ease; }
.accent .track i { background: #0f766e; }
.progress-visual b { min-width: 38px; color: #334155; font-size: 13px; text-align: right; }
@media (max-width: 720px) {
  .learning-progress { grid-template-columns: 1fr; }
  .progress-group + .progress-group { box-shadow: inset 0 1px #e2e8f0; }
}
@media (max-width: 430px) {
  .progress-group { grid-template-columns: 1fr; gap: 12px; }
}
</style>
