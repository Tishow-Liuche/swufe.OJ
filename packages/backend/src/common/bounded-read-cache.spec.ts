import { BoundedReadCache } from './bounded-read-cache';
describe('bounded read cache',()=>{
  afterEach(()=>jest.useRealTimers());
  it('single-flights and reuses values until expiry',async()=>{
    jest.useFakeTimers();const cache=new BoundedReadCache(2);const load=jest.fn(async()=>({value:1}));
    await Promise.all(Array.from({length:20},()=>cache.get('key',1000,load)));expect(load).toHaveBeenCalledTimes(1);
    await cache.get('key',1000,load);expect(load).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1001);await cache.get('key',1000,load);expect(load).toHaveBeenCalledTimes(2);
  });
  it('does not cache failures and bounds entries',async()=>{
    const cache=new BoundedReadCache(2);await expect(cache.get('bad',1000,async()=>{throw Error('bad');})).rejects.toThrow('bad');
    await expect(cache.get('bad',1000,async()=>1)).resolves.toBe(1);
    await cache.get('other',1000,async()=>2);await cache.get('third',1000,async()=>3);
    const load=jest.fn(async()=>4);await cache.get('bad',1000,load);expect(load).toHaveBeenCalledTimes(1);
  });
});
