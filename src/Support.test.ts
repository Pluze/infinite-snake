import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScoreHistory } from './ScoreHistory';
import { mealMedians, sampleHistory } from './HistorySampler';
import { ProgressSaver } from './ProgressSaver';
import { MemoryMonitor } from './MemoryMonitor';

describe('chart envelope queries', () => {
  it('uses 15% of visible meals and includes earlier bites at the left edge', () => {
    const history = new ScoreHistory();
    const intervals = Array.from({ length: 100 }, (_, i) => (i * 19) % 23 + 1);
    let step = 0;
    intervals.forEach((cost, i) => history.changes.push([step += cost, (i + 1) * 10]));
    for (const [first, window] of [[1, 15], [51, 8], [91, 2], [98, 1]]) {
      const series = mealMedians(history, first);
      expect(series.window).toBe(window);
      const expected = intervals.slice(first - 1).map((_, offset) => {
        const end = first + offset;
        const sorted = intervals.slice(Math.max(0, end - window), end).sort((a, b) => a - b);
        return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
      });
      expect(Array.from(series.values)).toEqual(expected);
    }
  });
  it('retains growth extrema and measures completed meals across window boundaries', () => {
    const scores = Array.from({ length: 2049 }, (_, i) => Math.floor(i / 97) * 10);
    for (const limit of [0, 1000, 19]) {
      const start = limit ? Math.max(0, scores.length - limit - 1) : 0;
      const points = sampleHistory(ScoreHistory.fromScores(scores), start, true, 6, 30);
      const width = Math.ceil((scores.length - start) / 30);
      const value = (score: number) => score / 10 + 6;
      expect(points[0].x).toBe(start);
      expect(points.at(-1)!.x).toBe(scores.length - 1);
      for (let from = start; from < scores.length; from += width) {
        const end = Math.min(scores.length, from + width);
        const values = scores.slice(from, end).map(value);
        const selected = points.filter(p => p.x >= from && p.x < end).map(p => p.score);
        expect(selected).toContain(Math.min(...values));
        expect(selected).toContain(Math.max(...values));
      }
    }
    const long = new ScoreHistory();
    long.length = 10_000_001;
    long.changes.push([8_000_000, 10]);
    const peak = sampleHistory(long, 0, false, 6).find(point => point.x === 1);
    expect(peak?.score).toBe(8_000_000);
    expect(sampleHistory(long, 1000, false, 6)).toEqual([]);
    const bites = ScoreHistory.fromScores([0, 0, 10, 10, 10, 10, 20, 30, 30]);
    expect(sampleHistory(bites, 2, false, 6)).toEqual([{ x: 2, score: 4 }, { x: 3, score: 1 }]);
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
