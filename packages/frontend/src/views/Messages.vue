<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  ArrowLeft,
  Mail,
  MessageCircleMore,
  RefreshCw,
  Search,
  Send,
  UserRoundSearch,
} from '@lucide/vue';
import '@fontsource-variable/manrope/wght.css';
import '@fontsource-variable/noto-sans-sc/wght.css';
import api from '../api/client';
import UserAvatar from '../components/UserAvatar.vue';
import { useAuthStore } from '../stores/auth';

interface Person {
  id: string;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
}

interface DirectMessage {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  readAt?: string | null;
  createdAt: string;
  sender: Person;
}

interface Conversation {
  id: string;
  lastMessageAt: string;
  canSend?: boolean;
  messagingUnlocked?: boolean;
  counterpart: Person;
  lastMessage?: DirectMessage | null;
  unreadCount?: number;
}

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const conversations = ref<Conversation[]>([]);
const contactSearch = ref('');
const contactResults = ref<Person[]>([]);
const selectedConversationId = ref('');
const selectedContact = ref<Person | null>(null);
const messages = ref<DirectMessage[]>([]);
const messageDraft = ref('');
const loading = ref(false);
const conversationLoading = ref(false);
const sending = ref(false);
const error = ref('');
const messagesEnd = ref<HTMLElement | null>(null);
let contactSearchTimer = 0;

const selectedConversation = computed(() => conversations.value.find((item) => item.id === selectedConversationId.value) || null);
const target = computed<Person | null>(() => selectedConversation.value?.counterpart || selectedContact.value);
const targetName = computed(() => target.value?.nickname || target.value?.username || '私信');
const searched = computed(() => contactSearch.value.trim().length > 0);
const canSendMessage = computed(() => !selectedConversation.value || selectedConversation.value.canSend !== false);
const composerHint = computed(() => canSendMessage.value
  ? `${messageDraft.value.length}/2000`
  : '已发送首条私信，等待对方回复后可继续发送');

onMounted(async () => {
  await loadConversations();
  await syncRouteSelection();
});

watch(contactSearch, () => {
  window.clearTimeout(contactSearchTimer);
  const keyword = contactSearch.value.trim();
  if (!keyword) {
    contactResults.value = [];
    return;
  }
  contactSearchTimer = window.setTimeout(() => void searchContacts(keyword), 220);
});

watch(() => [route.query.conversation, route.query.contact], async () => {
  await syncRouteSelection();
});

function routeConversationId() {
  const value = route.query.conversation;
  return Array.isArray(value) ? value[0] || '' : typeof value === 'string' ? value : '';
}

function routeContactId() {
  const value = route.query.contact;
  return Array.isArray(value) ? value[0] || '' : typeof value === 'string' ? value : '';
}

async function syncRouteSelection() {
  const requestedConversationId = routeConversationId();
  if (requestedConversationId) {
    if (requestedConversationId !== selectedConversationId.value) await selectConversation(requestedConversationId, false);
    return;
  }
  const contactId = routeContactId();
  if (!contactId || contactId === selectedContact.value?.id || contactId === selectedConversation.value?.counterpart.id) return;
  try {
    const { data } = await api.get<Person>(`/api/messages/contacts/${contactId}`);
    selectContact(data, false);
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '该联系人暂时无法发起私信';
  }
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat('zh-CN', sameDay
    ? { hour: '2-digit', minute: '2-digit' }
    : { month: 'numeric', day: 'numeric' },
  ).format(date);
}

function updateConversationRoute(conversationId = '', contactId = '') {
  const query = conversationId ? { conversation: conversationId } : (contactId ? { contact: contactId } : {});
  if (routeConversationId() === conversationId && routeContactId() === contactId) return;
  void router.replace({ path: '/messages', query });
}

async function loadConversations() {
  loading.value = true;
  error.value = '';
  try {
    const { data } = await api.get<Conversation[]>('/api/messages/conversations');
    conversations.value = data || [];
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '私信列表暂时无法加载';
  } finally {
    loading.value = false;
  }
}

