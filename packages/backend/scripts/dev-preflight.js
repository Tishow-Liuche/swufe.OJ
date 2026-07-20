const { spawnSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');

const backendRoot = path.resolve(__dirname, '..');

function buildPrismaSyncCommands() {
  return [
    { command: 'npx', args: ['prisma', 'migrate', 'deploy'] },
    { command: 'npx', args: ['prisma', 'generate'] },
  ];
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: backendRoot,
    stdio: options.capture ? 'pipe' : 'inherit',
    shell: process.platform === 'win32',
    encoding: 'utf8',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = options.capture
      ? `\n${result.stdout || ''}${result.stderr || ''}`.trimEnd()
      : '';
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}${detail ? `\n${detail}` : ''}`);
  }
  return result.stdout || '';
}

function runPrismaSync() {
  for (const item of buildPrismaSyncCommands()) {
    runCommand(item.command, item.args);
  }
}

function assertAuthSchemaRows(rows) {
  const hasRefreshTokenHash = rows.some(
    (row) =>
      String(row.table_name || row.tableName || '') === 'UserSession' &&
      String(row.column_name || row.columnName || '') === 'refreshTokenHash',
  );

  if (!hasRefreshTokenHash) {
    throw new Error(
      [
        'Auth database schema is stale: UserSession.refreshTokenHash is missing.',
        'Run this before starting the backend: npm run db:sync',
        'This usually happens after pulling or merging a branch that added Prisma migrations.',
      ].join('\n'),
    );
  }
}

async function assertAuthSchemaWithPrisma() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'UserSession'
        AND column_name = 'refreshTokenHash'
    `);
    assertAuthSchemaRows(rows);
  } finally {
    await prisma.$disconnect();
  }
}

