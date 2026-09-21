import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
it('legacy backfill cannot silently overwrite live difficulty without a reviewed manifest', () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/backfill-point-difficulty.js')], { env: { ...process.env, DATABASE_URL: '' }, encoding: 'utf8', timeout: 10000 });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('audit-problem-difficulty.cjs');
});
