const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertAuthSchemaRows,
  buildPrismaSyncCommands,
  isLikelyBackendProcess,
  parseListeningPidsFromNetstat,
  parsePreflightOptions,
  selectKillablePortProcesses,
} = require('./dev-preflight');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

test('assertAuthSchemaRows throws a clear error when refreshTokenHash is missing', () => {
  assert.throws(
    () => assertAuthSchemaRows([]),
    /UserSession\.refreshTokenHash.*npm run db:sync/s,
  );
});

test('assertAuthSchemaRows accepts the secure refresh token schema', () => {
  assert.doesNotThrow(() =>
    assertAuthSchemaRows([{ table_name: 'UserSession', column_name: 'refreshTokenHash' }]),
  );
});

test('buildPrismaSyncCommands deploys migrations before generating Prisma Client', () => {
  assert.deepEqual(buildPrismaSyncCommands(), [
    { command: 'npx', args: ['prisma', 'migrate', 'deploy'] },
    { command: 'npx', args: ['prisma', 'generate'] },
  ]);
});

test('parseListeningPidsFromNetstat returns unique listener pids and ignores current pid', () => {
  const output = [
    '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234',
    '  TCP    [::]:3000              [::]:0                 LISTENING       1234',
    '  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       5678',
    '  TCP    127.0.0.1:3000         0.0.0.0:0              ESTABLISHED     9999',
  ].join('\n');

  assert.deepEqual(parseListeningPidsFromNetstat(output, 3000, 4321), [1234]);
  assert.deepEqual(parseListeningPidsFromNetstat(output, 3000, 1234), []);
});

test('isLikelyBackendProcess only accepts node processes from the backend root', () => {
  const backendRoot = 'C:\\西财OJ平台\\packages\\backend';

  assert.equal(
    isLikelyBackendProcess('node --enable-source-maps C:\\西财OJ平台\\packages\\backend\\dist\\src\\main', backendRoot),
    true,
  );
  assert.equal(isLikelyBackendProcess('node C:\\other-project\\server.js', backendRoot), false);
  assert.equal(isLikelyBackendProcess('postgres -D C:\\西财OJ平台\\packages\\backend', backendRoot), false);
});

test('selectKillablePortProcesses separates stale backend processes from unrelated listeners', () => {
  const backendRoot = 'C:\\西财OJ平台\\packages\\backend';
  const result = selectKillablePortProcesses(
    [
      { pid: 1234, commandLine: 'node C:\\西财OJ平台\\packages\\backend\\dist\\src\\main' },
      { pid: 5678, commandLine: 'node C:\\other-project\\server.js' },
    ],
    backendRoot,
  );

  assert.deepEqual(result.killable.map((item) => item.pid), [1234]);
  assert.deepEqual(result.blocked.map((item) => item.pid), [5678]);
});

test('parsePreflightOptions keeps auth schema checks enabled when only db sync is skipped', () => {
  assert.deepEqual(parsePreflightOptions(['--skip-db-sync'], { SKIP_DB_SYNC: '0' }), {
    skipPortClean: false,
    skipDbSync: true,
    skipAuthSchemaCheck: false,
  });
});

test('default development startup uses a stable one-shot backend process on Windows', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf8'));
  assert.match(pkg.scripts['start:dev'], /npm run build/);
  assert.match(pkg.scripts['start:dev'], /node dist\/src\/main/);
  assert.doesNotMatch(pkg.scripts['start:dev'], /--watch/);
  assert.match(pkg.scripts['start:watch'], /--watch/);
});
