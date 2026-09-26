import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type RuntimeInput = string | { fileId: string };
interface RunOptions { outputLimitMb?: number; cacheOutput?: boolean; }

interface GoJudgeRequest {
  cmd: Array<{
    args: string[];
    env?: string[];
    files?: Array<{
      content?: string;
      fileId?: string;
      name?: string;
      max?: number;
    }>;
    cpuLimit?: number;
    clockLimit?: number;
    memoryLimit?: number;
    procLimit?: number;
    copyIn?: Record<string, { content: string } | { fileId: string }>;
    copyOut?: string[];
    copyOutCached?: string[];
  }>;
}

interface GoJudgeResult {
  status: string;
  exitStatus: number;
  signal?: number | string;
  error?: string;
  time: number;       // ns
  memory: number;     // bytes
  runTime: number;    // ns
  files?: Record<string, string>;
  fileIds?: Record<string, string>;
  fileError?: Array<{ name: string; message: string; type?: string }>;
}

export interface CompileResult {
  success: boolean;
  fileId?: string;
  message: string;
  systemError?: boolean;
}

export interface RunResult {
  status: string;
  timeUsed: number;    // ms
  memoryUsed: number;  // KB
  output: string;
  outputFileId?: string;
  exitStatus?: number;
  signal?: number | string;
  error?: string;
  stderr?: string;
  sandboxStatus?: string;
}

interface LanguageConfig {
  extension: string;
  compileCommand: string[];
  runCommand: string[];
  sourceFile?: string;
  artifactFile?: string;
}

const LANGUAGE_CONFIG: Record<string, LanguageConfig> = {
  cpp: {
    extension: 'cpp',
    compileCommand: ['/usr/bin/g++', '-O2', '-std=c++17', '-o', 'main', 'main.cpp'],
    runCommand: ['main'],
  },
  c: {
    extension: 'c',
    compileCommand: ['/usr/bin/gcc', '-O2', '-std=c11', '-o', 'main', 'main.c'],
    runCommand: ['main'],
  },
  python: {
    extension: 'py',
    compileCommand: [], // Interpreted, no compile
    runCommand: ['/usr/bin/python3', 'main.py'],
  },
  java: {
    extension: 'java',
    sourceFile: 'Main.java',
    artifactFile: 'main.jar',
    compileCommand: ['/bin/sh', '-c', '/usr/bin/javac Main.java && /usr/bin/jar cf main.jar Main*.class'],
    runCommand: ['/usr/bin/java', '-cp', 'main.jar', 'Main'],
  },
};

const STATUS_MAP: Record<string, string> = {
  Accepted: 'ACCEPTED',
  'Memory Limit Exceeded': 'MEMORY_LIMIT_EXCEEDED',
  'Time Limit Exceeded': 'TIME_LIMIT_EXCEEDED',
  'Output Limit Exceeded': 'OUTPUT_LIMIT_EXCEEDED',
  'File Error': 'SYSTEM_ERROR',
  'Nonzero Exit Status': 'RUNTIME_ERROR',
  Signalled: 'RUNTIME_ERROR',
  'Dangerous Syscall': 'RUNTIME_ERROR',
  'Internal Error': 'SYSTEM_ERROR',
};

