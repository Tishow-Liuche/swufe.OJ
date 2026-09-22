<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { detectHelper, helperNames, type HelperPlatform } from '../utils/helper-presence';
const props = defineProps<{ platform: HelperPlatform }>();
const emit = defineEmits<{ close: []; ready: [] }>();
const dialog = ref<HTMLDialogElement>();
const checking = ref(false);
const checked = ref(false);
onMounted(() => dialog.value?.showModal());
async function recheck() {
  if (checking.value) return;
  checking.value = true;
  try {
    if (await detectHelper(props.platform)) { emit('ready'); emit('close'); }
    else checked.value = true;
  } finally { checking.value = false; }
}
</script>

<template>
  <dialog ref="dialog" class="helper-install-dialog" aria-labelledby="helper-install-title" @close="emit('close')">
    <header><h2 id="helper-install-title">提交前，请安装辅助脚本</h2><button aria-label="关闭" @click="dialog?.close()">×</button></header>
    <div class="helper-install-body">
      <p>未检测到可用的 <strong>{{ helperNames[platform] }}</strong> 提交脚本。</p>
      <p class="helper-install-hint">脚本用于自动填写代码、选择语言和回传评测结果。本次尚未提交，你的代码会保留。</p>
      <ol><li>打开安装页，按提示安装脚本管理器和对应平台的脚本。</li><li>已安装的用户，请确认脚本已启用并更新到最新版。</li><li>安装后刷新本页，再点击提交代码。</li></ol>
      <p v-if="checked" role="status" class="helper-install-hint">仍未检测到脚本。请确认浏览器已允许脚本运行，并刷新本页后重试。</p>
      <footer><button :disabled="checking" @click="recheck">{{ checking ? '正在检测…' : '重新检测' }}</button><a href="/install-oj-helpers.html" target="_blank" rel="noopener noreferrer">前往安装</a></footer>
    </div>
  </dialog>
</template>

<style scoped>
.helper-install-dialog { position: fixed; inset: 0; margin: auto; width: min(500px, calc(100vw - 40px)); max-height: calc(100dvh - 40px); overflow: auto; padding: 0; border: 1px solid #dbe4ed; border-radius: 14px; color: #26384d; background: #fff; box-shadow: 0 24px 70px #0f172a40; }
.helper-install-dialog::backdrop { background: #0f172a80; }
header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 22px; border-bottom: 1px solid #e8edf3; }
h2 { margin: 0; font-size: 18px; } header button { border: 0; background: transparent; font-size: 26px; color: #64748b; cursor: pointer; }
.helper-install-body { padding: 8px 22px 22px; font-size: 14px; line-height: 1.8; }
.helper-install-hint, ol { color: #64748b; } ol { padding-left: 20px; } li + li { margin-top: 6px; }
footer { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; margin-top: 20px; }
footer button, footer a { padding: 8px 16px; border-radius: 8px; border: 1px solid #dbe4ed; font: inherit; text-decoration: none; cursor: pointer; }
footer button { background: #f8fafc; color: #475569; } footer a { background: #2563eb; color: #fff; border-color: #2563eb; } button:disabled { opacity: .6; cursor: wait; }
</style>
