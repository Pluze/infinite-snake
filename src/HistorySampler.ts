import { ScoreHistory } from './ScoreHistory';

export const mealSteps = (history: ScoreHistory, index: number) =>
  history.changes[index][0] - history.changes[index - 1][0];

const cachedStats = new WeakMap<ScoreHistory, { first: number; end: number; window: number; median: Float64Array; mean: Float64Array; p25: Float64Array; p75: Float64Array }>();

export function mealStats(history: ScoreHistory, first: number) {
  const end = history.changes.length;
  const window = Math.max(1, Math.round((end - first) * 0.15));
  const cached = cachedStats.get(history);
  if (cached && cached.first === first && cached.end === end) return cached;

  // Include the preceding meals so zooming does not truncate the first median.
  const start = Math.max(1, first - window + 1);
  const distinct = new Set<number>();
  for (let i = start; i < end; i++) distinct.add(mealSteps(history, i));
  const costs = [...distinct].sort((a, b) => a - b);
  const ranks = new Map(costs.map((cost, index) => [cost, index + 1]));
  // A Fenwick tree maintains the ordered frequencies as each interval enters
  // or leaves the trailing window. Each median takes logarithmic time.
  const counts = new Int32Array(costs.length + 1);
  const update = (cost: number, delta: number) => {
    for (let rank = ranks.get(cost)!; rank < counts.length; rank += rank & -rank) counts[rank] += delta;
  };
  const topBit = 2 ** Math.floor(Math.log2(Math.max(1, costs.length)));
  const select = (order: number) => {
    let rank = 0;
    for (let bit = topBit; bit >= 1; bit /= 2) {
      const next = rank + bit;
      if (next < counts.length && counts[next] < order) {
        order -= counts[next];
        rank = next;
      }
    }
    return costs[rank];
  };
  const length = Math.max(0, end - first);
  const median = new Float64Array(length), mean = new Float64Array(length);
  const p25 = new Float64Array(length), p75 = new Float64Array(length);
  const quantile = (size: number, fraction: number) => {
    const position = (size - 1) * fraction;
    const rank = Math.floor(position) + 1;
    const lower = select(rank);
    const weight = position % 1;
    return weight ? lower + weight * (select(rank + 1) - lower) : lower;
  };
  let sum = 0;
  for (let i = start; i < end; i++) {
    const cost = mealSteps(history, i);
    update(cost, 1);
    sum += cost;
    if (i - window >= start) {
      const expired = mealSteps(history, i - window);
      update(expired, -1);
      sum -= expired;
    }
    if (i < first) continue;
    const size = Math.min(i, window), offset = i - first;
    mean[offset] = sum / size;
    median[offset] = quantile(size, 0.5);
    p25[offset] = quantile(size, 0.25);
    p75[offset] = quantile(size, 0.75);
  }
  const result = { first, end, window, median, mean, p25, p75 };
  cachedStats.set(history, result);
  return result;
}

export function sampleHistory(history: ScoreHistory, start: number, growth: boolean, initialLength: number, buckets = 120) {
  const end = history.length;
  if (growth) {
    const width = Math.max(1, Math.ceil((end - start) / buckets));
    const selected = new Set<number>();
    for (let from = start; from < end; from += width) {
      selected.add(from);
      selected.add(Math.min(end, from + width) - 1);
    }
    return [...selected].map(step => ({ x: step, score: initialLength + history.at(step) / 10 }));
  }

  // Sample the same linear food-count axis that is used to draw the chart.
  const changes = history.changes;
  const first = Math.max(1, start);
  if (first >= changes.length) return [];
  const stats = mealStats(history, first);
  const selected = new Set([first, changes.length - 1]);
  const width = Math.ceil((changes.length - first) / buckets);
  for (let from = first; from < changes.length; from += width) {
    const until = Math.min(changes.length, from + width);
    let low = from, high = from;
    for (let i = from + 1; i < until; i++) {
      const cost = mealSteps(history, i);
      if (cost < mealSteps(history, low)) low = i;
      if (cost > mealSteps(history, high)) high = i;
    }
    selected.add(low); selected.add(high);
    for (const values of [stats.mean, stats.median, stats.p25, stats.p75]) {
      low = high = from;
      for (let i = from + 1; i < until; i++) {
        if (values[i - first] < values[low - first]) low = i;
        if (values[i - first] > values[high - first]) high = i;
      }
      selected.add(low); selected.add(high);
    }
  }
  return [...selected].sort((a, b) => a - b).map(i => ({ x: i, score: mealSteps(history, i) }));
}
