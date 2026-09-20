import { describe, expect, it } from 'vitest';
import home from '../views/Home.vue?raw';
import profile from '../views/Profile.vue?raw';
import leaderboard from '../views/Leaderboard.vue?raw';
import badges from './ProblemStateBadges.vue?raw';
import imports from '../views/ImportProblems.vue?raw';
import problem from '../views/ProblemDetail.vue?raw';

describe('restrained interface icon style', () => {
  it.each([['profile', profile], ['leaderboard', leaderboard], ['badges', badges]])('avoids decorative glitter and prize art in %s', (_, source) => {
    expect(source).not.toMatch(/Sparkles|Trophy|rankMedal|[🥇🥈🥉✦]/u);
    expect(source).not.toMatch(/class="(?:hero-artwork|hero-orb|contest-art|problem-art)"/);
  });

  it('preserves the homepage reference artwork when refining other pages', () => {
    expect(home).toContain('class="hero-artwork"');
    expect(home).toContain('class="problem-art"');
    expect(home).toContain('class="contest-art"');
  });

  it('uses numeric ranks for every leaderboard row', () => {
    expect(leaderboard).toContain('<b v-else>{{ row.rank }}</b>');
    expect(leaderboard).toContain('<b aria-hidden="true">{{ row.rank }}</b>');
  });

  it('keeps meaningful labels without decorative emoji', () => {
    expect(imports).not.toContain('📥');
    expect(problem).not.toContain('📊');
    expect(badges).toContain('新题目');
    expect(badges).toContain('CheckCircle2');
    expect(profile).toContain('studentIdDisplay');
    expect(home).toContain('@click="openProblemLibrary"');
    expect(leaderboard).toContain('@update:model-value="selectContest"');
  });
});
