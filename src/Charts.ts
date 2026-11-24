import { Game } from './Game';
import { mealStats, mealSteps, sampleHistory } from './HistorySampler';
import { formatCount } from './formatCount';
function fillRatio(length: number, capacity: number) {
  const ratio = length / capacity;
  if (ratio === 1 || ratio === 0) return String(ratio);
  if (ratio > .999) return '>0.999';
  return String(Number(ratio.toPrecision(3)));
}

const mealLines = [
  { key: 'p25', label: 'P25' }, { key: 'p75', label: 'P75' },
  { key: 'mean', label: 'Mean' }, { key: 'median', label: 'Median' },
] as const;

export class Charts {
  private percentages = [0, 0];
  private lastSteps = -1;
  private dirty = true;
  private hoverX: (number | undefined)[] = [];
  private lastDraw = 0;
  constructor() {
    document.querySelectorAll<HTMLButtonElement>('.ranges button').forEach(button => button.addEventListener('click', () => {
      const group = button.parentElement!, index = group.dataset.chart === 'growth' ? 0 : 1;
      this.percentages[index] = Number(button.dataset.range); this.dirty = true;
      group.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
    }));
  }
  reset() {
    this.dirty = true;
    this.lastSteps = -1;
    this.hoverX = [];
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
      const endX = i ? game.scores.changes.length - 1 : game.steps;
      const percent = this.percentages[i];
      const count = percent ? Math.ceil(endX * percent / 100) : endX;
      const minX = endX - count + (i ? 1 : 0);
      const points = sampleHistory(game.scores, minX, i === 0, initialLength);
      const svg = panel.querySelector('svg')!;
      const series = i ? mealStats(game.scores, minX) : undefined;
      if (series) panel.querySelector('.median-label')!.textContent = points.length ? `${series.window}-meal median` : 'Median';
      if (!points.length) {
        svg.replaceChildren(); svg.onpointermove = null;
        panel.querySelector('.chart-tooltip')!.textContent = 'No food eaten yet.';
        return;
      }
      if (i) panel.querySelector('.chart-tooltip')!.textContent = 'X: food eaten · Log Y · Right: steps / (width + height)';
      const maxX = Math.max(minX + 1, endX);
      const curves = series ? mealLines.map(line => ({ ...line, values: points.map(p => series[line.key][p.x - minX]) })) : [];
      const peak = Math.max(i === 0 ? 10 : 1, ...points.map(p => p.score), ...curves.map(line => Math.max(...line.values))) * 1.12;
      const maxY = i === 0 ? Math.min(game.capacity, Math.ceil(peak / 2) * 2) : Math.max(2, Math.ceil(peak / 2) * 2);
      const right = 270;
      const span = game.width + game.height;
      const multiple = (steps: number) => Number((steps / span).toPrecision(3)) + "×";
      const x = (value: number) => 34 + (right - 34) * (value - minX) / (maxX - minX);
      const y = (value: number) => 101 - 88 * (i ? Math.log(value) / Math.log(maxY) : value / maxY);
      const yTicks = i ? [1] : [...new Set([0, Math.floor(maxY / 2), maxY])];
      if (i) {
        const stride = Math.max(1, Math.ceil(Math.log10(maxY) / 4));
        for (let value = 10 ** stride; value <= maxY; value *= 10 ** stride) yTicks.push(value);
        if (yTicks.length === 1) yTicks.push(maxY);
      }
      const xTicks = [minX];
      if (i && endX - minX >= 2) xTicks.push(Math.round((minX + endX) / 2));
      if (endX > minX) xTicks.push(endX);
      const path = points.map((p, j) => `${j ? 'L' : 'M'}${x(p.x).toFixed(2)},${y(p.score).toFixed(2)}`).join(' ');
      const overlays = curves.map(line => {
        const d = points.map((p, j) => `${j ? 'L' : 'M'}${x(p.x).toFixed(2)},${y(line.values[j]).toFixed(2)}`).join(' ');
        return `<path data-series="meal-${line.key}" d="${d}" fill="none" stroke-linejoin="round"/>`;
      }).join('');
      const color = i === 0 ? '#b5e59b' : '#e9b47b';
      svg.innerHTML = `<defs><linearGradient id="fill-${i}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${color}" stop-opacity=".15"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>` +
        yTicks.map(value => `<path d="M34 ${y(value)} H${right}" stroke="#2c4031" stroke-dasharray="2 4"/><text x="28" y="${y(value) + 3}" text-anchor="end">${formatCount(value)}</text><text x="324" y="${y(value) + 3}" text-anchor="end">${i ? multiple(value) : fillRatio(value, game.capacity)}</text>`).join('') +
        `<path d="${path} L${x(points[points.length-1].x)},101 L${x(points[0].x)},101 Z" fill="url(#fill-${i})"/><path d="${path}" fill="none" stroke="${color}" stroke-width="${i ? 1.2 : 1.7}" stroke-opacity="${i ? .7 : 1}" stroke-linejoin="round"/>${overlays}<circle cx="${x(points[points.length-1].x)}" cy="${y(points[points.length-1].score)}" r="2.5" fill="${color}"/>` +
        xTicks.map((tick, j) => `<text x="${x(tick)}" y="119" text-anchor="${j === 0 ? 'start' : j === xTicks.length - 1 ? 'end' : 'middle'}">${formatCount(tick)}</text>`).join('');
      const showHover = (clientX: number) => {
        const transform = svg.getScreenCTM();
        if (!transform) return;
        const svgX = (clientX - transform.e) / transform.a;
        const offset = Math.max(0, Math.min(1, (svgX - 34) / (right - 34)));
        const position = minX + offset * (maxX - minX);
        const tooltip = panel.querySelector('.chart-tooltip')!;
        if (i) {
          const history = game.scores;
          const bite = Math.min(endX, Math.round(position));
          const interval = mealSteps(history, bite);
          const median = series!.median[bite - minX];
          tooltip.textContent = `Food #${formatCount(bite)} · Step ${formatCount(history.changes[bite][0])} · ${formatCount(interval)} ${interval === 1 ? 'step' : 'steps'} to food · ${multiple(interval)} (width + height) · Median ${median} ${median === 1 ? 'step' : 'steps'} · ${multiple(median)} (width + height)`;
          for (const { key, label } of mealLines) {
            if (key === 'median') continue;
            const value = series![key][bite - minX];
            tooltip.textContent += ` · ${label} ${Number(value.toFixed(2))} ${value === 1 ? 'step' : 'steps'} · ${multiple(value)}`;
          }
        } else {
          const actual = Math.min(endX, Math.round(position)), score = game.scores.at(actual);
          tooltip.textContent = `Step ${formatCount(actual)} · Length ${formatCount(score / 10 + initialLength)} · Board fill ${fillRatio(score / 10 + initialLength, game.capacity)} · Score ${formatCount(score)}`;
        }
      };
      svg.onpointermove = event => {
        this.hoverX[i] = event.clientX;
        showHover(event.clientX);
      };
      svg.onpointerleave = () => { this.hoverX[i] = undefined; };
      const pointer = this.hoverX[i];
      if (pointer !== undefined) showHover(pointer);
    });
  }
}
