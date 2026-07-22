import { describe, expect, it } from 'vitest';
import classManageSource from '../views/teacher/ClassManage.vue?raw';

describe('teacher filter select theme', () => {
  it('provides the teacher workspace palette to shared filter selects', () => {
    const workspaceRule = classManageSource.match(/\.teacher-workspace\s*\{([^}]*)\}/s)?.[1] || '';

    expect(workspaceRule).toMatch(/--surface:\s*#fff/);
    expect(workspaceRule).toMatch(/--surface-low:\s*#f7fbff/);
    expect(workspaceRule).toMatch(/--outline:\s*#cbd9e6/);
    expect(workspaceRule).toMatch(/--primary:\s*#2469ad/);
    expect(workspaceRule).toMatch(/--primary-strong:\s*#174f84/);
    expect(workspaceRule).toMatch(/--primary-container:\s*#e7efff/);
  });
});
