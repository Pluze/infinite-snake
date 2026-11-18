/** Serialize background saves while coalescing changes made during an active write. */
export class ProgressSaver {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private changed = false;
  private writing = false;
  private flushAgain = false;
  private generation = 0;
  constructor(private persist: () => Promise<void>, private failure: (error: unknown) => void, private interval = 1500) {}
  markDirty() { this.changed = true; this.schedule(); }
  private schedule() {
    if (this.timer === undefined && !this.writing) this.timer = setTimeout(() => this.flush(), this.interval);
  }
  cancel() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined; this.changed = false; this.flushAgain = false; this.generation++;
  }
  flush() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.writing) { this.flushAgain = true; return; }
    if (!this.changed) return;
    this.changed = false; this.writing = true;
    const generation = this.generation;
    void Promise.resolve().then(() => this.persist()).catch(error => {
      if (generation === this.generation) { this.changed = true; this.failure(error); }
    }).finally(() => {
      this.writing = false;
      const immediate = this.flushAgain; this.flushAgain = false;
      if (this.changed) { if (immediate) this.flush(); else this.schedule(); }
    });
  }
}
