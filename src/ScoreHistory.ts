export type ScoreChange = [step: number, score: number];

/** Keep constant-score runs in one entry, with exact random access by step. */
export class ScoreHistory {
  length = 1;
  readonly changes: ScoreChange[];

  constructor(initialScore = 0) { this.changes = [[0, initialScore]]; }

  record(score: number) {
    const previous = this.changes[this.changes.length - 1][1];
    if (score !== previous) this.changes.push([this.length, score]);
    this.length++;
  }

  changeIndex(step: number) {
    const last = this.changes.length - 1;
    if (step >= this.changes[last][0]) return last;
    let left = 0, right = this.changes.length;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (this.changes[middle][0] <= step) left = middle + 1;
      else right = middle;
    }
    return left - 1;
  }

  at(step: number) { return this.changes[this.changeIndex(step)]?.[1] ?? 0; }

  static fromScores(scores: number[]) {
    const history = new ScoreHistory(scores[0]);
    for (let i = 1; i < scores.length; i++) history.record(scores[i]);
    return history;
  }
}
