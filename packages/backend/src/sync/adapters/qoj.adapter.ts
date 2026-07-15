import { Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { RemoteProblemData, SyncAdapter } from '../sync.service';

const DEFAULT_PAGE_SIZE = 50;

export class QojAdapter implements SyncAdapter {
  readonly platform = 'QOJ';
  readonly baseUrl = 'https://qoj.ac';
  private readonly logger = new Logger(QojAdapter.name);

  async fetchList(page: number, pageSize: number) {
    const html = await this.httpGet(`/problems?page=${Math.max(1, page)}`);
    const parsed = parseQojProblemList(html);
    return {
      items: parsed.items.slice(0, pageSize),
      total: parsed.total,
    };
  }

  async fetchProblem(remoteId: string): Promise<RemoteProblemData | null> {
    const normalized = normalizeRemoteId(remoteId);
    if (!normalized) return null;

    try {
      const html = await this.httpGet(`/problem/${normalized}`);
      return parseQojProblemPage(normalized, html);
    } catch (error: any) {
      this.logger.warn(`Failed to fetch QOJ ${remoteId}: ${error?.message || error}`);
      return null;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const html = await this.httpGet('/problem/1');
      return !!parseQojProblemPage('1', html);
    } catch {
      return false;
    }
  }

  private async httpGet(path: string): Promise<string> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        'Cache-Control': 'no-cache',
        Referer: `${this.baseUrl}/`,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
    });

    if (!resp.ok) throw new Error(`QOJ HTTP ${resp.status}`);
    return resp.text();
  }
}

export function parseQojProblemList(html: string): { items: Array<{ remoteId: string }>; total: number } {
  const $ = cheerio.load(html);
  const ids: string[] = [];
  $('a[href^="/problem/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/^\/problem\/(\d+)(?:\D|$)/);
    if (match && !ids.includes(match[1])) ids.push(match[1]);
  });

  const maxPage = Math.max(
    1,
    ...$('a[href*="page="]')
      .map((_, el) => Number(new URL($(el).attr('href') || '', 'https://qoj.ac').searchParams.get('page') || 0))
      .get()
      .filter((n) => Number.isFinite(n) && n > 0),
  );

  return {
    items: ids.map((remoteId) => ({ remoteId })),
    total: maxPage * DEFAULT_PAGE_SIZE,
  };
}

export function parseQojProblemPage(remoteId: string, html: string): RemoteProblemData | null {
  const id = normalizeRemoteId(remoteId);
  if (!id) return null;

  const $ = cheerio.load(html);
  const title = extractTitle($, id);
  if (!title) return null;

  const statement = extractStatement($);
  const samples = extractSamples($, statement);
  const inputFormat = extractSectionText($, statement, 'Input');
  const outputFormat = extractSectionText($, statement, 'Output');
  const timeLimit = parseTimeLimit($.root().text()) || 1000;
  const memoryLimit = parseMemoryLimit($.root().text()) || 1024;
  const tags = extractTags($);

  return {
    remoteId: id,
    title: `QOJ ${id} ${title}`,
    difficulty: 'NOI',
    timeLimit,
    memoryLimit,
    tags,
    url: `https://qoj.ac/problem/${id}`,
    description: statement.html()?.trim() || statement.text().trim() || `QOJ problem ${id}`,
    inputFormat,
    outputFormat,
    samples,
    dataRange: `Time: ${timeLimit}ms, Memory: ${memoryLimit}MB`,
  };
}

function normalizeRemoteId(remoteId: string): string | null {
  const match = String(remoteId || '').trim().match(/\d+/);
  return match ? match[0] : null;
}

function extractTitle($: cheerio.CheerioAPI, id: string): string {
  const h1 = $('h1').first().text().trim();
  if (h1) return cleanupTitle(h1, id);

  const pageTitle = $('title').first().text().trim();
  return cleanupTitle(pageTitle, id);
}

function cleanupTitle(raw: string, id: string): string {
  return raw
    .replace(/^QOJ\s*/i, '')
    .replace(new RegExp(`^Problem\\s*${id}\\s*[-:：]?\\s*`, 'i'), '')
    .replace(new RegExp(`^${id}\\s*[-.、:：]?\\s*`), '')
    .replace(/\s*-\s*QOJ.*$/i, '')
    .trim();
}

function extractStatement($: cheerio.CheerioAPI): cheerio.Cheerio<any> {
  const candidates = [
    '.problem-statement',
    '#problem-statement',
    '[data-fragment-id="problem-statement"]',
    '.statement',
    '.card-body',
    'main',
    'body',
  ];

  for (const selector of candidates) {
    const found = $(selector).filter((_, el) => $(el).text().trim().length > 30).first();
    if (found.length) return found.clone();
  }

  return $('body').clone();
}

function extractSectionText(
  $: cheerio.CheerioAPI,
  statement: cheerio.Cheerio<any>,
  heading: string,
): string | undefined {
  const root = cheerio.load(statement.html() || '');
  const headingEl = root('h1,h2,h3,h4,strong,b')
    .filter((_, el) => root(el).text().trim().toLowerCase() === heading.toLowerCase())
    .first();
  if (!headingEl.length) return undefined;

  const parts: string[] = [];
  let node = headingEl.next();
  while (node.length) {
    if (/^h[1-4]$/i.test(node[0].tagName || '')) break;
    const text = root(node).text().trim();
    if (text) parts.push(text);
    node = node.next();
  }

  return parts.join('\n\n') || undefined;
}

function extractSamples(
  $: cheerio.CheerioAPI,
  statement: cheerio.Cheerio<any>,
): Array<{ input: string; output: string }> {
  const root = cheerio.load(statement.html() || '');
  const samples: Array<{ input: string; output: string }> = [];

  root('.sample, .sample-test').each((_, el) => {
    const pres = root(el)
      .find('pre')
      .map((__, pre) => root(pre).text().trim())
      .get();
    if (pres.length >= 2) samples.push({ input: pres[0], output: pres[1] });
  });

  if (samples.length) return samples;

  const pres = root('pre')
    .map((_, pre) => root(pre).text().trim())
    .get()
    .filter(Boolean);
  for (let i = 0; i + 1 < pres.length; i += 2) {
    samples.push({ input: pres[i], output: pres[i + 1] });
  }
  return samples;
}

function extractTags($: cheerio.CheerioAPI): string[] {
  const tags = $('a[href*="tag="], a[href*="/tag/"]')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter((tag) => tag.length > 0 && tag.length <= 40);
  return Array.from(new Set(tags));
}

function parseTimeLimit(text: string): number | null {
  const match = text.match(/Time\s*Limit\s*:?\s*([0-9.]+)\s*(ms|s|sec|second|seconds)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  return match[2].toLowerCase() === 'ms' ? Math.round(value) : Math.round(value * 1000);
}

function parseMemoryLimit(text: string): number | null {
  const match = text.match(/Memory\s*Limit\s*:?\s*([0-9.]+)\s*(MB|MiB|GB|GiB|KB|KiB)/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = match[2].toLowerCase();
  if (unit === 'gb' || unit === 'gib') return Math.round(value * 1024);
  if (unit === 'kb' || unit === 'kib') return Math.max(1, Math.round(value / 1024));
  return Math.round(value);
}
