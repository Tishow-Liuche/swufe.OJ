<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import api from '../../api/client';
import { errorText, problemDisplayTitle, statusText } from './contest';
const props = defineProps<{ contestId: string; submissionId: string }>();
const emit = defineEmits<{ close: [] }>();
const detail = ref<any>(null); const error = ref(''); const loading = ref(true);
const dialog = ref<HTMLDialogElement | null>(null);
let controller: AbortController | undefined; let generation = 0;
async function load() {
  const current = ++generation; controller?.abort(); controller = new AbortController();
  detail.value = null; error.value = ''; loading.value = true;
  try {
    const { data } = await api.get(`/api/contests/${props.contestId}/submissions/${props.submissionId}`, { signal: controller.signal });
    if (current === generation) detail.value = data;
  } catch(e) { if (current === generation && !controller.signal.aborted) error.value = errorText(e, '无法查看该提交'); }
  finally { if (current === generation) loading.value = false; }
}
watch(() => [props.contestId, props.submissionId], () => void load(), { immediate: true });
onMounted(() => dialog.value?.showModal());
onUnmounted(() => { generation++; controller?.abort(); dialog.value?.close(); });
</script>
<template>
  <dialog ref="dialog" class="arena-submission-dialog" aria-label="比赛提交详情" @cancel.prevent="emit('close')" @click="event => { if (event.target === dialog) emit('close'); }">
    <header><h2>提交详情</h2><button type="button" aria-label="关闭提交详情" @click="emit('close')">关闭</button></header>
    <p v-if="loading" role="status">正在加载提交…</p><p v-else-if="error" class="arena-error" role="alert">{{ error }}</p>
    <template v-else-if="detail">
      <dl class="arena-facts">
        <div><dt>选手</dt><dd>{{ detail.user?.nickname || detail.user?.username }}</dd></div>
        <div><dt>题目</dt><dd>{{ problemDisplayTitle(detail.problem) }}</dd></div>
        <div><dt>结果 / 语言</dt><dd>{{ statusText(detail.status) }} / {{ detail.language }}</dd></div>
        <div><dt>实际耗时 / 内存</dt><dd>{{ detail.timeUsed ?? '—' }} ms / {{ detail.memoryUsed ?? '—' }} KB</dd></div>
        <div><dt>时限 / 内存限制</dt><dd>{{ detail.problem?.timeLimit ?? '—' }} ms / {{ detail.problem?.memoryLimit ?? '—' }} MB</dd></div>
      </dl>
      <h3>源代码</h3><pre><code>{{ detail.sourceCode }}</code></pre>
    </template>
  </dialog>
</template>
