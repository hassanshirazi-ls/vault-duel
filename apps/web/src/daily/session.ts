// Save and resume (D-108, D-191). The record is the smallest durable thing: the seed, the content identity and the
// action log. Resuming replays it through the engine; any mismatch or illegal action means "restart with a notice".
import type { Action, GameState } from '@vault-duel/engine';
import { getJson } from '../persistence/storage';
import type { KV } from '../persistence/storage';
import type { Runtime } from '../duel/runtime';
import { seedOf } from '../duel/runtime';
import type { DailySetup } from '@vault-duel/ai';

export interface SessionRecord {
  readonly v: 1;
  readonly date: string;
  readonly seedString: string;
  readonly k: number;
  readonly twist: number;
  readonly contentVersion: string;
  /** `state.cfg` of the game the actions were recorded under (D-191) */
  readonly cfg: string;
  readonly actions: readonly Action[];
}

export const sessionKey = (date: string): string => `vd:session:${date}`;

export function recordFor(setup: DailySetup, contentVersion: string, cfg: string, actions: readonly Action[]): SessionRecord {
  return { v: 1, date: setup.date, seedString: setup.seedString, k: setup.k, twist: setup.twist, contentVersion, cfg, actions };
}

export function saveSession(kv: KV, record: SessionRecord): boolean {
  return kv.set(sessionKey(record.date), JSON.stringify(record));
}

export function clearSession(kv: KV, date: string): void {
  kv.remove(sessionKey(date));
}

export function loadSession(kv: KV, date: string): SessionRecord | null {
  const v = getJson(kv, sessionKey(date));
  if (typeof v !== 'object' || v === null) return null;
  const r = v as Partial<SessionRecord>;
  const ok =
    r.v === 1 && r.date === date && typeof r.seedString === 'string' && typeof r.k === 'number' &&
    typeof r.twist === 'number' && typeof r.contentVersion === 'string' && typeof r.cfg === 'string' && Array.isArray(r.actions);
  return ok ? (r as SessionRecord) : null;
}

export type Resume = { readonly ok: true; readonly state: GameState } | { readonly ok: false; readonly reason: string };

export function resumeSession(rt: Runtime, setup: DailySetup, record: SessionRecord): Resume {
  const { globals } = rt.ctx;
  if (record.seedString !== setup.seedString || record.k !== setup.k) return { ok: false, reason: 'the day changed' };
  if (record.contentVersion !== globals.CONTENT_VERSION) return { ok: false, reason: 'content version changed' };
  try {
    const state = rt.engine.replay(seedOf(setup), record.actions, { twist: record.twist, cfg: record.cfg });
    return { ok: true, state };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
