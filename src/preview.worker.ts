import { AutoPlayer } from './AutoPlayer';
import { Direction, Game, Snapshot } from './Game';
import { ScoreHistory } from './ScoreHistory';

self.onmessage = ({ data }: MessageEvent<{ state: Snapshot; prefix: Direction[]; growth: boolean }>) => {
  const { state, prefix, growth } = data;
  const history = new ScoreHistory(state.score);
  history.length = state.steps + 1;
  const game = Game.restore(state, history), bot = new AutoPlayer();
  bot.prioritizeGrowth = growth;
  const directions: Direction[] = [];
  const limit = Math.min(262144, 2 * game.capacity);
  while (game.score === state.score && directions.length < limit) {
    const replay = directions.length < prefix.length;
    const move = replay ? { safe: true, direction: prefix[directions.length] } : bot.nextMove(game);
    if (!move.safe || move.direction === undefined || !game.canMove(move.direction) || !game.step(move.direction)) break;
    directions.push(move.direction);
    if (!replay) bot.advance(game);
  }
  const result = Uint8Array.from(game.score > state.score ? directions : []);
  self.postMessage(result);
};
