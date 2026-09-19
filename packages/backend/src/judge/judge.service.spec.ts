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
      json: jest.fn().mockResolvedValue([{
        status: 'Accepted',
        exitStatus: 0,
        time: 0,
        memory: 0,
        fileIds: { 'main.jar': 'java-jar-id' },
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
      json: jest.fn().mockResolvedValue([{
        status: 'Accepted',
        exitStatus: 0,
        time: 1_000_000,
        memory: 1024,
        files: { stdout: 'ok\n' },
      }]),
    });

    await service.run('java', '', 1000, 256, 'java-jar-id');
    const request = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(request.cmd[0].args).toEqual(['/usr/bin/java', '-cp', 'main.jar', 'Main']);
    expect(request.cmd[0].copyIn).toEqual({ 'main.jar': { fileId: 'java-jar-id' } });
  });

  it('passes SPJ companion files into the isolated runtime', async () => {
    fetchMock.mockResolvedValue({
      json: jest.fn().mockResolvedValue([{
        status: 'Accepted',
        exitStatus: 0,
        time: 1_000_000,
        memory: 1024,
        files: { stdout: 'true\n' },
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
});
