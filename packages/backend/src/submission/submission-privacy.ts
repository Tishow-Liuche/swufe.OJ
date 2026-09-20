/** Keep checker diagnostics and hidden test data available to staff, not contestants. */
export function contestantSubmission<T extends { status: string; compileMessage?: string | null; cases?: any[] }>(submission: T): T {
  return {
    ...submission,
    ...(submission.status === 'SYSTEM_ERROR' ? { compileMessage: '评测系统或判题程序异常，请联系出题人处理；此结果不表示代码答案错误。' } : {}),
    ...(submission.cases ? { cases: submission.cases.map(({ caseIndex, status, timeUsed, memoryUsed }) => ({ caseIndex, status, timeUsed, memoryUsed })) } : {}),
  };
}
