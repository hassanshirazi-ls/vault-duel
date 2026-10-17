// Default-equivalence digest (D-312): plays 40 duels per bot (novice, greedy, expert, expert with noise) with every bond switch
// off, classic and lanes rules, and prints a hash of every action chosen. Run it on a `git archive` copy of the commit before a
// change and on the working tree after: equal lines mean the bots choose exactly as before.
//   tsx packages/ai/scripts/digest.ts
import { DEFAULT_GLOBALS, compileContent, parseContent, RAW_CONTENT } from '@vault-duel/content';
import { createEngine, cyrb128 } from '@vault-duel/engine';
import type { Globals } from '@vault-duel/engine';
import { botAction, createCollector, createExpert, createGreedy, createNoise, createNovice, noiseKey } from '../src';
import type { Bot } from '../src';

const content = compileContent(parseContent(RAW_CONTENT).data);
const configs: [string, Globals][] = [
  ['classic', DEFAULT_GLOBALS],
  ['lanes', { ...DEFAULT_GLOBALS, FLAGS: { ...DEFAULT_GLOBALS.FLAGS, LANES: true }, SICKNESS_MODE: 'monstersOnly' }],
];
for (const [cname, globals] of configs) {
  const collector = createCollector({ content, globals });
  const engine = createEngine(content, globals, { intent: collector.intentPolicy }, { events: false, log: false, trusted: true });
  for (const kind of ['novice', 'greedy', 'expert', 'noisy']) {
    let h = '';
    for (let g = 0; g < 40; g++) {
      const seed = `vault-duel:2026-11-${String((g % 28) + 1).padStart(2, '0')}:0.1.0#${Math.floor(g / 28)}`;
      const bot: Bot =
        kind === 'novice' ? createNovice(`d${g}`) : kind === 'greedy' ? createGreedy() : kind === 'expert' ? createExpert() : createExpert({ noise: createNoise(noiseKey(seed, 0, g), 0.1) });
      let s = engine.newGame(seed).state;
      while (s.result === null) {
        const mine = (s.turn & 1) === 0 || s.step === 'mulligan';
        const a = mine ? botAction(bot, collector.brain, s) : collector.act(s);
        h += JSON.stringify(a);
        s = engine.applyAction(s, a).state;
      }
      h += `|${s.result.winner}:${s.result.round}\n`;
    }
    console.log(cname, kind, cyrb128(h).map((x) => x.toString(16)).join(''));
  }
}