async function searchContacts(keyword: string) {
  try {
    const { data } = await api.get<Person[]>('/api/messages/contacts', { params: { keyword } });
    if (contactSearch.value.trim() === keyword) contactResults.value = data || [];
  } catch {
    if (contactSearch.value.trim() === keyword) contactResults.value = [];
  }
}

async function selectConversation(conversationId: string, syncRoute = true) {
  if (!conversationId || conversationLoading.value) return;
  selectedConversationId.value = conversationId;
  selectedContact.value = null;
  conversationLoading.value = true;
  error.value = '';
  if (syncRoute) updateConversationRoute(conversationId);
  try {
    const { data } = await api.get<{ conversation: Conversation; messages: DirectMessage[] }>(`/api/messages/conversations/${conversationId}`);
    if (selectedConversationId.value !== conversationId) return;
    messages.value = data.messages || [];
    const index = conversations.value.findIndex((item) => item.id === conversationId);
    if (index >= 0) conversations.value[index] = { ...conversations.value[index], ...data.conversation, unreadCount: 0 };
    await scrollToLatest();
  } catch (requestError: any) {
    if (selectedConversationId.value === conversationId) {
      error.value = requestError.response?.data?.message || '该私信会话无法打开';
      selectedConversationId.value = '';
    }
  } finally {
    if (selectedConversationId.value === conversationId) conversationLoading.value = false;
  }
}

function selectContact(contact: Person, syncRoute = true) {
  const existing = conversations.value.find((item) => item.counterpart.id === contact.id);
  if (existing) {
    void selectConversation(existing.id);
    return;
  }
  selectedConversationId.value = '';
  selectedContact.value = contact;
  messages.value = [];
  error.value = '';
  if (syncRoute) updateConversationRoute('', contact.id);
}

async function sendMessage() {
  const content = messageDraft.value.trim();
  const recipientId = target.value?.id;
  if (!content || !recipientId || sending.value || !canSendMessage.value) return;
  sending.value = true;
  error.value = '';
  try {
    const { data } = await api.post<DirectMessage>('/api/messages', { recipientId, content });
    messageDraft.value = '';
    messages.value = [...messages.value, data];
    selectedConversationId.value = data.conversationId;
    selectedContact.value = null;
    await loadConversations();
    updateConversationRoute(data.conversationId);
    await scrollToLatest();
  } catch (requestError: any) {
    error.value = requestError.response?.data?.message || '私信发送失败，请稍后重试';
  } finally {
    sending.value = false;
  }
}

async function scrollToLatest() {
  await nextTick();
  messagesEnd.value?.scrollIntoView({ block: 'end', behavior: 'smooth' });
}
</script>

