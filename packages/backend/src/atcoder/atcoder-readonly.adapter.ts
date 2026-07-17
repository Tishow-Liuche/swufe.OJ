import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseAtCoderProblemPage } from './atcoder-metadata.parser';
import { parseAtCoderProblemRef } from './atcoder-url';
import { AtCoderAdapterError, AtCoderProblemMetadata } from './atcoder.types';

const MAX_HTML_BYTES = 2 * 1024 * 1024;

@Injectable()
export class AtCoderReadonlyAdapter {
  private nextRequestAt = 0;
  private requestGate: Promise<void> = Promise.resolve();

  constructor(private readonly config: ConfigService) {}

  async fetchProblem(input: string): Promise<AtCoderProblemMetadata> {
    const ref = parseAtCoderProblemRef(input);
    const html = await this.fetchPublicPage(ref.remoteUrl);
    return parseAtCoderProblemPage(html, ref);
  }

  private async fetchPublicPage(url: string): Promise<string> {
    await this.reserveRequestSlot();
    const timeoutMs = this.getPositiveNumber(
      'VJUDGE_ATCODER_HTTP_TIMEOUT_MS',
      15000,
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en,ja;q=0.8',
          'User-Agent': this.config.get(
            'VJUDGE_ATCODER_USER_AGENT',
            'swufe-oj-readonly-metadata/1.0',
          ),
        },
      });

      this.assertResponse(response, url);
      const contentLength = Number(response.headers.get('content-length') || 0);
      if (contentLength > MAX_HTML_BYTES) {
        throw new AtCoderAdapterError(
          'REMOTE_PAGE_CHANGED',
          'AtCoder 页面响应超过安全大小限制',
        );
      }

      const html = await response.text();
      if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
        throw new AtCoderAdapterError(
          'REMOTE_PAGE_CHANGED',
          'AtCoder 页面响应超过安全大小限制',
        );
      }
      return html;
    } catch (error) {
      if (error instanceof AtCoderAdapterError) throw error;
      throw new AtCoderAdapterError(
        'REMOTE_UNAVAILABLE',
        'AtCoder 当前不可访问，请稍后再试',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private assertResponse(response: Response, requestedUrl: string): void {
    let finalUrl: string;
    try {
      finalUrl = parseAtCoderProblemRef(response.url).remoteUrl;
    } catch {
      throw new AtCoderAdapterError(
        'REMOTE_FORBIDDEN',
        'AtCoder 拒绝了公开页面访问',
        response.status,
      );
    }
    if (finalUrl !== requestedUrl || response.status === 401) {
      throw new AtCoderAdapterError(
        'REMOTE_FORBIDDEN',
        'AtCoder 拒绝了公开页面访问',
        response.status,
      );
    }
    if (response.status === 403) {
      throw new AtCoderAdapterError(
        'REMOTE_FORBIDDEN',
        'AtCoder 暂时拒绝访问',
        response.status,
      );
    }
    if (response.status === 404) {
      throw new AtCoderAdapterError(
        'REMOTE_NOT_FOUND',
        'AtCoder 题目不存在或尚未公开',
        response.status,
      );
    }
    if (response.status === 429) {
      throw new AtCoderAdapterError(
        'REMOTE_RATE_LIMITED',
        'AtCoder 请求频率受限，请稍后再试',
        response.status,
      );
    }
    if (!response.ok) {
      throw new AtCoderAdapterError(
        'REMOTE_UNAVAILABLE',
        'AtCoder 当前不可访问，请稍后再试',
        response.status,
      );
    }
  }

  private async reserveRequestSlot(): Promise<void> {
    let release: () => void = () => undefined;
    const previous = this.requestGate;
    this.requestGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;
    try {
      const minimumIntervalMs = this.getPositiveNumber(
        'VJUDGE_ATCODER_METADATA_INTERVAL_MS',
        2000,
      );
      const waitMs = Math.max(0, this.nextRequestAt - Date.now());
      if (waitMs > 0)
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.nextRequestAt = Date.now() + Math.max(2000, minimumIntervalMs);
    } finally {
      release();
    }
  }

  private getPositiveNumber(key: string, fallback: number): number {
    const value = Number(this.config.get(key, fallback));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }
}
