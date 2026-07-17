<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  name?: string | null;
  avatar?: string | null;
  size?: number;
  label?: string;
}>(), {
  name: '',
  avatar: null,
  size: 36,
  label: '',
});

const imageFailed = ref(false);
const initials = computed(() => (props.name || 'OJ').trim().slice(0, 2).toUpperCase());
const accessibleLabel = computed(() => props.label || `${props.name || '用户'}的头像`);

watch(() => props.avatar, () => {
  imageFailed.value = false;
});
</script>

<template>
  <span
    class="user-avatar"
    :style="{ '--avatar-size': `${size}px` }"
    :aria-label="accessibleLabel"
    role="img"
  >
    <img v-if="avatar && !imageFailed" :src="avatar" alt="" aria-hidden="true" @error="imageFailed = true" />
    <span v-else aria-hidden="true">{{ initials }}</span>
  </span>
</template>

<style scoped>
.user-avatar {
  display: inline-grid;
  width: var(--avatar-size);
  height: var(--avatar-size);
  flex: 0 0 var(--avatar-size);
  place-items: center;
  overflow: hidden;
  border: 1px solid #c9dcf6;
  border-radius: 50%;
  background: #e7efff;
  color: #1f5eff;
  font-size: calc(var(--avatar-size) * 0.36);
  font-weight: 800;
  line-height: 1;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