<template>
  <div class="messages-page">
    <header class="messages-hero">
      <div>
        <p>DIRECT MESSAGES</p>
        <h1>个人私信</h1>
        <span>搜索平台账号，建立一对一的训练交流。</span>
      </div>
      <button class="refresh-button" type="button" :disabled="loading" @click="loadConversations">
        <RefreshCw :size="16" :class="{ spinning: loading }" />刷新会话
      </button>
    </header>

    <div class="messages-workspace">
      <aside class="messages-sidebar" aria-label="私信联系人">
        <div class="sidebar-title"><Mail :size="18" /><strong>联系人</strong><span>{{ conversations.length }}</span></div>
        <label class="contact-search">
          <Search :size="16" />
          <input v-model="contactSearch" type="search" placeholder="搜索用户名或昵称" aria-label="搜索联系人" />
        </label>

        <section v-if="searched" class="contact-results" aria-live="polite">
          <p>搜索结果</p>
          <button v-for="contact in contactResults" :key="contact.id" type="button" @click="selectContact(contact)">
            <UserAvatar :name="contact.nickname || contact.username" :avatar="contact.avatar" :size="32" />
            <span><b>{{ contact.nickname || contact.username }}</b><small>@{{ contact.username }}</small></span>
          </button>
          <div v-if="!contactResults.length" class="no-contact"><UserRoundSearch :size="17" />未找到匹配账号</div>
        </section>

        <section class="conversation-list">
          <p>最近联系</p>
          <button
            v-for="conversation in conversations"
            :key="conversation.id"
            type="button"
            :class="{ active: conversation.id === selectedConversationId }"
            @click="selectConversation(conversation.id)"
          >
            <UserAvatar :name="conversation.counterpart.nickname || conversation.counterpart.username" :avatar="conversation.counterpart.avatar" :size="36" />
            <span class="conversation-copy">
              <span><b>{{ conversation.counterpart.nickname || conversation.counterpart.username }}</b><time>{{ formatTime(conversation.lastMessageAt) }}</time></span>
              <small>{{ conversation.lastMessage?.content || '开始一段对话' }}</small>
            </span>
            <i v-if="conversation.unreadCount" class="unread-dot">{{ conversation.unreadCount > 9 ? '9+' : conversation.unreadCount }}</i>
          </button>
          <div v-if="!loading && !conversations.length" class="no-conversation"><Mail :size="22" /><span>暂无最近联系人</span></div>
        </section>
      </aside>

      <section class="conversation-panel" aria-live="polite">
        <template v-if="target">
          <header class="conversation-header">
            <button class="mobile-back" type="button" title="返回联系人" @click="selectedConversationId = ''; selectedContact = null; updateConversationRoute()"><ArrowLeft :size="18" /></button>
            <UserAvatar :name="targetName" :avatar="target.avatar" :size="38" />
            <div><h2>{{ targetName }}</h2><span>@{{ target.username }}</span></div>
          </header>

          <div class="message-stream" :class="{ loading: conversationLoading }">
            <div v-if="conversationLoading" class="stream-state">正在加载消息...</div>
            <template v-else>
              <div v-if="!messages.length" class="stream-state empty"><MessageCircleMore :size="34" /><b>还没有私信记录</b><span>发一条消息，开始这段对话。</span></div>
              <article v-for="message in messages" :key="message.id" class="message-row" :class="{ mine: message.senderId === auth.user?.id }">
                <UserAvatar v-if="message.senderId !== auth.user?.id" :name="message.sender.nickname || message.sender.username" :avatar="message.sender.avatar" :size="30" />
                <div class="message-bubble"><p>{{ message.content }}</p><time>{{ formatTime(message.createdAt) }}</time></div>
              </article>
              <div ref="messagesEnd"></div>
            </template>
          </div>

          <form class="message-composer" @submit.prevent="sendMessage">
            <textarea
              v-model="messageDraft"
              maxlength="2000"
              :disabled="!canSendMessage"
              :placeholder="canSendMessage ? '输入私信内容，Enter 发送，Shift + Enter 换行' : '等待对方回复后可继续发送'"
              aria-label="私信内容"
              @keydown.enter.exact.prevent="sendMessage"
            />
            <footer><span :class="{ 'turn-locked': !canSendMessage }">{{ composerHint }}</span><button type="submit" :disabled="!messageDraft.trim() || sending || !canSendMessage"><Send :size="16" />{{ sending ? '发送中' : '发送' }}</button></footer>
          </form>
        </template>

        <div v-else class="blank-conversation">
          <div><Mail :size="34" /><h2>选择一位联系人</h2><p>在左侧搜索平台账号，或继续已有私信。</p></div>
        </div>
      </section>
    </div>
    <p v-if="error" class="messages-error">{{ error }}</p>
  </div>
</template>

