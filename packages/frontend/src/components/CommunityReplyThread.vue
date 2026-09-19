<script setup lang="ts">
import { computed } from 'vue';
import { Flag, Reply, ThumbsUp } from '@lucide/vue';
import UserAvatar from './UserAvatar.vue';

type ReplyItem = {
  id: string;
  content: string;
  createdAt?: string;
  reactionCount?: number;
  viewerReacted?: boolean;
  author?: { id?: string; nickname?: string | null; username?: string | null; avatar?: string | null; role?: string | null; createdAt?: string } | null;
  children?: ReplyItem[];
};

const props = withDefaults(defineProps<{
  reply: ReplyItem;
  depth?: number;
}>(), {
  depth: 0,
});

const emit = defineEmits<{
  reply: [reply: ReplyItem];
  react: [reply: ReplyItem];
  report: [reply: ReplyItem];
  profile: [author: NonNullable<ReplyItem['author']>];
}>();

const authorName = computed(() => props.reply.author?.nickname || props.reply.author?.username || '用户');
const visualDepth = computed(() => Math.min(props.depth, 5));

function formatDate(value?: string) {
  if (!value) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function forwardReply(reply: ReplyItem) {
  emit('reply', reply);
}

function forwardReaction(reply: ReplyItem) {
  emit('react', reply);
}

function forwardReport(reply: ReplyItem) {
  emit('report', reply);
}

function forwardProfile() {
  if (props.reply.author?.id) emit('profile', props.reply.author);
}
</script>

<template>
  <article class="thread-reply" :class="{ 'is-nested': depth > 0 }" :style="{ '--reply-depth': visualDepth }">
    <header class="thread-reply-author">
      <button class="reply-avatar-button" type="button" :title="`查看 ${authorName} 的资料`" @click="forwardProfile"><UserAvatar :name="authorName" :avatar="reply.author?.avatar" :size="depth > 0 ? 29 : 32" /></button>
      <div><b>{{ authorName }}</b><time>{{ formatDate(reply.createdAt) }}</time></div>
    </header>
    <p>{{ reply.content }}</p>
    <footer class="thread-reply-actions">
      <button type="button" :class="{ reacted: reply.viewerReacted }" :title="reply.viewerReacted ? '取消点赞' : '点赞'" @click="forwardReaction(reply)"><ThumbsUp :size="14" />{{ reply.reactionCount || 0 }}</button>
      <button type="button" @click="forwardReply(reply)"><Reply :size="14" />回复</button>
      <button type="button" class="report-command" title="举报此回复" @click="forwardReport(reply)"><Flag :size="14" />举报</button>
    </footer>
    <div v-if="reply.children?.length" class="thread-reply-branch">
      <CommunityReplyThread
        v-for="child in reply.children"
        :key="child.id"
        :reply="child"
        :depth="depth + 1"
        @reply="forwardReply"
        @react="forwardReaction"
        @report="forwardReport"
        @profile="forwardProfile"
      />
    </div>
  </article>
</template>

<style scoped>
.thread-reply { position: relative; padding: 17px 0 12px; }
.thread-reply + .thread-reply { margin-top: 3px; }
.thread-reply:hover { background: rgba(248, 251, 254, .62); }
.thread-reply-author { display: flex; align-items: center; gap: 9px; }
.reply-avatar-button { display: inline-grid; padding: 0; border: 0; border-radius: 50%; background: transparent; cursor: pointer; }
.reply-avatar-button:hover :deep(.user-avatar) { box-shadow: 0 0 0 3px #dbeafe; }
.thread-reply-author > div { display: flex; min-width: 0; flex-wrap: wrap; align-items: baseline; gap: 5px 8px; }
.thread-reply-author b { overflow: hidden; color: #26394e; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.thread-reply-author time { color: #92a0af; font-size: 10px; }
.thread-reply > p { margin: 10px 0 8px 41px; color: #304357; line-height: 1.72; white-space: pre-wrap; }
.thread-reply-actions { display: flex; align-items: center; gap: 13px; margin-left: 41px; }
.thread-reply-actions button { display: inline-flex; align-items: center; gap: 5px; padding: 0; border: 0; background: transparent; color: #8191a3; font: inherit; font-size: 11px; cursor: pointer; }
.thread-reply-actions button:hover, .thread-reply-actions button.reacted { color: #1f5eff; }
.thread-reply-actions .report-command:hover { color: #bf4a47; }
.thread-reply-branch { position: relative; margin: 11px 0 1px 25px; padding-left: 14px; }
.thread-reply-branch::before { position: absolute; top: 4px; bottom: 11px; left: 0; width: 2px; border-radius: 2px; background: #dce8f5; content: ''; }
.thread-reply-branch > .thread-reply { padding-top: 13px; }
.thread-reply-branch > .thread-reply:first-child { padding-top: 4px; }
@media (max-width: 720px) {
  .thread-reply > p, .thread-reply-actions { margin-left: 0; }
  .thread-reply-branch { margin-left: 20px; padding-left: 10px; }
}
</style>
