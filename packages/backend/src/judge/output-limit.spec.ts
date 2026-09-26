import { JudgeService } from './judge.service';

describe('configured output limits and cached output', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  let service: JudgeService;
  beforeEach(() => {
    fetchMock = jest.fn(); global.fetch = fetchMock as any;
    service = new JudgeService({get:()=> 'http://sandbox:5050'} as any);
  });
  afterEach(()=> { global.fetch = originalFetch; });
  it('cleans a cached file even when the sandbox response is malformed', async () => {
    fetchMock.mockResolvedValueOnce({ok:true,json:async()=>[{status:'Accepted',exitStatus:0,time:1,memory:1,fileIds:{stdout:'orphan-id'},files:{}}]})
      .mockResolvedValueOnce({ok:true});
    const result=await service.run('cpp','',1000,256,'p','',{outputLimitMb:1024,cacheOutput:true});
    expect(result.status).toBe('SYSTEM_ERROR');
    expect(fetchMock.mock.calls.some(([url,options])=>url.endsWith('/file/orphan-id')&&options.method==='DELETE')).toBe(true);
  });
  it('uses 1024 MiB and caches stdout instead of embedding it in JSON', async () => {
    fetchMock.mockResolvedValueOnce({ok:true,json:async()=>[{status:'Accepted',exitStatus:0,time:1,memory:1,files:{stderr:''},fileIds:{stdout:'result-id'}}]})
      .mockResolvedValueOnce(new Response('Yes\n'));
    const result = await (service.run as any)('cpp','',1000,256,'program','', {outputLimitMb:1024,cacheOutput:true});
    const command = JSON.parse(fetchMock.mock.calls[0][1].body).cmd[0];
    expect(command.files[1].max).toBe(1024*1024*1024);
    expect(command.copyOut).toEqual(['stderr']);
    expect(command.copyOutCached).toEqual(['stdout']);
    expect(result.status).toBe('ACCEPTED');
    expect(result.outputFileId).toBe('result-id');
  });
  it('passes cached output as checker stdin and companion file', async () => {
    fetchMock.mockResolvedValueOnce({ok:true,json:async()=>[{status:'Accepted',exitStatus:0,time:1,memory:1,files:{stdout:'true',stderr:''}}]});
    await (service.runWithFiles as any)('cpp',{fileId:'result-id'},1000,256,'checker','',{user_output:{fileId:'result-id'}});
    const command = JSON.parse(fetchMock.mock.calls[0][1].body).cmd[0];
    expect(command.files[0]).toEqual({fileId:'result-id'});
    expect(command.copyIn.user_output).toEqual({fileId:'result-id'});
  });
  it.each(['Yes\r\n42 \t\r\n','Yes\n42','Yes\r42'])('streams normalized output: %j',async actual=>{
    fetchMock.mockResolvedValueOnce(new Response(actual));
    expect(await (service as any).compareCachedOutput('f','Yes\n42\n')).toBe(true);
  });
  it('does not accept a matching prefix followed by extra output',async()=>{
    fetchMock.mockResolvedValueOnce(new Response('Yes\n42\nextra'));
    expect(await (service as any).compareCachedOutput('f','Yes\n42')).toBe(false);
  });
  it('preserves CRLF and multibyte characters split across stream chunks', async () => {
    const data=new TextEncoder().encode('题\r\n42\r\n ');
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({start(controller){for(const b of data)controller.enqueue(new Uint8Array([b]));controller.close();}})));
    expect(await service.compareCachedOutput('f','题\n42')).toBe(true);
  });
  it('preserves leading BOM as data like the previous string comparator', async () => {
    fetchMock.mockResolvedValueOnce(new Response('\ufeffYes'));
    expect(await service.compareCachedOutput('f','Yes')).toBe(false);
  });
  it('does not accept a missing cached file as empty output',async()=>{
    fetchMock.mockResolvedValueOnce(new Response('',{status:404}));
    await expect((service as any).compareCachedOutput('f','')).rejects.toThrow();
  });
});
