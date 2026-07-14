import { AtCoderAdapterError, AtCoderProblemRef } from './atcoder.types';

const TASK_PATH = /^\/contests\/([a-z0-9_-]+)\/tasks\/([a-z0-9_-]+)\/?$/i;
const REMOTE_ID = /^([a-z0-9_-]+)\/([a-z0-9_-]+)$/i;

export function parseAtCoderProblemRef(input: string): AtCoderProblemRef {
  const value = input.trim();
  let contestScreenName: string;
  let taskScreenName: string;

  if (/^https?:\/\//i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw invalidUrl();
    }

    if (
      url.protocol !== 'https:' ||
      url.hostname.toLowerCase() !== 'atcoder.jp' ||
      url.port ||
      url.username ||
      url.password
    ) {
      throw invalidUrl();
    }

    const match = url.pathname.match(TASK_PATH);
    if (!match) throw invalidUrl();
    contestScreenName = match[1];
    taskScreenName = match[2];
  } else {
    const match = value.match(REMOTE_ID);
    if (!match) throw invalidUrl();
    contestScreenName = match[1];
    taskScreenName = match[2];
  }

  contestScreenName = contestScreenName.toLowerCase();
  taskScreenName = taskScreenName.toLowerCase();

  return {
    contestScreenName,
    taskScreenName,
    remoteProblemId: `${contestScreenName}/${taskScreenName}`,
    remoteUrl: `https://atcoder.jp/contests/${contestScreenName}/tasks/${taskScreenName}`,
  };
}

function invalidUrl(): AtCoderAdapterError {
  return new AtCoderAdapterError(
    'INVALID_REMOTE_URL',
    '仅支持 https://atcoder.jp/contests/{contest}/tasks/{task} 格式的公开题目链接',
  );
}
