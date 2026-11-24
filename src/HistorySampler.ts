import { ScoreHistory } from './ScoreHistory';

export const mealSteps = (history: ScoreHistory, index: number) =>
  history.changes[index][0] - history.changes[index - 1][0];

const cachedMedians = new WeakMap<ScoreHistory, { first: number; end: number; window: number; values: Float64Array }>();

export function mealMedians(history: ScoreHistory, first: number) {
  const end = history.changes.length;
  const window = Math.max(1, Math.round((end - first) * 0.15));
  const cached = cachedMedians.get(history);
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
  const values = new Float64Array(Math.max(0, end - first));
  for (let i = start; i < end; i++) {
    update(mealSteps(history, i), 1);
    if (i - window >= start) update(mealSteps(history, i - window), -1);
    if (i < first) continue;
    const size = Math.min(i, window);
    const middle = Math.ceil(size / 2);
    const lower = select(middle);
    values[i - first] = size % 2 ? lower : (lower + select(middle + 1)) / 2;
  }
  const result = { first, end, window, values };
  cachedMedians.set(history, result);
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
  const { values } = mealMedians(history, first);
  const selected = new Set([first, changes.length - 1]);
  const width = Math.ceil((changes.length - first) / buckets);
  let bucket = -1, low = first, high = first, lowMedian = first, highMedian = first;
  for (let i = first; i < changes.length; i++) {
    const current = Math.floor((i - first) / width);
    if (current !== bucket) {
      selected.add(low); selected.add(high); selected.add(lowMedian); selected.add(highMedian);
      low = high = lowMedian = highMedian = i; bucket = current;
    }
    const steps = mealSteps(history, i);
    if (steps < mealSteps(history, low)) low = i;
    if (steps > mealSteps(history, high)) high = i;
    const median = values[i - first];
    if (median < values[lowMedian - first]) lowMedian = i;
    if (median > values[highMedian - first]) highMedian = i;
  }
  selected.add(low); selected.add(high); selected.add(lowMedian); selected.add(highMedian);
  return [...selected].sort((a, b) => a - b).map(i => ({ x: i, score: mealSteps(history, i) }));
}