@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);
  private baseUrl: string;

  constructor(private config: ConfigService) {
    this.baseUrl = config.get('GO_JUDGE_URL', 'http://localhost:5050');
  }

  /** Compile source code, return cached fileId */
  async compile(language: string, code: string): Promise<CompileResult> {
    const langConfig = LANGUAGE_CONFIG[language];
    if (!langConfig) {
      return { success: false, message: `Unsupported language: ${language}` };
    }

    // Interpreted languages skip compilation
    if (langConfig.compileCommand.length === 0) {
      return { success: true, fileId: undefined, message: '' };
    }

    const sourceFile = langConfig.sourceFile || `main.${langConfig.extension}`;
    const artifactFile = langConfig.artifactFile || 'main';
    const request: GoJudgeRequest = {
      cmd: [{
        args: langConfig.compileCommand,
        env: ['PATH=/usr/bin:/bin:/usr/local/bin'],
        files: [
          { content: '' },                    // stdin
          { name: 'stdout', max: 10240 },
          { name: 'stderr', max: 10240 },
        ],
        cpuLimit: 10_000_000_000,    // 10s
        clockLimit: 30_000_000_000,
        memoryLimit: 536_870_912,    // 512MB
        procLimit: 50,
        copyIn: { [sourceFile]: { content: code } },
        copyOut: ['stdout', 'stderr'],
        copyOutCached: [artifactFile],
      }],
    };

    try {
      const result = await this.requestRun(request, 35_000);

      if (result.status === 'Accepted') {
        const fileId = result.fileIds?.[artifactFile];
        if (result.exitStatus !== 0 || result.signal || result.error || !fileId?.trim() || result.fileError?.length) {
          return { success: false, systemError: true, fileId, message: 'Compile system error: invalid successful compilation or missing artifact' };
        }
        return { success: true, fileId, message: '' };
      }

      // Compilation failed
      const stderr = result.files?.['stderr'] || '';
      const stdout = result.files?.['stdout'] || '';
      const outputLimit = this.isOutputLimitEvidence(result);
      const systemError = Boolean((result.error && !outputLimit) || result.signal) || !['Nonzero Exit Status', 'Time Limit Exceeded', 'Memory Limit Exceeded', 'Output Limit Exceeded'].includes(result.status);
      return { success: false, ...(systemError ? { systemError: true } : {}), message: `${stdout}\n${stderr}\n${result.error || ''}`.trim() || `Compilation: ${result.status}` };
    } catch (error: any) {
      this.logger.error(`Compile error: ${error.message}`);
      return { success: false, systemError: true, message: `Compile system error: ${error.message}` };
    }
  }

  /** Run compiled/interpreted code with given input */
  async run(
    language: string,
    input: string,
    timeLimitMs: number,
    memoryLimitMb: number,
    compileFileId?: string,
    sourceCode?: string,
    options: RunOptions = {},
  ): Promise<RunResult> {
    return this.runWithFiles(
      language,
      input,
      timeLimitMs,
      memoryLimitMb,
      compileFileId,
      sourceCode,
      {},
      options,
    );
  }

  /** Run code with optional companion files for special judges. */
  async runWithFiles(
    language: string,
    input: RuntimeInput,
    timeLimitMs: number,
    memoryLimitMb: number,
    compileFileId?: string,
    sourceCode?: string,
    files: Record<string, RuntimeInput> = {},
    options: RunOptions = {},
  ): Promise<RunResult> {
    const langConfig = LANGUAGE_CONFIG[language];
    if (!langConfig) {
      return { status: 'SYSTEM_ERROR', timeUsed: 0, memoryUsed: 0, output: '', error: 'Unsupported language' };
    }

    const outputLimitMb = options.outputLimitMb ?? 10;
    if (!Number.isFinite(outputLimitMb) || outputLimitMb <= 0 || outputLimitMb > 1024
      || !Number.isFinite(timeLimitMs) || timeLimitMs <= 0 || timeLimitMs > 300_000
      || !Number.isFinite(memoryLimitMb) || memoryLimitMb <= 0) {
      return { status: 'SYSTEM_ERROR', timeUsed: 0, memoryUsed: 0, output: '', error: 'Invalid sandbox resource limits' };
    }
    const cpuLimit = timeLimitMs * 1_000_000;
    const clockLimit = Math.min(300_000, Math.max(2000, timeLimitMs * 3)) * 1_000_000;
    const memoryLimit = memoryLimitMb * 1024 * 1024;

    const copyIn: Record<string, { content: string } | { fileId: string }> = {};
    const artifactFile = langConfig.artifactFile || 'main';

    if (compileFileId) {
      copyIn[artifactFile] = { fileId: compileFileId };
    } else if (language === 'python' && sourceCode) {
      copyIn['main.py'] = { content: sourceCode };
    }

    for (const [name, content] of Object.entries(files)) {
      if (!/^[A-Za-z0-9_.-]+$/.test(name)) {
        return { status: 'SYSTEM_ERROR', timeUsed: 0, memoryUsed: 0, output: '', error: `Invalid SPJ file name: ${name}` };
      }
      copyIn[name] = typeof content === 'string' ? { content } : content;
    }

    const request: GoJudgeRequest = {
      cmd: [{
        args: langConfig.runCommand,
        env: ['PATH=/usr/bin:/bin:/usr/local/bin'],
        files: [
          typeof input === 'string' ? { content: input } : input,
          { name: 'stdout', max: outputLimitMb * 1024 * 1024 },
          { name: 'stderr', max: 10_240 },
        ],
        cpuLimit,
        clockLimit,
        memoryLimit,
        procLimit: 50,
        copyIn,
        copyOut: options.cacheOutput ? ['stderr'] : ['stdout', 'stderr'],
        ...(options.cacheOutput ? { copyOutCached: ['stdout'] } : {}),
      }],
    };

    let outputFileId: string | undefined;
    try {
      const result = await this.requestRun(request, clockLimit / 1_000_000 + 5000);
      outputFileId = options.cacheOutput ? result.fileIds?.stdout : undefined;
      const output = outputFileId ? await this.outputPreview(outputFileId) : result.files?.stdout || '';

      const status = (result.fileError?.length && !this.isOutputLimitEvidence(result)) || (result.status === 'Accepted' && (result.error || result.signal))
        ? 'SYSTEM_ERROR' : STATUS_MAP[result.status] || 'SYSTEM_ERROR';
      const timeUsed = Math.round(result.time / 1_000_000);   // ns → ms
      const memoryUsed = Math.round(result.memory / 1024);     // bytes → KB

      return {
        status: status === 'ACCEPTED' && result.exitStatus !== 0 ? 'RUNTIME_ERROR' : status,
        timeUsed,
        memoryUsed,
        output,
        ...(outputFileId ? { outputFileId } : {}),
        exitStatus: result.exitStatus,
        signal: result.signal,
        error: result.error || result.fileError?.map((entry) => `${entry.name}: ${entry.message}`).join('; '),
        stderr: result.files?.['stderr'] || '',
        sandboxStatus: result.status,
      };
    } catch (error: any) {
      if (outputFileId) await this.deleteFile(outputFileId);
      this.logger.error(`Run error: ${error.message}`);
      return {
        status: 'SYSTEM_ERROR',
        timeUsed: 0,
        memoryUsed: 0,
        output: '',
        error: error.message,
      };
    }
  }

  private async *outputChunks(fileId: string): AsyncGenerator<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(`${this.baseUrl}/file/${encodeURIComponent(fileId)}`, { signal: controller.signal });
      if (!response.ok || !response.body) throw new Error(`Sandbox output download failed: ${response.status}`);
      reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield decoder.decode(value, { stream: true });
      }
      yield decoder.decode();
    } finally {
      await reader?.cancel().catch(() => {});
      controller.abort(); clearTimeout(timer);
    }
  }

  private async outputPreview(fileId: string): Promise<string> {
    let preview = '';
    for await (const chunk of this.outputChunks(fileId)) {
      const remaining = 32768 - preview.length;
      preview += chunk.slice(0, remaining);
      if (chunk.length > remaining) return preview + '\n[output truncated]';
    }
    return preview;
  }

  async compareCachedOutput(fileId: string, expectedOutput: string): Promise<boolean> {
    const expected = String(expectedOutput ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t\n]+$/g, '');
    let offset = 0, pendingCR = false;
    const matches = (text: string) => {
      const count = Math.min(text.length, expected.length - offset);
      if (text.slice(0, count) !== expected.slice(offset, offset + count)) return false;
      offset += count;
      return /^[ \t\n]*$/.test(text.slice(count));
    };
    for await (let chunk of this.outputChunks(fileId)) {
      if (pendingCR) { chunk = '\r' + chunk; pendingCR = false; }
      if (chunk.endsWith('\r')) { chunk = chunk.slice(0, -1); pendingCR = true; }
      if (!matches(chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n'))) return false;
    }
    if (pendingCR && !matches('\n')) return false;
    return offset === expected.length;
  }

  private isOutputLimitEvidence(result: GoJudgeResult): boolean {
    // go-judge reports truncated stdout/stderr as a collection error as well as OLE.
    // Only this specific evidence is a contestant limit, not an infrastructure fault.
    return result.status === 'Output Limit Exceeded'
      && (!result.error || result.error === 'Output Limit Exceeded')
      && (result.fileError || []).every((entry) => ['stdout', 'stderr'].includes(entry.name)
        && entry.type === 'CollectSizeExceeded' && entry.message === 'Output Limit Exceeded');
  }

  private async requestRun(request: GoJudgeRequest, deadlineMs: number): Promise<GoJudgeResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deadlineMs);
    try {
      const response = await fetch(`${this.baseUrl}/run`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Sandbox HTTP ${response.status}`);
      const body: unknown = await response.json();
      const result = Array.isArray(body) && body.length === 1 ? body[0] : null;
      const stringMap = (value: unknown) => value === undefined || (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.values(value).every((v) => typeof v === 'string'));
      if (!result || typeof result.status !== 'string' || !Object.prototype.hasOwnProperty.call(STATUS_MAP, result.status)
        || !Number.isInteger(result.exitStatus)
        || !Number.isFinite(result.time) || result.time < 0
        || !Number.isFinite(result.memory) || result.memory < 0
        || !stringMap(result.files) || !stringMap(result.fileIds)
        || (result.status === 'Accepted' && ((request.cmd[0].copyOut || []).some(name => typeof result.files?.[name] !== 'string')
          || (request.cmd[0].copyOutCached || []).some(name => typeof result.fileIds?.[name] !== 'string' || !result.fileIds[name].trim())))
        || (result.fileError !== undefined && (!Array.isArray(result.fileError) || result.fileError.some((entry) => !entry || typeof entry.name !== 'string' || typeof entry.message !== 'string' || (entry.type !== undefined && typeof entry.type !== 'string'))))
        || (result.error !== undefined && typeof result.error !== 'string')
        || (result.signal !== undefined && typeof result.signal !== 'string' && typeof result.signal !== 'number')) {
        // A malformed response can still own cached artifacts. Release only the
        // cache names requested by this command, never arbitrary response keys.
        for (const name of request.cmd[0].copyOutCached || []) {
          const id = result?.fileIds?.[name];
          if (typeof id === 'string' && id.trim()) await this.deleteFile(id);
        }
        throw new Error('Malformed sandbox response');
      }
      return result;
    } finally { clearTimeout(timer); }
  }

  /** Clean up cached file */
  async deleteFile(fileId: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/file/${encodeURIComponent(fileId)}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        this.logger.warn(`Failed to delete go-judge file: ${fileId}`);
      }
    } catch (error: any) {
      this.logger.warn(`Delete file error: ${error.message}`);
    }
  }
}
