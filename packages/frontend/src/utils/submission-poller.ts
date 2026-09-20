const FINAL = new Set(['ACCEPTED', 'WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED',
  'MEMORY_LIMIT_EXCEEDED', 'RUNTIME_ERROR', 'COMPILE_ERROR', 'SYSTEM_ERROR', 'REMOTE_ERROR', 'CANCELLED']);
export const isFinalSubmission = (status: string) => FINAL.has(status);

export function createSubmissionPoller(options: {
  fetch: (id: string, signal: AbortSignal) => Promise<any>;
  receive: (id: string, data: any, final: boolean) => void;
  exhausted: () => void;
  hidden?: () => boolean;
}) {
  let cancel: (() => void) | undefined;
  let refresh: (() => void) | undefined;
  function stop() { cancel?.(); cancel = undefined; refresh = undefined; }
  function start(id: string, external = false) {
    stop();
    let stopped = false, busy = false, errors = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const started = Date.now();
    cancel = () => { stopped = true; clearTimeout(timer); controller.abort(); };
    async function tick() {
      if (stopped || busy) return;
      clearTimeout(timer);
      busy = true;
      let final = false;
      try {
        const data = await options.fetch(id, controller.signal);
        if (stopped) return;
        errors = 0;
        final = isFinalSubmission(data.status);
        options.receive(id, data, final);
      } catch {
        if (!stopped) errors++;
      } finally {
        busy = false;
        if (!stopped) {
          if (final) { stopped = true; }
          else if (Date.now() - started >= 600_000 || errors >= (external ? 60 : 10)) {
            stopped = true; options.exhausted();
          } else {
            const elapsed = Date.now() - started;
            const delay = options.hidden?.() ? 5000 : external ? 1500 : elapsed < 5000 ? 500 : elapsed < 30000 ? 1000 : 2000;
            timer = setTimeout(tick, errors ? Math.max(2000, delay) : delay);
          }
        }
      }
    }
    refresh = () => { void tick(); };
    void tick();
  }
  return { start, stop, refresh: () => refresh?.() };
}
