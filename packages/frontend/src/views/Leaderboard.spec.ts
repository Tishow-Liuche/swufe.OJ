import { createApp, nextTick } from 'vue';
import { beforeEach, expect, it, vi } from 'vitest';
import Leaderboard from './Leaderboard.vue';

const mocks = vi.hoisted(() => ({ query: {} as Record<string, string>, get: vi.fn() }));
vi.mock('vue-router', () => ({ useRoute: () => ({ query: mocks.query }), useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('../api/client', () => ({ default: { get: mocks.get } }));

beforeEach(() => {
  mocks.query = {};
  const rows = [1, 2, 3, 4, 12].map(rank => ({ rank, userId: `u${rank}`, username: `user${rank}`, nickname: `选手${rank}`, solvedCount: 20, submissionCount: 30, acceptRate: 67, overallScore: 123, problemScore: 123, contestScore: 0, localSolvedCount: 20, penalty: 42 }));
  mocks.get.mockImplementation(async (url: string) => ({ data: url === '/api/contests' ? [{ id: 'c1', title: '测试赛', state: 'ENDED' }] : url.includes('/standings') ? { contest: { title: '测试赛', mode: 'ACM' }, rows } : rows }));
});

it.each(['GLOBAL', 'OVERALL', 'CONTEST'])('keeps numeric podium medals without rule copy in %s', async scope => {
  if (scope === 'CONTEST') mocks.query = { contestId: 'c1' };
  const host = document.createElement('div');
  const app = createApp(Leaderboard);
  app.mount(host);
  try {
    await vi.waitFor(() => expect(host.querySelectorAll('.board-row')).toHaveLength(5));
    if (scope === 'OVERALL') {
      (host.querySelectorAll('.rank-switcher button')[2] as HTMLButtonElement).click();
      await nextTick();
      await vi.waitFor(() => expect(host.querySelector('.board-row.overall')).not.toBeNull());
      expect(host.querySelector('.board-row')?.textContent).toContain('123');
      expect(host.querySelector('.score-breakdown')?.textContent).toContain('做题 123 + 比赛 0');
    }
    expect(host.querySelector('.leaderboard-hero p:not(.eyebrow)')).toBeNull();
    expect(host.querySelector('.rank-switcher small')).toBeNull();
    const medals = [...host.querySelectorAll('.rank-medal')];
    expect(medals).toHaveLength(3);
    expect(medals.map(m => m.getAttribute('aria-label'))).toEqual(['第 1 名，金牌', '第 2 名，银牌', '第 3 名，铜牌']);
    expect(medals.map(m => m.textContent?.trim())).toEqual(['1', '2', '3']);
    expect(host.querySelectorAll('.board-row')[3]?.querySelector('.rank')?.textContent?.trim()).toBe('4');
    expect(host.querySelectorAll('.board-row')[4]?.querySelector('.rank')?.textContent?.trim()).toBe('12');
  } finally { app.unmount(); }
});
