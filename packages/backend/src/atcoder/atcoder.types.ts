export const ATCODER_PLATFORM = 'ATCODER';
export const ATCODER_ADAPTER_VERSION = 'readonly-1.0.0';

export type AtCoderErrorCode =
  | 'INVALID_REMOTE_URL'
  | 'REMOTE_RATE_LIMITED'
  | 'REMOTE_FORBIDDEN'
  | 'REMOTE_NOT_FOUND'
  | 'REMOTE_PAGE_CHANGED'
  | 'REMOTE_UNAVAILABLE';

export interface AtCoderProblemRef {
  contestScreenName: string;
  taskScreenName: string;
  remoteProblemId: string;
  remoteUrl: string;
}

export interface AtCoderProblemMetadata extends AtCoderProblemRef {
  title: string;
  remoteProblemIndex: string;
  timeLimitMs: number;
  memoryLimitMb: number;
}

export interface AtCoderVerdict {
  rawStatus: string;
  status: string;
  terminal: boolean;
}

export class AtCoderAdapterError extends Error {
  constructor(
    public readonly code: AtCoderErrorCode,
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'AtCoderAdapterError';
  }
}
