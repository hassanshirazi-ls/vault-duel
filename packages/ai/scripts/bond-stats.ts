// Bond usage and speed check (D-312): plays N duels per bot on the live content with the given flags and prints win rate,
// median rounds, Split / Symbiosis / Graft counts per game, the expert's plan counts and duels per second.
//   tsx packages/ai/scripts/bond-stats.ts [--games 200] [--flags SPLIT,SYMBIOSIS,BOND_ACTION,LANES] [--bots expert,greedy,novice] [--weights '{"maxBondOptions":4}']
/// <reference types="node" />
import { DEFAULT_GLOBALS, compileContent, parseContent, RAW_CONTENT } from '@vault-duel/content';
import { createEngine } from '@vault-duel/engine';
import type { Globals } from '@vault-duel/engine';
import { botAction, createCollector, createExpert, createGreedy, createNovice, EXPERT_BOND_WEIGHTS } from '../src';
import type { Bot, ExpertBot, ExpertWeights } from '../src';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const games = Number(arg('games', '200'));
const flags = arg('flags', '').split(',').filter((f) => f !== '');
const bots = arg('bots', 'expert,greedy,novice').split(',');
const weights: ExpertWeights = { ...EXPERT_BOND_WEIGHTS, ...(JSON.parse(arg('weights', '{}')) as Partial<ExpertWeights>) };
const sicknessMonstersOnly = flags.includes('LANES');
const globals: Globals = {
  ...DEFAULT_GLOBALS,
  FLAGS: { ...DEFAULT_GLOBALS.FLAGS, ...Object.fromEntries(flags.map((f) => [f, true])) },
  ...(sicknessMonstersOnly ? { SICKNESS_MODE: 'monstersOnly' as const } : {}),
};
const content = compileContent(parseContent(RAW_CONTENT).data);
const collector = createCollector({ content, globals });
const engine = createEngine(content, globals, { intent: collector.intentPolicy }, { events: true, log: false, trusted: true });

for (const kind of bots) {
  let wins = 0;
  const rounds: number[] = [];
  let splits = 0;
  let symbioses = 0;
  let grafts = 0;
  let plans = 0;
  let planned = 0;
  let maxPlans = 0;
  const t0 = performance.now();
  for (let g = 0; g < games; g++) {
    const seed = `vault-duel:2026-11-${String((g % 28) + 1).padStart(2, '0')}:0.1.0#${Math.floor(g / 28)}`;
    const bot: Bot = kind === 'expert' ? createExpert({ weights }) : kind === 'greedy' ? createGreedy() : createNovice(`stats${g}`);
    let s = engine.newGame(seed).state;
    while (s.result === null) {
      const mine = (s.turn & 1) === 0 || s.step === 'mulligan';
      const res = engine.applyAction(s, mine ? botAction(bot, collector.brain, s) : collector.act(s));
      for (const e of res.events) {
        if (e.e === 'Split') splits++;
        else if (e.e === 'Bonded') symbioses++;
        else if (e.e === 'Grafted') grafts++;
      }
      s = res.state;
    }
    if (s.result.winner === 0) wins++;
    rounds.push(s.result.round);
    if (kind === 'expert') {
      const st = (bot as ExpertBot).stats;
      plans += st.totalPlans;
      planned += st.planned;
      maxPlans = Math.max(maxPlans, st.maxPlans);
    }
  }
  const secs = (performance.now() - t0) / 1000;
  rounds.sort((a, b) => a - b);
  const per = (n: number): string => (n / games).toFixed(2);
  const extra = kind === 'expert' ? ` plans/turn ${(plans / Math.max(1, planned)).toFixed(0)} max ${maxPlans}` : '';
  console.log(
    `${kind.padEnd(7)} win ${(wins / games).toFixed(3)} medianRounds ${rounds[games >> 1]} split ${per(splits)} symbiose ${per(symbioses)} graft ${per(grafts)} ${(games / secs).toFixed(1)} duels/s${extra}`,
  );
}
