import { ScoreHistory } from './ScoreHistory';

export const mealSteps = (history: ScoreHistory, index: number) =>
  history.changes[index][0] - history.changes[index - 1][0];

// Adjacent meal intervals telescope to a single difference in bite times.
export function mealMean(history: ScoreHistory, index: number) {
  const count = Math.min(index, 9);
  return (history.changes[index][0] - history.changes[index - count][0]) / count;
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
  let bucket = -1, low = first, high = first, lowMean = first, highMean = first;
  for (let i = first; i < changes.length; i++) {
    const current = Math.floor((changes[i][0] - start) / width);
    if (current !== bucket) {
      selected.add(low); selected.add(high); selected.add(lowMean); selected.add(highMean);
      low = high = lowMean = highMean = i; bucket = current;
    }
    const steps = mealSteps(history, i);
    if (steps < mealSteps(history, low)) low = i;
    if (steps > mealSteps(history, high)) high = i;
    const mean = mealMean(history, i);
    if (mean < mealMean(history, lowMean)) lowMean = i;
    if (mean > mealMean(history, highMean)) highMean = i;
  }
  selected.add(low); selected.add(high); selected.add(lowMean); selected.add(highMean);
  return [...selected].sort((a, b) => a - b).map(i => ({ step: changes[i][0], score: mealSteps(history, i) }));
}
