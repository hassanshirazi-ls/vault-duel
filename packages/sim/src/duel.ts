// One balance duel: a player bot on side 0 against the Collector, folded into an Aggregate (ARCHITECTURE.md §15).
// Only what the engine exposes without events: the final state (Track, appraisal counters, result) and the actions taken.
import { createCollector, createExpert, createGreedy, createNoise, createNovice, botAction, noiseKey } from '@vault-duel/ai';
import type { Bot, Collector } from '@vault-duel/ai';
import { createEngine, rerollSeed } from '@vault-duel/engine';
import type { Action, Engine, GameState, Intent } from '@vault-duel/engine';
import { bump, bumpBin, child } from './aggregate';
import type { Aggregate } from './aggregate';
import type { SimJob } from './jobs';
import type { SimContext } from './world';

/** A guard against a duel that never ends: far above any real duel's action count. It is not a balance value. */
export const ACTION_CAP = 20_000;

export type Category = Intent;

export function createBot(ctx: SimContext, job: SimJob): Bot {
  switch (job.botId) {
    case 'novice':
      return createNovice(`${rerollSeed(job.seedString, job.k)}/novice/${job.runIndex}`);
    case 'greedy':
      return createGreedy();
    case 'expert':
      return createExpert();
    case 'expert-noisy':
      return createExpert({ noise: createNoise(noiseKey(job.seedString, job.k, job.runIndex), ctx.globals.BOT_NOISE_EPSILON) });
  }
}

/** Which of his turn's actions best describes what the Collector did, in the priority order of D-095. */
function actualCategory(appraised: boolean, attacked: boolean, schemed: boolean): Category {
  if (appraised) return 'appraise';
  if (attacked) return 'attack';
  return schemed ? 'scheme' : 'guard';
}

export interface DuelPlayer {
  /** Plays the job's duel and adds its result to `into`. */
  play(job: SimJob, into: Aggregate): void;
}

export function createDuelPlayer(ctx: SimContext): DuelPlayer {
  const { content, globals } = ctx;
  const collector: Collector = createCollector({ content, globals });
  const engine: Engine = createEngine(content, globals, { intent: collector.intentPolicy }, { events: false, log: false, trusted: true });
  const kwNames: string[] = [];
  for (const k of content.keywords) kwNames[content.kwBit[k.id] as number] = k.id;
  const bins = globals.MAX_ROUNDS + 2; // rounds 0..MAX_ROUNDS, and one overflow bin that must stay empty

  return {
    play(job, into) {
      const agg = child(child(into, 'bots'), job.botId);
      bump(agg, 'games');
      try {
        const bot = createBot(ctx, job);
        let s: GameState = engine.newGame(rerollSeed(job.seedString, job.k), { twist: job.twist }).state;
        const dealt = s.inst.length;
        const played = new Set<string>();
        const kwSeen = new Set<string>();
        const kwSummons: Record<string, number> = {};
        const tally = { intents: [] as { predicted: Category; actual: Category }[] };
        let predicted: Category | null = null;
        let successesBefore = 0;
        let attacked = false;
        let schemed = false;
        let actions = 0;

        while (s.result === null) {
          if (actions >= ACTION_CAP) break;
          const mine = (s.turn & 1) === 0 || s.step === 'mulligan';
          const a: Action = mine ? botAction(bot, collector.brain, s) : collector.act(s);
          if (mine) {
            if (a.t === 'summon' || a.t === 'summonCovetous' || a.t === 'cast' || a.t === 'setTrap') {
              played.add(content.ids[(s.inst[a.c] as GameState['inst'][number]).def] as string);
            }
            if (a.t === 'summon' || a.t === 'summonCovetous') {
              const mask = engine.printedKeywords(s, a.c);
              for (let b = 0; b < kwNames.length; b++) {
                const name = kwNames[b];
                if (name !== undefined && (mask & (1 << b)) !== 0) {
                  kwSeen.add(name);
                  kwSummons[name] = (kwSummons[name] ?? 0) + 1;
                }
              }
            }
            if (a.t === 'endTurn') {
              predicted = s.collector.intent;
              successesBefore = s.appraisal.successes;
              attacked = false;
              schemed = false;
            }
          } else {
            if (a.t === 'attack') attacked = true;
            else if (a.t === 'cast' || a.t === 'setTrap') schemed = true;
          }
          s = engine.applyAction(s, a).state;
          actions++;
          if (!mine && predicted !== null && (a.t === 'endTurn' || s.result !== null)) {
            tally.intents.push({ predicted, actual: actualCategory(s.appraisal.successes > successesBefore, attacked, schemed) });
            predicted = null;
          }
        }

        bump(agg, 'actions', actions);
        if (s.result === null) {
          bump(agg, 'stuck');
          return;
        }
        const won = s.result.winner === 0;
        const round = Math.min(s.result.round, bins - 1);
        bumpBin(agg, 'rounds', bins, round);
        bump(child(agg, 'reasons'), s.result.reason);
        if (won) {
          bump(agg, 'wins');
          bumpBin(agg, 'winRounds', bins, round);
          bump(agg, 'graftsInWins', s.track.grafts);
        }
        bump(agg, 'graftsAll', s.track.grafts);
        bump(agg, 'appraisalAttempts', s.appraisal.attempts);
        bump(agg, 'appraisalSuccesses', s.appraisal.successes);
        if (s.track.unpriced) bump(agg, 'unpriced');
        if (s.track.unpriced && won) bump(agg, 'unpricedWins');

        const cards = child(agg, 'cards');
        const inDeck = new Set<string>();
        for (let i = 0; i < dealt; i++) {
          const inst = s.inst[i] as GameState['inst'][number];
          if (inst.owner === 0) inDeck.add(content.ids[inst.def] as string);
        }
        for (const id of inDeck) {
          const c = child(cards, id);
          bump(c, 'deck');
          if (won) bump(c, 'deckWins');
        }
        for (const id of played) {
          const c = child(cards, id);
          bump(c, 'played');
          if (won) bump(c, 'playedWins');
        }
        const keywords = child(agg, 'keywords');
        for (const name of kwSeen) {
          const c = child(keywords, name);
          bump(c, 'games');
          bump(c, 'summons', kwSummons[name] as number);
          if (won) bump(c, 'gamesWon');
        }
        const intent = child(agg, 'intent');
        for (const t of tally.intents) {
          bump(intent, 'total');
          if (t.predicted === t.actual) bump(intent, 'hit');
          bump(child(child(intent, 'matrix'), t.predicted), t.actual);
        }
      } catch (error) {
        bump(agg, 'crashed');
        const message = error instanceof Error ? error.message : String(error);
        bump(child(agg, 'errors'), message.slice(0, 200));
      }
    },
  };
}
