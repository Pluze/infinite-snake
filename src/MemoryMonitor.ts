export type BrowserHeap = { usedJSHeapSize: number; jsHeapSizeLimit: number };
/** Ignore unavailable telemetry; stop on one critical or two consecutive high readings. */
export class MemoryMonitor {
  private previousHigh = false;
  shouldPause(reading?: BrowserHeap) {
    const used = reading?.usedJSHeapSize, limit = reading?.jsHeapSizeLimit;
    if (used === undefined || limit === undefined || !Number.isFinite(used) || !Number.isFinite(limit) || used < 0 || limit <= 0) {
      this.previousHigh = false;
      return false;
    }
    const percent = 100 * used / limit;
    const pause = percent >= 95 || (percent >= 85 && this.previousHigh);
    this.previousHigh = percent >= 85;
    return pause;
  }
}
