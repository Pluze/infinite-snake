import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScoreHistory } from './ScoreHistory';
import { sampleHistory } from './HistorySampler';
import { ProgressSaver } from './ProgressSaver';
import { MemoryMonitor } from './MemoryMonitor';

describe('chart envelope queries', () => {
  it('retains growth extrema and measures completed meals across window boundaries', () => {
    const scores = Array.from({ length: 2049 }, (_, i) => Math.floor(i / 97) * 10);
    for (const limit of [0, 1000, 19]) {
      const points = sampleHistory(ScoreHistory.fromScores(scores), limit, true, 6, 30);
      const start = limit ? Math.max(0, scores.length - limit - 1) : 0;
      const width = Math.ceil((scores.length - start) / 30);
      const value = (score: number) => score / 10 + 6;
      expect(points[0].step).toBe(start);
      expect(points.at(-1)!.step).toBe(scores.length - 1);
      for (let from = start; from < scores.length; from += width) {
        const end = Math.min(scores.length, from + width);
        const values = scores.slice(from, end).map(value);
        const selected = points.filter(p => p.step >= from && p.step < end).map(p => p.score);
        expect(selected).toContain(Math.min(...values));
        expect(selected).toContain(Math.max(...values));
      }
    }
    const long = new ScoreHistory();
    long.length = 10_000_001;
    long.changes.push([8_000_000, 10]);
    const peak = sampleHistory(long, 0, false, 6).find(point => point.step === 8_000_000);
    expect(peak?.score).toBe(8_000_000);
    expect(sampleHistory(long, 1000, false, 6)).toEqual([]);
    const bites = ScoreHistory.fromScores([0, 0, 10, 10, 10, 10, 20, 30, 30]);
    expect(sampleHistory(bites, 3, false, 6)).toEqual([{ step: 6, score: 4 }, { step: 7, score: 1 }]);
    expect(long.changes).toHaveLength(2);
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
