import { ScoreHistory } from './ScoreHistory';

/** Efficiency falls between bites, so only run endpoints can be extrema. */
export function sampleHistory(history: ScoreHistory, windowSize: number, growth: boolean, initialLength: number, buckets = 120) {
  const end = history.length;
  const start = windowSize ? Math.max(0, end - windowSize - 1) : 0;
  const width = Math.max(1, Math.ceil((end - start) / buckets));
  const value = (step: number, score: number) => growth ? score / 10 + initialLength : step ? score / 10 / step * 100 : 0;
  const selected = new Set([start, end - 1]);
  for (let from = start; from < end; from += width) {
    const last = Math.min(end, from + width) - 1;
    let low = from, high = last;
    if (!growth) {
      high = from;
      let minimum = Infinity, maximum = -Infinity;
      let index = history.changeIndex(from);
      for (let step = from; step <= last;) {
        const score = history.changes[index][1];
        const next = Math.min(last + 1, history.changes[++index]?.[0] ?? end);
        const peakStep = step === 0 && next > 1 ? 1 : step;
        const firstValue = value(peakStep, score), lastValue = value(next - 1, score);
        if (firstValue > maximum) { high = peakStep; maximum = firstValue; }
        if (lastValue < minimum) { low = next - 1; minimum = lastValue; }
        step = next;
      }
    }
    selected.add(low);
    selected.add(high);
  }
  return [...selected].sort((a, b) => a - b).map(step => ({ step, score: value(step, history.at(step)) }));
}
