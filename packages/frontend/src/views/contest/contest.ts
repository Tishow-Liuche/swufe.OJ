export type Contest = {
  id: string; contestNo: number; title: string; description?: string; mode: 'ACM' | 'IOI'; visibility: string;
  startTime: string; endTime: string; registerStart?: string | null; registerEnd?: string | null; freezeTime?: string | null;
  allowUpsolve: boolean; penaltyTime: number; teamMode: boolean; isRated: boolean; createdBy?: string;
  organizer?: { id?: string; name: string }; state: 'UPCOMING' | 'RUNNING' | 'ENDED';
  participant?: { isVirtual: boolean; virtualStart?: string; virtualEnd?: string } | null;
  problems: Array<{ id: string; problemId: string; order: number; score: number; problem: { id: string; problemNo?: number | null; title: string; difficulty?: string } }>;
  _count?: { problems?: number; participants?: number };
};
export function dateText(value?: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '未设置';
}
export function timeText(value?: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value)) : '—';
}
export function problemDisplayTitle(problem: { problemNo?: number | null; title?: string } | null | undefined) {
  return problem ? `${problem.problemNo ? `T${problem.problemNo} ` : ''}${problem.title || ''}`.trim() : '题目已移除';
}
export function stateText(state: string) { return ({ UPCOMING: '未开始', RUNNING: '进行中', ENDED: '已结束' } as Record<string, string>)[state] || state; }
export function contestKind(contest: Contest) {
  if (contest.visibility === 'CAMPUS_PRIVATE') return '校赛私有赛';
  if (contest.visibility === 'PRIVATE') return '私有赛';
  if (contest.visibility === 'PASSWORD') return '密码赛';
  return contest.teamMode ? '团队公开赛' : '个人公开赛';
}
export function canManageContest(contest: Contest, user?: { id: string; role: string } | null) { return !!user && (user.role === 'ADMIN' || contest.createdBy === user.id); }
export function canViewFeed(contest: Contest, user?: { id: string; role: string } | null) { return contest.visibility === 'PUBLIC' || !!contest.participant || canManageContest(contest, user); }
export function statusText(status: string) {
  return ({ ACCEPTED: 'AC', WRONG_ANSWER: 'WA', TIME_LIMIT_EXCEEDED: 'TLE', MEMORY_LIMIT_EXCEEDED: 'MLE',
    RUNTIME_ERROR: 'RE', COMPILE_ERROR: 'CE', PENDING: '等待', QUEUING: '排队', JUDGING: '评测中', RUNNING: '运行中',
    SYSTEM_ERROR: '系统错误', REMOTE_ERROR: 'RMR', SUBMITTING: '提交中', COMPILING: '编译中' } as Record<string,string>)[status] || status;
}
export function errorText(error: any, fallback: string) {
  if (error.response?.status === 429) return '请求较频繁，请稍后重试。';
  const message = error.response?.data?.message;
  return Array.isArray(message) ? message.join('；') : message || fallback;
}
export function verdictClass(status: string) {
  if (status === 'ACCEPTED') return 'accepted';
  if (['PENDING', 'QUEUING', 'JUDGING', 'RUNNING', 'SUBMITTING', 'COMPILING'].includes(status)) return 'pending';
  if (['WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED', 'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILE_ERROR'].includes(status)) return 'wrong';
  return 'system-error';
}
export function nextContestTransition(contest: {
  startTime: string; endTime: string; registerStart?: string | null; registerEnd?: string | null;
  participant?: { virtualStart?: string; virtualEnd?: string } | null;
}, now = Date.now()) {
  const times = [contest.startTime, contest.endTime, contest.registerStart, contest.registerEnd,
    contest.participant?.virtualStart, contest.participant?.virtualEnd]
    .filter((value): value is string => !!value).map(Date.parse).filter(time => time > now);
  return times.length ? Math.min(Math.min(...times) - now + 250, 2147483647) : null;
}
