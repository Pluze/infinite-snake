import { Game } from './Game';
import { sampleHistory } from './HistorySampler';
import { formatCount } from './formatCount';
function fillRatio(length: number, capacity: number) {
  const ratio = length / capacity;
  if (ratio === 1 || ratio === 0) return String(ratio);
  if (ratio > .999) return '>0.999';
  return String(Number(ratio.toPrecision(3)));
}

export class Charts {
  private limits = [0, 0];
  private lastSteps = -1;
  private dirty = true;
  private lastDraw = 0;
  constructor() {
    document.querySelectorAll<HTMLButtonElement>('.ranges button').forEach(button => button.addEventListener('click', () => {
      const group = button.parentElement!, index = group.dataset.chart === 'growth' ? 0 : 1;
      this.limits[index] = Number(button.dataset.range); this.dirty = true;
      group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    }));
  }
  reset() {
    this.dirty = true;
    this.lastSteps = -1;
    for (const id of ['growth-chart', 'efficiency-chart']) {
      const svg = document.getElementById(id)?.querySelector('svg');
      if (svg) { svg.onpointermove = null; svg.replaceChildren(); }
    }
  }
  invalidate() { this.dirty = true; }
  render(game: Game) {
    if (!this.dirty && this.lastSteps === game.steps) return;
    if (performance.now() - this.lastDraw < 500) return;
    this.lastDraw = performance.now(); this.lastSteps = game.steps; this.dirty = false;
    const initialLength = game.length - game.score / 10;
    ['growth-chart', 'efficiency-chart'].forEach((id, i) => {
      const panel = document.getElementById(id)!; if (!panel.getClientRects().length) return;
      const points = sampleHistory(game.scores, this.limits[i], i === 0, initialLength);
      const svg = panel.querySelector('svg')!;
      if (!points.length) return;
      const minX = points[0].step, maxX = Math.max(minX + 1, game.steps);
      const peak = Math.max(i === 0 ? 10 : 1, ...points.map(p => p.score)) * 1.12;
      const maxY = i === 0 ? Math.min(game.capacity, Math.ceil(peak / 2) * 2) : peak;
      const right = i === 0 ? 270 : 316;
      const x = (n: number) => 34 + (n - minX) / (maxX - minX) * (right - 34);
      const y = (n: number) => 101 - n / maxY * 88;
      const path = points.map((p, j) => `${j ? 'L' : 'M'}${x(p.step).toFixed(2)},${y(p.score).toFixed(2)}`).join(' ');
      const color = i === 0 ? '#b5e59b' : '#e9b47b';
      svg.innerHTML = `<defs><linearGradient id="fill-${i}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${color}" stop-opacity=".15"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>` +
        (i === 0 ? [...new Set([0, Math.floor(maxY / 2) / maxY, 1])] : [0, .5, 1]).map(f => `<path d="M34 ${y(f * maxY)} H${right}" stroke="#2c4031" stroke-dasharray="2 4"/><text x="28" y="${y(f * maxY) + 3}" text-anchor="end">${i ? (f * maxY).toFixed(0) : formatCount(Math.round(f * maxY))}</text>${i === 0 ? `<text x="324" y="${y(f * maxY) + 3}" text-anchor="end">${fillRatio(f * maxY, game.capacity)}</text>` : ''}`).join('') +
        `<path d="${path} L${x(points[points.length-1].step)},101 L34,101 Z" fill="url(#fill-${i})"/><path d="${path}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linejoin="round"/><circle cx="${x(points[points.length-1].step)}" cy="${y(points[points.length-1].score)}" r="2.5" fill="${color}"/><text x="34" y="119">${formatCount(minX)}</text><text x="${right}" y="119" text-anchor="end">${formatCount(game.steps)}</text>`;
      svg.onpointermove = e => {
        const rect = svg.getBoundingClientRect(), step = Math.round(minX + Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width * 330 - 34) / (right - 34))) * (maxX - minX));
        const actual = Math.min(game.steps, step), score = game.scores.at(actual);
        panel.querySelector('.chart-tooltip')!.textContent = `Step ${formatCount(actual)} · ${i ? `Food efficiency ${actual ? (score / 10 / actual * 100).toFixed(2) : '0'}%` : `Length ${formatCount(score / 10 + initialLength)} · Board fill ${fillRatio(score / 10 + initialLength, game.capacity)} · Score ${formatCount(score)}`}`;
      };
    });
  }
}
