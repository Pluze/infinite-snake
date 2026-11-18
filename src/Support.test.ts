import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistorySampler } from './HistorySampler';
import { ProgressSaver } from './ProgressSaver';
import { MemoryMonitor } from './MemoryMonitor';

describe('chart envelope queries', () => {
  it('retains bucket extrema in order across appends, windows and metric changes', () => {
    const sampler = new HistorySampler();
    const scores = Array.from({length:2049},(_,i)=>i%97===0?1000:Math.sin(i)*50);
    const derive=(n:number)=>n;
    sampler.sample(scores.slice(0,500),0,'value',derive,30);
    for(const limit of [0,1000,19]){
      const points=sampler.sample(scores,limit,'value',derive,30);
      const start=limit?Math.max(0,scores.length-limit-1):0, width=Math.ceil((scores.length-start)/30);
      expect(points[0].step).toBe(start);expect(points.at(-1)!.step).toBe(scores.length-1);
      expect(points.map(p=>p.step)).toEqual([...new Set(points.map(p=>p.step))].sort((a,b)=>a-b));
      for(let from=start;from<scores.length;from+=width){
        const end=Math.min(scores.length,from+width), values=scores.slice(from,end), selected=points.filter(p=>p.step>=from&&p.step<end).map(p=>p.score);
        expect(selected).toContain(Math.min(...values));expect(selected).toContain(Math.max(...values));
      }
    }
    expect(sampler.sample([10,20,30],0,'double',n=>n*2).map(p=>p.score)).toEqual([20,40,60]);
    expect(sampler.sample([],0,'empty',derive)).toEqual([]);
  });
});
describe('save scheduling',()=>{
  afterEach(()=>{vi.useRealTimers();});
  it('coalesces updates and immediately flushes changes waiting behind a write',async()=>{
    vi.useFakeTimers();let complete!:()=>void;
    const write=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>complete=resolve)).mockResolvedValue(undefined);
    const saver=new ProgressSaver(write,vi.fn(),100);
    saver.markDirty();saver.markDirty();await vi.advanceTimersByTimeAsync(100);expect(write).toHaveBeenCalledTimes(1);
    saver.markDirty();saver.flush();expect(write).toHaveBeenCalledTimes(1);
    complete();await vi.advanceTimersByTimeAsync(0);expect(write).toHaveBeenCalledTimes(2);
    saver.markDirty();saver.cancel();await vi.advanceTimersByTimeAsync(200);expect(write).toHaveBeenCalledTimes(2);
  });
  it('retries failed saves and reports the failure',async()=>{
    vi.useFakeTimers();const write=vi.fn().mockRejectedValueOnce(Error('full')).mockResolvedValue(undefined), failure=vi.fn();
    const saver=new ProgressSaver(write,failure,100);saver.markDirty();await vi.advanceTimersByTimeAsync(100);expect(failure).toHaveBeenCalledOnce();await vi.advanceTimersByTimeAsync(100);expect(write).toHaveBeenCalledTimes(2);
  });
});
it('uses only valid heap readings and resets the consecutive-high condition',()=>{
  const monitor=new MemoryMonitor(),heap=(n:number)=>({usedJSHeapSize:n,jsHeapSizeLimit:100});
  expect(monitor.shouldPause(heap(86))).toBe(false);expect(monitor.shouldPause()).toBe(false);expect(monitor.shouldPause(heap(86))).toBe(false);expect(monitor.shouldPause(heap(86))).toBe(true);expect(monitor.shouldPause(heap(40))).toBe(false);expect(monitor.shouldPause(heap(95))).toBe(true);expect(monitor.shouldPause(heap(NaN))).toBe(false);
});
