import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface GoJudgeRequest {
  cmd: Array<{
    args: string[];
    env?: string[];
    files?: Array<{
      content?: string;
      name?: string;
      max?: number;
    }>;
    cpuLimit?: number;
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
  time: number;       // ns
  memory: number;     // bytes
  runTime: number;    // ns
  files?: Record<string, string>;
  fileIds?: Record<string, string>;
  fileError?: Array<{ name: string; message: string }>;
}

interface CompileResult {
  success: boolean;
  fileId?: string;
  message: string;
}

interface RunResult {
  status: string;
  timeUsed: number;    // ms
  memoryUsed: number;  // KB
  output: string;
}

const LANGUAGE_CONFIG: Record<string, { extension: string; compileCommand: string[]; runCommand: string[] }> = {
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
    compileCommand: ['/usr/bin/javac', 'Main.java'],
    runCommand: ['/usr/bin/java', 'Main'],
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

    const sourceFile = `main.${langConfig.extension}`;
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
        memoryLimit: 536_870_912,    // 512MB
        procLimit: 50,
        copyIn: { [sourceFile]: { content: code } },
        copyOut: ['stdout', 'stderr'],
        copyOutCached: ['main'],     // Cache compiled binary
      }],
    };

    try {
      const res = await fetch(`${this.baseUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const results: GoJudgeResult[] = await res.json();
      const result = results[0];

      if (result.status === 'Accepted') {
        const fileId = result.fileIds?.['main'] || result.fileIds?.['Main'] || result.fileIds?.['Main.class'];
        return { success: true, fileId, message: '' };
      }

      // Compilation failed
      const stderr = result.files?.['stderr'] || '';
      const stdout = result.files?.['stdout'] || '';
      return { success: false, message: `${stdout}\n${stderr}`.trim() };
    } catch (error: any) {
      this.logger.error(`Compile error: ${error.message}`);
      return { success: false, message: `Compile system error: ${error.message}` };
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
  ): Promise<RunResult> {
    const langConfig = LANGUAGE_CONFIG[language];
    const cpuLimit = timeLimitMs * 1_000_000;     // ms → ns
    const memoryLimit = memoryLimitMb * 1024 * 1024; // MB → bytes

    const copyIn: Record<string, { content: string } | { fileId: string }> = {};

    if (compileFileId) {
      copyIn['main'] = { fileId: compileFileId };
    } else if (language === 'python' && sourceCode) {
      copyIn['main.py'] = { content: sourceCode };
    }

    const request: GoJudgeRequest = {
      cmd: [{
        args: langConfig.runCommand,
        env: ['PATH=/usr/bin:/bin:/usr/local/bin'],
        files: [
          { content: input },                   // stdin
          { name: 'stdout', max: 10_485_760 },  // 10MB
          { name: 'stderr', max: 10_240 },
        ],
        cpuLimit,
        memoryLimit,
        procLimit: 50,
        copyIn,
        copyOut: ['stdout', 'stderr'],
      }],
    };

    try {
      const res = await fetch(`${this.baseUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      const results: GoJudgeResult[] = await res.json();
      const result = results[0];

      const status = STATUS_MAP[result.status] || 'RUNTIME_ERROR';
      const timeUsed = Math.round(result.time / 1_000_000);   // ns → ms
      const memoryUsed = Math.round(result.memory / 1024);     // bytes → KB

      return {
        status: status === 'ACCEPTED' && result.exitStatus !== 0 ? 'RUNTIME_ERROR' : status,
        timeUsed,
        memoryUsed,
        output: result.files?.['stdout'] || '',
      };
    } catch (error: any) {
      this.logger.error(`Run error: ${error.message}`);
      return {
        status: 'SYSTEM_ERROR',
        timeUsed: 0,
        memoryUsed: 0,
        output: error.message,
      };
    }
  }

  /** Clean up cached file */
  async deleteFile(fileId: string): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}/file/${fileId}`, { method: 'DELETE' });
      if (!res.ok) {
        this.logger.warn(`Failed to delete go-judge file: ${fileId}`);
      }
    } catch (error: any) {
      this.logger.warn(`Delete file error: ${error.message}`);
    }
  }
}
