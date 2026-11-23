import { ScoreHistory } from './ScoreHistory';

export const mealSteps = (history: ScoreHistory, index: number) =>
  history.changes[index][0] - history.changes[index - 1][0];

const medianSeries = new WeakMap<ScoreHistory, number[]>();

// Bite events are append-only. Repainting or changing the chart window
// reads cached medians and only new meals incur a nine-element sort.
export function mealMedian(history: ScoreHistory, index: number) {
  let series = medianSeries.get(history);
  if (!series) { series = [0]; medianSeries.set(history, series); }
  if (series[index] === undefined) {
    const values: number[] = [];
    for (let bite = Math.max(1, index - 8); bite <= index; bite++) values.push(mealSteps(history, bite));
    values.sort((a, b) => a - b);
    const middle = values.length >> 1;
    series[index] = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  }
  return series[index];
}

export function sampleHistory(history: ScoreHistory, windowSize: number, growth: boolean, initialLength: number, buckets = 120) {
  const end = history.length;
  const start = windowSize ? Math.max(0, end - windowSize - 1) : 0;
  const width = Math.max(1, Math.ceil((end - start) / buckets));
  if (growth) {
    const selected = new Set<number>();
    for (let from = start; from < end; from += width) {
      selected.add(from);
      selected.add(Math.min(end, from + width) - 1);
    }
    return [...selected].map(step => ({ step, score: initialLength + history.at(step) / 10 }));
  }

  // Bucket by elapsed steps, but preserve actual bite times and the longest
  // and shortest meals, including intervals beginning outside the window.
  const changes = history.changes;
  const first = Math.max(1, history.changeIndex(start - 1) + 1);
  if (first >= changes.length) return [];
  const selected = new Set([first, changes.length - 1]);
  const logStart = Math.log(Math.max(1, start));
  const logWidth = (Math.log(Math.max(2, end)) - logStart) / buckets;
  let bucket = -1, low = first, high = first, lowMedian = first, highMedian = first;
  for (let i = first; i < changes.length; i++) {
    const current = Math.floor((Math.log(changes[i][0]) - logStart) / logWidth);
    if (current !== bucket) {
      selected.add(low); selected.add(high); selected.add(lowMedian); selected.add(highMedian);
      low = high = lowMedian = highMedian = i; bucket = current;
    }
    const steps = mealSteps(history, i);
    if (steps < mealSteps(history, low)) low = i;
    if (steps > mealSteps(history, high)) high = i;
    const median = mealMedian(history, i);
    if (median < mealMedian(history, lowMedian)) lowMedian = i;
    if (median > mealMedian(history, highMedian)) highMedian = i;
  }
  selected.add(low); selected.add(high); selected.add(lowMedian); selected.add(highMedian);
  return [...selected].sort((a, b) => a - b).map(i => ({ step: changes[i][0], score: mealSteps(history, i) }));
}
