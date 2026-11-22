import { Direction, Point, vectors } from './Game';
export type Cycle = Pick<TorusCycle, 'size' | 'index' | 'point' | 'direction' | 'distance' | 'ordered'>;

export function cycleDirection(from: Point, to: Point): Direction {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (dx) return dx === 1 || dx < -1 ? 0 : 2;
  return dy === 1 || dy < -1 ? 1 : 3;
}

export function cycleOrder(cycle: Pick<Cycle, 'size' | 'distance'>, body: Iterable<Point>) {
  let span = 0, previous: Point | undefined;
  for (const point of body) {
    if (previous) {
      const advance = cycle.distance(previous, point);
      if (!advance) return false;
      span += advance;
      if (span >= cycle.size) return false;
    }
    previous = point;
  }
  return true;
}

/** Join small perimeter loops into a single winding cycle across the torus. */
export class TorusCycle {
  readonly cells: Point[] = [];
  private order: Int32Array;
  private cutCosts?: { span: Int32Array; endAt: Int32Array };
  constructor(readonly width: number, readonly height: number, saved?: Point[] | Cycle, private readonly wraparound = true) {
    const size = width * height;
    this.order = new Int32Array(size).fill(-1);
    if (saved && !Array.isArray(saved)) {
      for (let i = 0; i < size; i++) {
        const point = saved.point(i);
        this.cells.push(point);
        this.order[point.y * width + point.x] = i;
      }
      return;
    }
    if (Array.isArray(saved) && saved.length === size) {
      for (const point of saved) {
        if (!point || !Number.isInteger(point.x) || !Number.isInteger(point.y)
          || point.x < 0 || point.x >= width || point.y < 0 || point.y >= height
          || this.index(point) !== -1) break;
        this.order[point.y * width + point.x] = this.cells.length;
        this.cells.push(point);
      }
      if (this.cells.length === size && this.cells.every((p, i) => this.adjacent(p, this.cells[(i + 1) % size]))) return;
      this.cells.length = 0;
      this.order.fill(-1);
    }
    if (width === 1 || height === 1) {
      for (let i = 0; i < size; i++) {
        const point = { x: i % width, y: Math.floor(i / width) };
        this.order[i] = i;
        this.cells.push(point);
      }
      return;
    }
    const left = new Int32Array(size);
    const right = new Int32Array(size);
    const columns = Math.floor(width / 2);
    const rows = Math.floor(height / 2);
    const cell = (x: number, y: number) => y * width + x;
    const loop = (cells: number[]) => {
      cells.forEach((node, i) => {
        left[node] = cells[(i + cells.length - 1) % cells.length];
        right[node] = cells[(i + 1) % cells.length];
      });
    };
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const x = col * 2;
        const count = col === columns - 1 && width % 2 ? 3 : 2;
        const y = row * 2;
        const depth = !wraparound && row === rows - 1 && height % 2 ? 3 : 2;
        const perimeter: number[] = [];
        for (let i = 0; i < count; i++) perimeter.push(cell(x + i, y));
        for (let i = 1; i < depth; i++) perimeter.push(cell(x + count - 1, y + i));
        for (let i = count - 2; i >= 0; i--) perimeter.push(cell(x + i, y + depth - 1));
        for (let i = depth - 2; i > 0; i--) perimeter.push(cell(x, y + i));
        loop(perimeter);
      }
    }
    const replace = (node: number, old: number, next: number) => {
      if (left[node] === old) left[node] = next;
      else if (right[node] === old) right[node] = next;
      else throw Error('Invalid cycle splice');
    };
    const join = (a: number, b: number, c: number, d: number) => {
      replace(a, b, c); replace(b, a, d); replace(c, d, a); replace(d, c, b);
    };
    const joinColumns = (row: number, col: number) => {
      const y = row * 2;
      const x = col * 2;
      join(cell(x - 1, y), cell(x - 1, y + 1), cell(x, y), cell(x, y + 1));
    };
    const joinRows = (row: number, col: number) => {
      const x = col * 2;
      const y = row * 2;
      join(cell(x, y - 1), cell(x + 1, y - 1), cell(x, y), cell(x + 1, y));
    };
    // Connect the starting row first to preserve the initial tail-to-head order.
    const joined = new Uint8Array(rows * columns);
    type Edge = { from: number; to: number };
    const frontier: Edge[] = [];
    const add = (node: number) => {
      joined[node] = 1;
      const row = Math.floor(node / columns);
      const col = node % columns;
      if (col > 0) frontier.push({ from: node, to: node - 1 });
      if (col + 1 < columns) frontier.push({ from: node, to: node + 1 });
      if (row > 0) frontier.push({ from: node, to: node - columns });
      if (row + 1 < rows) frontier.push({ from: node, to: node + columns });
    };
    for (let col = 0; col < columns; col++) {
      if (col) joinColumns(0, col);
      add(col);
    }
    // A deterministic mix spreads turns across the board instead of lining
    // them up at the ends of rows. Saves always rebuild the same cycle.
    let rng = (width << 16) | height;
    while (frontier.length) {
      rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
      const index = (rng >>> 0) % frontier.length;
      const { from, to } = frontier[index];
      frontier[index] = frontier[frontier.length - 1];
      frontier.pop();
      if (joined[to]) continue;
      const first = Math.min(from, to);
      const last = Math.max(from, to);
      if (last - first === columns) joinRows(Math.floor(last / columns), last % columns);
      else joinColumns(Math.floor(last / columns), last % columns);
      add(to);
    }
    if (wraparound && height % 2) {
      loop(Array.from({ length: width }, (_, x) => cell(x, height - 1)));
      joinRows(rows, (rng >>> 0) % columns);
    }
    let previous = -1, current = 0;
    for (let step = 0; step < size; step++) {
      if (this.order[current] !== -1) throw Error('Cycle closed before covering the world');
      this.order[current] = step;
      this.cells.push({ x: current % width, y: Math.floor(current / width) });
      const next = step === 0 ? 1 : left[current] === previous ? right[current] : left[current];
      previous = current; current = next;
    }
    if (current !== 0) throw Error('Cycle does not close');
  }
  index(p: Point) { return this.order[p.y * this.width + p.x]; }
  distance(from: Point, to: Point) { return (this.index(to) - this.index(from) + this.cells.length) % this.cells.length; }
  get size() { return this.cells.length; }
  point(index: number) { return this.cells[index]; }
  direction(p: Point) {
    const next = this.point((this.index(p) + 1) % this.size);
    if (this.wraparound && this.width === 2 && next.y === p.y) return 0;
    if (this.wraparound && this.height === 2 && next.x === p.x) return 1;
    return cycleDirection(p, next);
  }
  private adjacent(a: Point, b: Point) {
    const dx = Math.abs(a.x - b.x);
    const dy = Math.abs(a.y - b.y);
    return (dx === 0 && (dy === 1 || (this.wraparound && dy === this.height - 1)))
      || (dy === 0 && (dx === 1 || (this.wraparound && dx === this.width - 1)));
  }

  bringFoodForward(head: Point, tail: Point, food: Point) {
    const size = this.size, start = this.index(head);
    const at = (offset: number) => this.cells[(start + offset) % size];
    const distance = this.distance(head, food), clearance = this.distance(head, tail);
    if (distance >= clearance || distance < 2) return false;

    // A cut (i,j) splits off the arc i+1..j. For a second cut (k,l)
    // with k<i<l<j the reconnected order is [l+1..j][i+1..l][k+1..i].
    // Sweep k backwards so every stored outer cut already satisfies i>k.
    let best = distance;
    let edit: [number, number] | [number, number, number, number] | undefined;
    let nearestStart = -1, nearestEnd = -1;
    // For l >= distance we need min(j-i) over j>l. A prefix-minimum
    // Fenwick tree on the reversed endpoint supplies the optimal predecessor.
    const count = clearance - distance;
    if (!this.cutCosts || this.cutCosts.span.length <= count) {
      this.cutCosts = { span: new Int32Array(count + 1), endAt: new Int32Array(count + 1) };
    } else {
      this.cutCosts.span.fill(0, 1, count + 1);
    }
    const { span, endAt } = this.cutCosts;
    const pending: number[] = [];
    for (let k = distance - 1; k >= 0; k--) {
      const next = at(k + 1), here = at(k);
      pending.length = 0;
      for (const v of vectors) {
        let x = next.x + v.x, y = next.y + v.y;
        if (this.wraparound) {
          x = (x + this.width) % this.width; y = (y + this.height) % this.height;
        } else if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        const l = (this.order[y * this.width + x] - start + size) % size;
        if (l <= k + 1 || l > clearance) continue;
        if (l > distance && k + l - distance < best && this.adjacent(here, at(l - 1))) {
          best = k + l - distance;
          edit = [k + 1, l - 1];
        }
        if (l === clearance || !this.adjacent(here, at(l + 1))) continue;
        if (l < distance) {
          const cost = distance - l + k;
          if (nearestStart >= 0 && nearestStart < l && cost < best) {
            best = cost; edit = [k, nearestStart, l, nearestEnd];
          }
        } else {
          for (let q = clearance - l - 1; q > 0; q -= q & -q) {
            const cost = distance + k - l + span[q];
            if (span[q] && cost < best) {
              best = cost; edit = [k, endAt[q] - span[q], l, endAt[q]];
            }
          }
          pending.push(l);
        }
      }
      for (const j of pending) {
        nearestStart = k; nearestEnd = j;
        for (let q = clearance - j; q <= count; q += q & -q) {
          if (!span[q] || j - k < span[q]) { span[q] = j - k; endAt[q] = j; }
        }
      }
    }
    if (!edit) return false;
    const reordered: Point[] = [];
    let firstChanged: number;
    if (edit.length === 2) {
      const [from, to] = edit;
      firstChanged = from;
      for (let i = to; i >= from; i--) reordered.push(at(i));
    } else {
      const [k, i, l, j] = edit;
      firstChanged = k + 1;
      for (let n = l + 1; n <= j; n++) reordered.push(at(n));
      for (let n = i + 1; n <= l; n++) reordered.push(at(n));
      for (let n = k + 1; n <= i; n++) reordered.push(at(n));
    }
    reordered.forEach((point, i) => {
      const position = (start + firstChanged + i) % size;
      this.cells[position] = point;
      this.order[point.y * this.width + point.x] = position;
    });
    return true;
  }
  ordered(body: Iterable<Point>) { return cycleOrder(this, body); }
}
