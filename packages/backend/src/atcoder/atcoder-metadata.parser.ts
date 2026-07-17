import { load } from 'cheerio';
import {
  AtCoderAdapterError,
  AtCoderProblemMetadata,
  AtCoderProblemRef,
} from './atcoder.types';

export function parseAtCoderProblemPage(
  html: string,
  ref: AtCoderProblemRef,
): AtCoderProblemMetadata {
  const $ = load(html);
  const pageText = normalizeWhitespace($('body').text());
  const headingElement = $('span.h2').first().clone();
  headingElement.find('a, small').remove();
  const heading = normalizeWhitespace(headingElement.text());
  const documentTitle = normalizeWhitespace($('title').first().text()).replace(
    /\s*-\s*AtCoder\s*$/i,
    '',
  );
  const displayTitle = heading || documentTitle;
  const timeLimitMs = parseTimeLimit(pageText);
  const memoryLimitMb = parseMemoryLimit(pageText);

  if (!displayTitle || timeLimitMs === null || memoryLimitMb === null) {
    throw new AtCoderAdapterError(
      'REMOTE_PAGE_CHANGED',
      'AtCoder 页面缺少标题或限制字段，已停止同步以避免保存错误数据',
    );
  }

  const titleMatch = displayTitle.match(/^([A-Za-z0-9]+)\s*[-–—]\s*(.+)$/);
  const remoteProblemIndex =
    titleMatch?.[1] || inferProblemIndex(ref.taskScreenName);
  const normalizedTitle = titleMatch
    ? `${ref.contestScreenName.toUpperCase()} ${titleMatch[1]} - ${titleMatch[2]}`
    : `${ref.contestScreenName.toUpperCase()} ${displayTitle}`;

  return {
    ...ref,
    title: normalizedTitle,
    remoteProblemIndex,
    timeLimitMs,
    memoryLimitMb,
  };
}

function parseTimeLimit(text: string): number | null {
  const match = text.match(
    /(?:Time Limit|実行時間制限)\s*[:：]\s*([\d.]+)\s*(ms|msec|milliseconds?|sec|seconds?|秒|ミリ秒)/i,
  );
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  return /^(ms|msec|millisecond|milliseconds|ミリ秒)$/i.test(match[2])
    ? Math.round(value)
    : Math.round(value * 1000);
}

function parseMemoryLimit(text: string): number | null {
  const match = text.match(
    /(?:Memory Limit|メモリ制限)\s*[:：]\s*([\d.]+)\s*(KiB|KB|MiB|MB|GiB|GB)/i,
  );
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const unit = match[2].toUpperCase();
  if (unit === 'KIB' || unit === 'KB')
    return Math.max(1, Math.ceil(value / 1024));
  if (unit === 'GIB' || unit === 'GB') return Math.ceil(value * 1024);
  return Math.ceil(value);
}

function inferProblemIndex(taskScreenName: string): string {
  const suffix = taskScreenName.split('_').pop();
  return suffix ? suffix.toUpperCase() : taskScreenName.toUpperCase();
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}
