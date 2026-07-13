import { Injectable, Logger } from '@nestjs/common';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

interface CompileResult {
  success: boolean;
  fileId?: string;   // Path to compiled binary or source
  message: string;
}

interface RunResult {
  status: string;
  timeUsed: number;    // ms
  memoryUsed: number;  // KB
  output: string;
}

const LANGUAGE_CONFIG: Record<string, { extension: string; compileCmd: string; runCmd: string; compileTimeout: number }> = {
  cpp: {
    extension: 'cpp',
    compileCmd: 'g++ -O2 -std=c++17 -o {output} {source}',
    runCmd: '{output}',
    compileTimeout: 30000,
  },
  c: {
    extension: 'c',
    compileCmd: 'gcc -O2 -std=c11 -o {output} {source}',
    runCmd: '{output}',
    compileTimeout: 30000,
  },
  python: {
    extension: 'py',
    compileCmd: '',
    runCmd: 'python3 {source}',
    compileTimeout: 0,
  },
  java: {
    extension: 'java',
    compileCmd: '"C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin/javac" Main.java',
    runCmd: '"C:/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot/bin/java" Main',
    compileTimeout: 30000,
  },
};

@Injectable()
export class NativeJudgeService {
  private readonly logger = new Logger(NativeJudgeService.name);
  private workDir: string;

  constructor() {
    this.workDir = join(tmpdir(), 'oj-judge');
    if (!existsSync(this.workDir)) {
      mkdirSync(this.workDir, { recursive: true });
    }
  }

  async compile(language: string, code: string): Promise<CompileResult> {
    const config = LANGUAGE_CONFIG[language];
    if (!config) {
      return { success: false, message: `Unsupported language: ${language}` };
    }

    // Interpreted languages: just save source
    if (!config.compileCmd) {
      const id = randomUUID();
      const sourcePath = join(this.workDir, `${id}.${config.extension}`);
      writeFileSync(sourcePath, code, 'utf-8');
      return { success: true, fileId: sourcePath, message: '' };
    }

    const id = randomUUID();
    const sourceFileName = language === 'java' ? 'Main.java' : `${id}.${config.extension}`;
    const sourcePath = join(this.workDir, sourceFileName);
    const outputPath = language === 'java' ? this.workDir : join(this.workDir, `${id}.out`);
    writeFileSync(sourcePath, code, 'utf-8');

    const cmd = config.compileCmd
      .replace('{source}', sourcePath)
      .replace('{output}', outputPath)
      .replace('{dir}', this.workDir);

    try {
      const result = execSync(cmd, {
        timeout: config.compileTimeout,
        stdio: 'pipe',
        cwd: language === 'java' ? this.workDir : undefined,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      });
      return {
        success: true,
        fileId: language === 'java' ? this.workDir : outputPath,
        message: result.toString(),
      };
    } catch (error: any) {
      const stderr = error.stderr?.toString() || '';
      const stdout = error.stdout?.toString() || '';
      // Cleanup on failure
      try { unlinkSync(sourcePath); } catch (e) {}
      try { unlinkSync(outputPath); } catch (e) {}
      return { success: false, message: `${stdout}\n${stderr}`.trim() };
    }
  }

  async run(
    language: string,
    input: string,
    timeLimitMs: number,
    memoryLimitMb: number,
    compileFileId?: string,
    sourceCode?: string,
  ): Promise<RunResult> {
    const config = LANGUAGE_CONFIG[language];
    if (!config) {
      return { status: 'SYSTEM_ERROR', timeUsed: 0, memoryUsed: 0, output: 'Unsupported language' };
    }

    let runCmd = config.runCmd;
    if (compileFileId) {
      runCmd = runCmd
        .replace('{dir}', compileFileId)
        .replace('{output}', compileFileId)
        .replace('{source}', compileFileId);
    } else {
      runCmd = runCmd.replace('{source}', compileFileId || '');
    }

    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    const startTime = Date.now();
    try {
      const output = execSync(runCmd, {
        input,
        timeout: timeLimitMs + 5000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: 'pipe',
        cwd: language === 'java' ? compileFileId : undefined,
        shell,
      }).toString();

      const elapsed = Date.now() - startTime;
      return { status: 'ACCEPTED', timeUsed: elapsed, memoryUsed: 0, output };
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      const stdout = error.stdout?.toString() || '';
      const stderr = error.stderr?.toString() || '';
      const msg = error.message || '';

      if (msg.includes('ETIMEDOUT') || msg.includes('killed') || error.signal === 'SIGKILL') {
        return { status: 'TIME_LIMIT_EXCEEDED', timeUsed: elapsed, memoryUsed: 0, output: stdout };
      }
      if (error.signal === 'SIGSEGV' || msg.includes('SIGSEGV')) {
        return { status: 'RUNTIME_ERROR', timeUsed: elapsed, memoryUsed: 0, output: 'Segmentation fault' };
      }

      return {
        status: 'RUNTIME_ERROR',
        timeUsed: elapsed,
        memoryUsed: 0,
        output: stderr || stdout || msg,
      };
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      if (existsSync(fileId)) unlinkSync(fileId);
    } catch (error: any) {
      this.logger.warn(`Failed to delete file: ${fileId}`);
    }
  }
}