function readEnvPort(defaultPort = 3000) {
  if (process.env.APP_PORT) {
    const fromProcess = Number.parseInt(process.env.APP_PORT, 10);
    if (Number.isFinite(fromProcess)) return fromProcess;
  }

  const envPath = path.join(backendRoot, '.env');
  if (!existsSync(envPath)) return defaultPort;

  const content = readFileSync(envPath, 'utf8');
  const match = content.match(/^\s*APP_PORT\s*=\s*["']?(\d+)["']?\s*$/m);
  if (!match) return defaultPort;

  const fromFile = Number.parseInt(match[1], 10);
  return Number.isFinite(fromFile) ? fromFile : defaultPort;
}

function normalizeForCompare(value) {
  return String(value || '').replace(/\//g, '\\').toLowerCase();
}

function isLikelyBackendProcess(commandLine, root = backendRoot) {
  const normalizedCommand = normalizeForCompare(commandLine);
  const normalizedRoot = normalizeForCompare(root);
  return /\bnode(\.exe)?\b/i.test(String(commandLine || '')) && normalizedCommand.includes(normalizedRoot);
}

function parseListeningPidsFromNetstat(output, port, currentPid = process.pid) {
  const targetSuffix = `:${port}`;
  const pids = new Set();

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || !/\bLISTENING\b/i.test(line)) continue;

    const parts = line.split(/\s+/);
    const localAddress = parts[1] || '';
    const pid = Number.parseInt(parts[parts.length - 1], 10);
    if (!Number.isFinite(pid) || pid === currentPid) continue;
    if (localAddress.endsWith(targetSuffix)) {
      pids.add(pid);
    }
  }

  return [...pids].sort((a, b) => a - b);
}

function getWindowsProcessCommandLine(pid) {
  const escaped = String(pid).replace(/'/g, "''");
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (Get-CimInstance Win32_Process -Filter 'ProcessId = ${escaped}').CommandLine`,
    ],
    { encoding: 'utf8' },
  );
  if (result.status !== 0) return '';
  return (result.stdout || '').trim();
}

function getUnixProcessCommandLine(pid) {
  const procPath = `/proc/${pid}/cmdline`;
  try {
    if (existsSync(procPath)) {
      return readFileSync(procPath, 'utf8').replace(/\0/g, ' ').trim();
    }
  } catch {
    // Fall through to ps.
  }

  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (result.status !== 0) return '';
  return (result.stdout || '').trim();
}

function getProcessCommandLine(pid) {
  return process.platform === 'win32' ? getWindowsProcessCommandLine(pid) : getUnixProcessCommandLine(pid);
}

function selectKillablePortProcesses(processes, root = backendRoot) {
  const killable = [];
  const blocked = [];
  for (const item of processes) {
    if (isLikelyBackendProcess(item.commandLine, root)) {
      killable.push(item);
    } else {
      blocked.push(item);
    }
  }
  return { killable, blocked };
}

function findWindowsListeningPids(port) {
  const result = spawnSync('netstat', ['-ano', '-p', 'tcp'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) return [];
  return parseListeningPidsFromNetstat(result.stdout || '', port);
}

function findUnixListeningPids(port) {
  const result = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return [];
  return [...new Set((result.stdout || '').split(/\s+/).map((pid) => Number.parseInt(pid, 10)).filter(Number.isFinite))]
    .filter((pid) => pid !== process.pid)
    .sort((a, b) => a - b);
}

function findListeningPids(port) {
  return process.platform === 'win32' ? findWindowsListeningPids(port) : findUnixListeningPids(port);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForPortRelease(port, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = findListeningPids(port);
    if (remaining.length === 0) return true;
    sleepMs(100);
  }
  return findListeningPids(port).length === 0;
}

function killListeningPids(port) {
  const pids = findListeningPids(port);
  if (pids.length === 0) {
    console.log(`[preflight] Port ${port} is free.`);
    return [];
  }

  const processes = pids.map((pid) => ({ pid, commandLine: getProcessCommandLine(pid) }));
  const { killable, blocked } = selectKillablePortProcesses(processes);
  if (blocked.length > 0) {
    const details = blocked
      .map((item) => `PID ${item.pid}: ${item.commandLine || '<command line unavailable>'}`)
      .join('\n');
    throw new Error(
      [
        `Port ${port} is occupied by a process that does not look like this backend.`,
        details,
        'Stop that process manually, choose another APP_PORT, or set SKIP_PORT_CLEAN=1 if you intentionally want to bypass cleanup.',
      ].join('\n'),
    );
  }

  console.log(`[preflight] Port ${port} is occupied by stale backend PID(s): ${killable.map((item) => item.pid).join(', ')}. Stopping...`);
  for (const { pid } of killable) {
    const result =
      process.platform === 'win32'
        ? spawnSync('taskkill', ['/F', '/PID', String(pid)], { stdio: 'inherit', shell: true })
        : spawnSync('kill', ['-TERM', String(pid)], { stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error(`Failed to stop process ${pid} on port ${port}`);
    }
  }

  if (!waitForPortRelease(port)) {
    throw new Error(`Port ${port} is still occupied after stopping stale backend process(es).`);
  }
  return killable.map((item) => item.pid);
}

function parsePreflightOptions(argv = process.argv.slice(2), env = process.env) {
  return {
    skipPortClean: env.SKIP_PORT_CLEAN === '1' || argv.includes('--skip-port-clean'),
    skipDbSync: env.SKIP_DB_SYNC === '1' || argv.includes('--skip-db-sync'),
    skipAuthSchemaCheck: env.SKIP_AUTH_SCHEMA_CHECK === '1' || argv.includes('--skip-auth-schema-check'),
  };
}

async function main(argv = process.argv.slice(2)) {
  const options = parsePreflightOptions(argv);
  const port = readEnvPort();

  if (!options.skipPortClean) {
    killListeningPids(port);
  }

  if (!options.skipDbSync) {
    console.log('[preflight] Synchronizing database migrations and Prisma Client...');
    runPrismaSync();
  }

  if (!options.skipAuthSchemaCheck) {
    console.log('[preflight] Verifying auth session schema...');
    await assertAuthSchemaWithPrisma();
  }

  console.log('[preflight] Backend startup checks passed.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n[preflight] Backend startup check failed.');
    console.error(error && error.stack ? error.stack : error);
    process.exit(1);
  });
}

module.exports = {
  assertAuthSchemaRows,
  buildPrismaSyncCommands,
  isLikelyBackendProcess,
  parseListeningPidsFromNetstat,
  parsePreflightOptions,
  readEnvPort,
  runPrismaSync,
  selectKillablePortProcesses,
};
