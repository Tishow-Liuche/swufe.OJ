export interface CfProblemJson {
  contestId?: number;
  index?: string;
  problemId?: string;
  sourceId?: string;
  title?: string;
  url?: string;
  rating?: number;
  tags?: string[];
  limits?: { timeSeconds?: number; memoryMegabytes?: number };
  statement?: string;
  input?: string;
  output?: string;
  examples?: Array<{ input?: string; output?: string }>;
  note?: string | null;
}

export interface FormattedCfStatement {
  remoteProblemId: string;
  title: string;
  description: string;
  inputFormat: string | null;
  outputFormat: string | null;
  sampleInput: string | null;
  sampleOutput: string | null;
  hint: string | null;
  dataRange: string;
  timeLimit: number;
  memoryLimit: number;
  tags: string[];
  difficulty: string;
}

export function normalizeCfProblemId(problem: Partial<CfProblemJson>): string | null {
  if (problem.problemId && /^\d+[A-Z]\d*$/i.test(problem.problemId)) {
    return problem.problemId.toUpperCase();
  }

  if (problem.contestId && problem.index) {
    return String(problem.contestId) + String(problem.index).toUpperCase();
  }

  const sourceMatch = problem.sourceId?.match(/^(\d+)\/([A-Z]\d*)$/i);
  if (sourceMatch) {
    return sourceMatch[1] + sourceMatch[2].toUpperCase();
  }

  return null;
}

export function formatCfStatement(problem: CfProblemJson): FormattedCfStatement {
  const remoteProblemId = normalizeCfProblemId(problem);
  if (!remoteProblemId) {
    throw new Error('Invalid Codeforces problem id');
  }

  const examples = problem.examples || [];
  const timeLimit = Math.round((problem.limits?.timeSeconds || 1) * 1000);
  const memoryLimit = problem.limits?.memoryMegabytes || 256;
  const titleText = problem.title || remoteProblemId;
  const title = titleText.startsWith(remoteProblemId + ' ')
    ? titleText
    : remoteProblemId + ' ' + titleText;

  const parts: string[] = [];
  parts.push('## 题目描述');
  parts.push(cleanText(problem.statement) || '暂无题面。');

  if (problem.input) {
    parts.push('## 输入格式');
    parts.push(cleanText(problem.input));
  }

  if (problem.output) {
    parts.push('## 输出格式');
    parts.push(cleanText(problem.output));
  }

  if (examples.length) {
    parts.push('## 样例');
    examples.forEach((sample, index) => {
      parts.push('### 样例 ' + (index + 1));
      parts.push('```input');
      parts.push((sample.input || '').trim());
      parts.push('```');
      parts.push('```output');
      parts.push((sample.output || '').trim());
      parts.push('```');
    });
  }

  if (problem.note) {
    parts.push('## 提示');
    parts.push(cleanText(problem.note));
  }

  if (problem.url) {
    parts.push('## 来源');
    parts.push('[Codeforces ' + remoteProblemId + '](' + problem.url + ')');
  }

  return {
    remoteProblemId,
    title,
    description: parts.join('\n\n'),
    inputFormat: cleanText(problem.input) || null,
    outputFormat: cleanText(problem.output) || null,
    sampleInput: examples.length
      ? examples.map((sample) => (sample.input || '').trim()).join('\n---\n')
      : null,
    sampleOutput: examples.length
      ? examples.map((sample) => (sample.output || '').trim()).join('\n---\n')
      : null,
    hint: cleanText(problem.note || '') || null,
    dataRange: 'Time: ' + timeLimit + 'ms, Memory: ' + memoryLimit + 'MB',
    timeLimit,
    memoryLimit,
    tags: (problem.tags || []).filter(Boolean),
    difficulty: mapRating(problem.rating),
  };
}

function cleanText(value?: string | null): string {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function mapRating(rating?: number): string {
  if (!rating) return 'POPULAR';
  if (rating <= 1000) return 'BEGINNER';
  if (rating <= 1600) return 'POPULAR';
  if (rating <= 2200) return 'IMPROVE';
  if (rating <= 2600) return 'PROVINCIAL';
  return 'NOI';
}
