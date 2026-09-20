import { JudgeService } from './judge.service';

describe('JudgeService go-judge requests', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: JudgeService;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    service = new JudgeService({
      get: (key: string, fallback?: string) => key === 'GO_JUDGE_URL' ? 'http://go-judge:5050' : fallback,
    } as any);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('compiles Java as Main.java and caches a jar with all class files', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([{
        status: 'Accepted',
        exitStatus: 0,
        time: 0,
        memory: 0,
        fileIds: { 'main.jar': 'java-jar-id' },
        files: { stdout: '', stderr: '' },
      }]),
    });

    const result = await service.compile('java', 'public class Main {}');
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(request.cmd[0].copyIn).toEqual({ 'Main.java': { content: 'public class Main {}' } });
    expect(request.cmd[0].copyOutCached).toEqual(['main.jar']);
    expect(result).toEqual({ success: true, fileId: 'java-jar-id', message: '' });
  });

  it('runs cached Java bytecode from the jar classpath', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([{
        status: 'Accepted',
        exitStatus: 0,
        time: 1_000_000,
        memory: 1024,
        files: { stdout: 'ok\n', stderr: '' },
      }]),
    });

    await service.run('java', '', 1000, 256, 'java-jar-id');
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(request.cmd[0].args).toEqual(['/usr/bin/java', '-cp', 'main.jar', 'Main']);
    expect(request.cmd[0].copyIn).toEqual({ 'main.jar': { fileId: 'java-jar-id' } });
  });

  it('passes SPJ companion files into the isolated runtime', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue([{
        status: 'Accepted',
        exitStatus: 0,
        time: 1_000_000,
        memory: 1024,
        files: { stdout: 'true\n', stderr: '' },
      }]),
    });

    await (service as any).runWithFiles(
      'cpp',
      'candidate output\n',
      1000,
      256,
      'checker-id',
      undefined,
      { input: '1 2\n', output: '3\n', user_output: 'candidate output\n' },
    );
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(request.cmd[0].copyIn).toEqual({
      main: { fileId: 'checker-id' },
      input: { content: '1 2\n' },
      output: { content: '3\n' },
      user_output: { content: 'candidate output\n' },
    });
  });

  it.each([
    { status: 'Accepted', exitStatus: 0 },
    { status: 'Accepted', exitStatus: 1, fileIds: { main: 'artifact' } },
    { status: 'Internal Error', exitStatus: 0 },
    { status: 'Nonzero Exit Status', exitStatus: 1, error: 'sandbox failed' },
    { status: 'Nonzero Exit Status', exitStatus: 1, signal: 11 },
  ])('rejects broken compilation contracts %j as infrastructure failure', async (result) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ time: 0, memory: 0, files: { stdout: '', stderr: '' }, ...result }] });
    expect(await service.compile('cpp', 'code')).toEqual(expect.objectContaining({ success: false, systemError: true }));
  });

  it('retains ordinary compiler errors as user compilation errors', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ status: 'Nonzero Exit Status', exitStatus: 1, time: 0, memory: 0, files: { stderr: 'syntax error' } }] });
    expect(await service.compile('cpp', 'code')).toEqual(expect.objectContaining({ success: false, message: 'syntax error' }));
  });

  it.each([{ body: [] }, { body: [{}] }, { body: [{ status: 'toString', exitStatus: 0, time: 0, memory: 0 }] }, { body: [{ status: 'Accepted', exitStatus: 0, time: -1, memory: 0 }] }])('rejects malformed sandbox bodies %j', async ({ body }) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => body });
    expect(await service.run('python', '', 1000, 256, undefined, 'pass')).toEqual(expect.objectContaining({ status: 'SYSTEM_ERROR' }));
  });

  it('rejects HTTP failure even with an accepted body', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => [{ status: 'Accepted', exitStatus: 0, time: 0, memory: 0 }] });
    expect(await service.run('python', '', 1000, 256, undefined, 'pass')).toEqual(expect.objectContaining({ status: 'SYSTEM_ERROR' }));
  });

  it('preserves checker fault evidence and bounds sandbox wall time', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ status: 'Signalled', exitStatus: 0, signal: 11, error: 'segfault', time: 1, memory: 1024, files: { stderr: 'fault', stdout: '' } }] });
    expect(await service.run('cpp', '', 1000, 256, 'artifact')).toEqual(expect.objectContaining({ status: 'RUNTIME_ERROR', sandboxStatus: 'Signalled', signal: 11, error: 'segfault', stderr: 'fault', exitStatus: 0 }));
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(request.cmd[0].clockLimit).toBeGreaterThanOrEqual(request.cmd[0].cpuLimit);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps the HTTP deadline active through body reading', async () => {
    jest.useFakeTimers();
    try {
      fetchMock.mockImplementation(async (_url, options) => ({ ok: true, json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('body deadline')))) }));
      const pending = service.run('python', '', 1000, 256, undefined, 'pass');
      await jest.advanceTimersByTimeAsync(120_000);
      expect(await pending).toEqual(expect.objectContaining({ status: 'SYSTEM_ERROR' }));
    } finally { jest.useRealTimers(); }
  });

  it.each([
    { error: 'container failed' },
    { fileError: [{ name: 'stdout', message: 'copy failed' }] },
    { signal: 11 },
  ])('never accepts inconsistent sandbox success %j', async (extra) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ status: 'Accepted', exitStatus: 0, time: 0, memory: 0, files: { stdout: '', stderr: '' }, ...extra }] });
    expect((await service.run('cpp', '', 1000, 256, 'artifact')).status).toBe('SYSTEM_ERROR');
  });

  it('keeps transport failure distinct from contestant stdout', async () => {
    fetchMock.mockRejectedValue(new Error('connection refused'));
    expect(await service.run('cpp', '', 1000, 256, 'artifact')).toEqual(expect.objectContaining({ status: 'SYSTEM_ERROR', output: '', error: 'connection refused' }));
  });

  it('does not send invalid resource limits to the sandbox', async () => {
    expect((await service.run('cpp', '', Number.NaN, -1, 'artifact')).status).toBe('SYSTEM_ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { stdout: '' }, { stderr: '' }])('rejects incomplete successful streams %j for running and compilation', async (files) => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ status: 'Accepted', exitStatus: 0, time: 0, memory: 0, fileIds: { main: 'artifact' }, files }] });
    expect((await service.run('cpp', '', 1000, 256, 'artifact')).status).toBe('SYSTEM_ERROR');
    expect(await service.compile('cpp', 'code')).toEqual(expect.objectContaining({ success: false, systemError: true }));
  });

  it('accepts explicitly present empty stdout and stderr', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => [{ status: 'Accepted', exitStatus: 0, time: 0, memory: 0, files: { stdout: '', stderr: '' } }] });
    expect(await service.run('cpp', '', 1000, 256, 'artifact')).toEqual(expect.objectContaining({ status: 'ACCEPTED', output: '', stderr: '' }));
  });

  it.each(['stdout', 'stderr'])('keeps sandbox output-limit collector evidence for %s as OLE, not infrastructure error', async (name) => {
    fetchMock.mockResolvedValue({ok:true,json:async()=>[{
      status:'Output Limit Exceeded',exitStatus:0,time:43_000_000,memory:36_000_000,
      error:'Output Limit Exceeded',files:{stdout:'truncated',stderr:''},
      fileError:[{name,type:'CollectSizeExceeded',message:'Output Limit Exceeded'}],
    }]});
    expect((await service.run('python','',1000,256,undefined,'print("large")')).status).toBe('OUTPUT_LIMIT_EXCEEDED');
    expect(await service.compile('cpp','bad code')).toEqual(expect.objectContaining({success:false}));
    expect((await service.compile('cpp','bad code')).systemError).not.toBe(true);
  });

  it('does not hide unrelated copy failures behind an output-limit status', async () => {
    fetchMock.mockResolvedValue({ok:true,json:async()=>[{
      status:'Output Limit Exceeded',exitStatus:0,time:0,memory:0,
      fileError:[{name:'stdout',type:'CopyOutOpenError',message:'disk failure'}],
    }]});
    expect((await service.run('python','',1000,256,undefined,'pass')).status).toBe('SYSTEM_ERROR');
  });
});
