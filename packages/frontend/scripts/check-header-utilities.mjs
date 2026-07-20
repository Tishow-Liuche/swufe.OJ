import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const app = readFileSync(resolve('src/App.vue'), 'utf8');
const required = [
  "import { Bell, CalendarCheck, Mail, Menu, Search, X } from '@lucide/vue';",
  "import api from './api/client';",
  'function openSearch()',
  'async function fetchNotificationUnread()',
  "to=\"/messages\"",
  "to=\"/notifications\"",
  'class="global-problem-search"',
  'class="header-notification-count"',
  '@media (max-width: 1180px)',
];

for (const token of required) {
  if (!app.includes(token)) throw new Error(`Missing header utility: ${token}`);
}

console.log('header utility checks passed');
