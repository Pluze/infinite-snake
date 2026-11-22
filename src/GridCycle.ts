import { Point } from './Game';
import { cycleDirection, cycleOrder } from './TorusCycle';

/** An indexed Hamiltonian cycle without a board-sized array. */
export class GridCycle {
  readonly size: number;
  private readonly columnsFirst: boolean;
  private readonly rows: number;
  private readonly insertion: number;
  private readonly width: number;
  private readonly height: number;

  constructor(
    private readonly boardWidth: number, private readonly boardHeight: number, private readonly wraparound: boolean,
    private readonly reverse = false, private readonly swapAxes = false, private readonly rowOrigin = 0, private readonly columnOrigin = 0,
  ) {
    this.width = swapAxes ? boardHeight : boardWidth;
    this.height = swapAxes ? boardWidth : boardHeight;
    this.size = this.width * this.height;
    this.columnsFirst = !wraparound && this.height % 2 === 1;
    this.rows = this.height - Number(wraparound && this.height % 2 === 1);
    // On an odd torus, splice the last row into the bottom edge of the even rectangle.
    this.insertion = this.rows === this.height ? this.size : this.width + (this.rows - 2) * (this.width - 1) + 1;
  }

  bridgeSave(until: number) {
    return { until, reverse: this.reverse, swapAxes: this.swapAxes, row: this.rowOrigin, column: this.columnOrigin };
  }

  reversed() { return new GridCycle(this.boardWidth, this.boardHeight, this.wraparound, !this.reverse, this.swapAxes, this.rowOrigin, this.columnOrigin); }
  transposed() { return new GridCycle(this.boardWidth, this.boardHeight, this.wraparound, this.reverse, !this.swapAxes, this.rowOrigin, this.columnOrigin); }

  index(p: Point) {
    if (this.rowOrigin || this.columnOrigin) p = {
      x: (p.x - this.columnOrigin + this.boardWidth) % this.boardWidth,
      y: (p.y - this.rowOrigin + this.boardHeight) % this.boardHeight,
    };
    const index = this.forwardIndex(this.swapAxes ? { x: p.y, y: p.x } : p);
    return this.reverse && index ? this.size - index : index;
  }

  private forwardIndex({ x, y }: Point): number {
    if (this.width === 1) return y;
    if (this.height === 1) return x;
    if (y === 0) return x;
    if (this.columnsFirst) {
      const column = this.width - 1 - x;
      return this.width + column * (this.height - 1) + (column % 2 ? this.height - 1 - y : y - 1);
    }
    if (y === this.rows) return this.insertion + (x + 1) % this.width;
    // Leave the first column open to return from the last row to the start.
    const rectangleIndex = this.wraparound && this.rows === this.height ? y * this.width + (y % 2 ? this.width - 1 - x : x) : x === 0
      ? this.rows * this.width - y
      : this.width + (y - 1) * (this.width - 1) + (y % 2 ? this.width - 1 - x : x - 1);
    return rectangleIndex + (rectangleIndex >= this.insertion ? this.width : 0);
  }

  point(index: number): Point {
    let p = this.forwardPoint(this.reverse && index ? this.size - index : index);
    if (this.swapAxes) p = { x: p.y, y: p.x };
    if (this.columnOrigin) p.x = (p.x + this.columnOrigin) % this.boardWidth;
    if (this.rowOrigin) p.y = (p.y + this.rowOrigin) % this.boardHeight;
    return p;
  }

  private forwardPoint(index: number): Point {
    if (this.width === 1) return { x: 0, y: index };
    if (this.height === 1) return { x: index, y: 0 };
    if (index < this.width) return { x: index, y: 0 };
    if (this.columnsFirst) {
      const column = Math.floor((index - this.width) / (this.height - 1));
      const position = (index - this.width) % (this.height - 1);
      return { x: this.width - 1 - column, y: column % 2 ? this.height - 1 - position : position + 1 };
    }
    if (index >= this.insertion) {
      if (index < this.insertion + this.width)
        return { x: (index - this.insertion + this.width - 1) % this.width, y: this.rows };
      index -= this.width;
    }
    if (this.wraparound && this.rows === this.height) {
      const y = Math.floor(index / this.width), position = index % this.width;
      return { x: y % 2 ? this.width - 1 - position : position, y };
    }
    if (index >= this.rows * (this.width - 1) + 1) return { x: 0, y: this.rows * this.width - index };
    const y = 1 + Math.floor((index - this.width) / (this.width - 1));
    const position = (index - this.width) % (this.width - 1);
    return { x: y % 2 ? this.width - 1 - position : position + 1, y };
  }

  direction(p: Point) { return cycleDirection(p, this.point((this.index(p) + 1) % this.size)); }
  distance(from: Point, to: Point) { return (this.index(to) - this.index(from) + this.size) % this.size; }
  ordered(body: Iterable<Point>) { return cycleOrder(this, body); }
}