<style scoped>
.messages-page { width: min(1180px, calc(100% - 40px)); min-height: calc(100vh - 56px); margin: 0 auto; padding: 28px 0 56px; color: #24364b; font-family: 'Manrope Variable', 'Noto Sans SC Variable', 'Microsoft YaHei', sans-serif; }
.messages-hero { display: flex; min-height: 132px; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 18px; padding: 24px 30px; border: 1px solid #dce5ef; border-radius: 8px; background: #fff; box-shadow: 0 9px 22px rgba(31, 66, 104, .07); }
.messages-hero p { margin: 0 0 5px; color: #3977aa; font-size: 11px; font-weight: 850; letter-spacing: 0; }.messages-hero h1 { margin: 0; color: #1f2a37; font-size: 30px; }.messages-hero span { display: block; margin-top: 7px; color: #6d7d90; font-size: 13px; }
.refresh-button { display: inline-flex; min-height: 36px; align-items: center; gap: 7px; padding: 0 12px; border: 1px solid #bfd4ed; border-radius: 6px; background: #f6faff; color: #2469ad; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; }.refresh-button:hover { border-color: #8eb6de; background: #edf5ff; }.refresh-button:disabled { cursor: wait; opacity: .65; }.spinning { animation: spin .8s linear infinite; }
.messages-workspace { display: grid; min-height: 640px; grid-template-columns: 300px minmax(0, 1fr); overflow: hidden; border: 1px solid #dce5ef; border-radius: 8px; background: #fff; box-shadow: 0 8px 20px rgba(31, 66, 104, .05); }
.messages-sidebar { display: flex; min-width: 0; flex-direction: column; border-right: 1px solid #e2e9f1; background: #fbfcfe; }.sidebar-title { display: flex; height: 60px; align-items: center; gap: 8px; padding: 0 17px; border-bottom: 1px solid #e2e9f1; color: #24364b; }.sidebar-title svg { color: #1f5eff; }.sidebar-title strong { font-size: 15px; }.sidebar-title span { margin-left: auto; color: #7890aa; font-size: 12px; }
.contact-search { display: flex; height: 38px; align-items: center; gap: 8px; margin: 14px 14px 10px; padding: 0 10px; border: 1px solid #ccd9e6; border-radius: 6px; background: #fff; color: #718096; }.contact-search:focus-within { border-color: #3979ad; box-shadow: 0 0 0 3px #deedf9; }.contact-search input { width: 100%; border: 0; outline: 0; background: transparent; color: #24364b; font: inherit; font-size: 13px; }
.contact-results { margin: 0 10px 7px; padding: 0 4px 8px; border-bottom: 1px solid #e3eaf2; }.contact-results > p, .conversation-list > p { margin: 0; padding: 6px 5px 7px; color: #8491a2; font-size: 11px; font-weight: 800; }.contact-results > button, .conversation-list > button { position: relative; display: flex; width: 100%; min-height: 51px; align-items: center; gap: 9px; padding: 7px 7px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }.contact-results > button:hover, .conversation-list > button:hover { background: #f0f6fe; }.contact-results button > span { display: grid; min-width: 0; gap: 1px; }.contact-results b { overflow: hidden; color: #32475c; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.contact-results small { color: #8592a4; font-size: 11px; }
.conversation-list { min-height: 0; flex: 1; overflow-y: auto; padding: 0 10px 12px; }.conversation-list > p { padding-top: 9px; }.conversation-list > button.active { border-color: #c8dbf7; background: #eaf2ff; }.conversation-copy { display: grid; min-width: 0; flex: 1; gap: 4px; }.conversation-copy > span { display: flex; min-width: 0; justify-content: space-between; gap: 8px; }.conversation-copy b { overflow: hidden; color: #2c4055; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }.conversation-copy time { flex: 0 0 auto; color: #8b99a9; font-size: 10px; }.conversation-copy small { overflow: hidden; color: #8491a2; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.unread-dot { display: inline-grid; min-width: 17px; height: 17px; place-items: center; margin-left: 2px; border-radius: 9px; background: #e24a4a; color: #fff; font-size: 9px; font-style: normal; font-weight: 800; }.no-contact, .no-conversation { display: grid; justify-items: center; gap: 5px; padding: 17px 8px; color: #94a1b1; font-size: 12px; text-align: center; }.no-contact { grid-template-columns: auto auto; align-items: center; justify-content: center; }.no-conversation svg { color: #9bb9de; }
.conversation-panel { display: flex; min-width: 0; flex-direction: column; background: #fff; }.conversation-header { display: flex; min-height: 60px; align-items: center; gap: 10px; padding: 0 20px; border-bottom: 1px solid #e2e9f1; }.conversation-header h2 { margin: 0; color: #283c52; font-size: 15px; }.conversation-header span { display: block; margin-top: 2px; color: #8190a2; font-size: 11px; }.mobile-back { display: none; }
.message-stream { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 13px; overflow-y: auto; padding: 22px 24px; background: #f8faff; }.stream-state { display: grid; min-height: 100%; place-items: center; color: #8897a8; font-size: 13px; }.stream-state.empty { align-content: center; justify-items: center; gap: 8px; }.stream-state.empty svg { color: #90b7e4; }.stream-state.empty b { color: #53687e; font-size: 14px; }.stream-state.empty span { color: #8996a5; font-size: 12px; }
.message-row { display: flex; max-width: 76%; align-items: flex-end; gap: 8px; }.message-row.mine { align-self: flex-end; }.message-bubble { min-width: 0; padding: 9px 11px 6px; border: 1px solid #dce6f2; border-radius: 7px 7px 7px 2px; background: #fff; box-shadow: 0 2px 5px rgba(55, 84, 118, .04); }.message-row.mine .message-bubble { border-color: #a7c7f3; border-radius: 7px 7px 2px 7px; background: #eaf3ff; }.message-bubble p { margin: 0; overflow-wrap: anywhere; color: #31475e; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }.message-bubble time { display: block; margin-top: 3px; color: #8a99a9; font-size: 10px; text-align: right; }
.message-composer { display: grid; gap: 8px; padding: 13px 18px 14px; border-top: 1px solid #e2e9f1; background: #fff; }.message-composer textarea { width: 100%; min-height: 66px; resize: vertical; border: 1px solid #ccd9e6; border-radius: 6px; padding: 8px 10px; outline: 0; color: #273b50; font: inherit; font-size: 13px; line-height: 1.5; }.message-composer textarea:focus { border-color: #3979ad; box-shadow: 0 0 0 3px #deedf9; }.message-composer textarea:disabled { resize: none; border-color: #dce4ed; background: #f7f9fb; color: #91a0af; cursor: not-allowed; }.message-composer footer { display: flex; align-items: center; justify-content: space-between; }.message-composer footer > span { color: #94a0ae; font-size: 11px; }.message-composer footer > .turn-locked { color: #a66a18; }.message-composer button { display: inline-flex; min-height: 32px; align-items: center; gap: 6px; padding: 0 12px; border: 0; border-radius: 6px; background: #2469ad; color: #fff; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }.message-composer button:hover { background: #1b578f; }.message-composer button:disabled { cursor: not-allowed; opacity: .55; }
.blank-conversation { display: grid; min-height: 100%; place-items: center; padding: 30px; background: #fbfcfe; text-align: center; }.blank-conversation > div { display: grid; justify-items: center; gap: 8px; color: #8b98a8; }.blank-conversation svg { color: #96b8e0; }.blank-conversation h2 { margin: 2px 0 0; color: #51657b; font-size: 16px; }.blank-conversation p { margin: 0; font-size: 13px; }.messages-error { margin: 12px 0 0; padding: 10px 12px; border: 1px solid #f1c9ca; border-radius: 6px; background: #fff5f5; color: #bf3c42; font-size: 13px; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 760px) { .messages-page { width: min(100% - 28px, 1180px); padding-top: 18px; }.messages-hero { min-height: 116px; padding: 20px; }.messages-hero h1 { font-size: 26px; }.refresh-button { align-self: flex-start; }.messages-workspace { min-height: calc(100vh - 214px); grid-template-columns: 1fr; }.messages-sidebar { border-right: 0; }.conversation-panel { display: none; }.messages-workspace:has(.conversation-header) .messages-sidebar { display: none; }.messages-workspace:has(.conversation-header) .conversation-panel { display: flex; }.mobile-back { display: inline-grid; width: 32px; height: 32px; place-items: center; border: 1px solid #d6e2ee; border-radius: 6px; background: #fff; color: #4d637a; }.message-stream { padding: 18px 14px; }.message-row { max-width: 88%; }.message-composer { padding: 12px; } }
@media (max-width: 520px) { .messages-hero { align-items: flex-start; flex-direction: column; gap: 12px; }.refresh-button { width: 100%; justify-content: center; }.messages-workspace { min-height: calc(100vh - 264px); }.conversation-header { padding: 0 12px; } }
</style>
