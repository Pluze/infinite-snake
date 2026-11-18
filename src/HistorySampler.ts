/** A range-query tree for chart envelopes. Its leaves correspond to recorded steps. */
type ChartPoint = { step: number; score: number };
export class HistorySampler {
  private capacity = 1;
  private lower = new Int32Array(2).fill(-1);
  private upper = new Int32Array(2).fill(-1);
  private values: number[] = [];
  private metric = '';

  private choose(a: number, b: number, minimum: boolean) {
    if (a < 0) return b;
    if (b < 0) return a;
    return (minimum ? this.values[a] <= this.values[b] : this.values[a] >= this.values[b]) ? a : b;
  }
  private merge(node: number) {
    this.lower[node] = this.choose(this.lower[node * 2], this.lower[node * 2 + 1], true);
    this.upper[node] = this.choose(this.upper[node * 2], this.upper[node * 2 + 1], false);
  }
  private grow(required: number) {
    if (required <= this.capacity) return;
    while (this.capacity < required) this.capacity *= 2;
    this.lower = new Int32Array(this.capacity * 2).fill(-1);
    this.upper = new Int32Array(this.capacity * 2).fill(-1);
    for (let step = 0; step < this.values.length; step++) {
      this.lower[this.capacity + step] = step;
      this.upper[this.capacity + step] = step;
    }
    for (let node = this.capacity - 1; node > 0; node--) this.merge(node);
  }
  private range(start: number, end: number) {
    let low = -1, high = -1, left = start + this.capacity, right = end + this.capacity;
    const include = (node: number) => {
      low = this.choose(low, this.lower[node], true);
      high = this.choose(high, this.upper[node], false);
    };
    while (left < right) {
      if (left % 2) include(left++);
      if (right % 2) include(--right);
      left = Math.floor(left / 2); right = Math.floor(right / 2);
    }
    return [low, high];
  }
  sample(scores: number[], windowSize: number, metric: string, derive: (score: number, step: number) => number, buckets = 120): ChartPoint[] {
    if (metric !== this.metric || scores.length < this.values.length) {
      this.metric = metric; this.values = []; this.capacity = 1;
      this.lower = new Int32Array(2).fill(-1); this.upper = new Int32Array(2).fill(-1);
    }
    this.grow(scores.length);
    for (let step = this.values.length; step < scores.length; step++) {
      this.values.push(derive(scores[step], step));
      let node = this.capacity + step;
      this.lower[node] = step; this.upper[node] = step;
      while (node > 1) { node = Math.floor(node / 2); this.merge(node); }
    }
    const end = scores.length;
    if (!end) return [];
    const start = windowSize ? Math.max(0, end - windowSize - 1) : 0;
    const selected = new Set<number>([start, end - 1]);
    const width = Math.max(1, Math.ceil((end - start) / Math.max(1, buckets)));
    for (let from = start; from < end; from += width) {
      for (const step of this.range(from, Math.min(end, from + width))) if (step >= 0) selected.add(step);
    }
    return [...selected].sort((a, b) => a - b).map(step => ({ step, score: this.values[step] }));
  }
}
