<script setup lang="ts">
defineProps<{ modelValue: string; legacyAvailable?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>
<template>
  <div class="spj-protocol">
    <label>SPJ 判定协议
      <select aria-label="SPJ 判定协议" :value="modelValue" @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
        <option value="BOOLEAN_STDOUT">布尔输出（推荐）</option>
        <option value="EXIT_CODE">退出码</option>
        <option v-if="legacyAvailable" value="LEGACY">旧题兼容模式</option>
      </select>
    </label>
    <p v-if="modelValue === 'BOOLEAN_STDOUT'">标准输入为选手输出。判题程序正常退出并输出 true / 1 表示 AC，false / 0 表示 WA；空输出、无效判定或程序异常为系统错误。</p>
    <p v-else-if="modelValue === 'EXIT_CODE'">退出码 0 表示 AC，1 或 2 表示 WA；其它退出码、超时或程序异常为系统错误。仅打印 False 不会判 WA，必须以非零退出码结束。切换协议不会改写已编辑的代码，请检查全部数据后再返回成功。</p>
    <p v-else class="legacy-warning">旧题兼容模式：正常退出且无输出仍会视为 AC。请验题后选择明确协议；更改只影响后续提交，不会重判历史成绩。</p>
    <p>工作目录提供 input（测试输入）、output（本平台 SPJ 数据导入不保留参考输出，该文件为空）、user_output（选手输出）。修改判题代码或测试数据会创建新版本。</p>
  </div>
</template>
<style scoped>
.spj-protocol { margin: 12px 0; }
label { display: flex; flex-direction: column; gap: 8px; font-size: 14px; }
select { width: 100%; padding: 9px 12px; border: 1px solid var(--border-color, #dbe3ee); border-radius: 8px; color: inherit; background: var(--bg-card, white); }
p { font-size: 13px; line-height: 1.7; color: var(--text-secondary, #64748b); margin: 8px 0; }
.legacy-warning { color: var(--warning-color, #a16207); }
</style>
