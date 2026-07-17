<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  date: string;
  planName?: string;
  saving?: boolean;
}>();

defineEmits<{
  confirm: [];
  close: [];
}>();

const formattedDate = computed(() => new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai',
}).format(new Date(`${props.date}T12:00:00+08:00`)));
</script>

<template>
  <div class="checkin-backdrop" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
    <section class="checkin-sheet">
      <button class="close-button" aria-label="稍后打卡" @click="$emit('close')">×</button>
      <div class="checkin-content">
        <span class="kicker">DAILY CHECK-IN</span>
        <h2 id="checkin-title">今日目标已完成</h2>
        <p>{{ planName || '学习计划' }}</p>
        <time :datetime="date">{{ formattedDate }}</time>
        <div class="checkin-actions">
          <button class="confirm-button" :disabled="saving" @click="$emit('confirm')">
            <span>✓</span>{{ saving ? '正在打卡' : '完成今日打卡' }}
          </button>
          <button class="later-button" @click="$emit('close')">稍后打卡</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.checkin-backdrop { position: fixed; inset: 0; z-index: 260; display: grid; place-items: center; padding: 20px; background: rgba(15, 12, 41, .78); }
.checkin-sheet { position: relative; width: min(760px, 100%); min-height: min(620px, calc(100vh - 40px)); overflow: hidden; border-radius: 8px; background-image: linear-gradient(180deg, rgba(15, 12, 41, .18), rgba(15, 12, 41, .88)), url('../assets/checkin-background.jpg'); background-position: center; background-size: cover; box-shadow: 0 28px 80px rgba(0, 0, 0, .38); color: #fff; }
.close-button { position: absolute; top: 16px; right: 18px; z-index: 1; width: 38px; height: 38px; border: 0; border-radius: 50%; background: rgba(15, 12, 41, .58); color: #fff; cursor: pointer; font-size: 24px; }
.checkin-content { position: absolute; inset: auto 0 0; padding: 44px 48px 48px; }
.kicker { color: #81d4fa; font-size: 11px; font-weight: 800; letter-spacing: .16em; }
h2 { margin: 8px 0 6px; color: #fff; font-size: 38px; line-height: 1.12; letter-spacing: 0; }
p { margin: 0; color: #cbd5e1; font-size: 15px; }
time { display: block; margin: 24px 0 28px; color: #fff; font-size: 20px; font-weight: 700; }
.checkin-actions { display: flex; align-items: center; gap: 14px; }
.confirm-button, .later-button { border: 0; border-radius: 6px; padding: 12px 18px; cursor: pointer; font: inherit; font-weight: 700; }
.confirm-button { display: inline-flex; align-items: center; gap: 8px; background: #4fc3f7; color: #0f0c29; }
.confirm-button:disabled { opacity: .65; cursor: wait; }
.confirm-button span { font-size: 18px; }
.later-button { background: rgba(255, 255, 255, .12); color: #fff; }
@media (max-width: 600px) {
  .checkin-sheet { min-height: calc(100vh - 28px); }
  .checkin-content { padding: 36px 24px 30px; }
  h2 { font-size: 30px; }
  .checkin-actions { align-items: stretch; flex-direction: column; }
}
</style>
