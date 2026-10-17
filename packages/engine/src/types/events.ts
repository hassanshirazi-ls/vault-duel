// ARCHITECTURE.md §7.
import type { DefIdx, ElemIdx, KwMask } from './content';
import type { Duration } from './effects';
import type { GraftStage, Iid, Intent, Mood, Pos, Result, Side } from './state';

export type GameEvent =
  | { e: 'GameStarted'; seed: string }
  | { e: 'HandDealt'; side: Side; cards: readonly Iid[] }
  | { e: 'Redrawn'; returned: readonly Iid[]; drawn: readonly Iid[] }
  | { e: 'TurnStarted'; turn: number; round: number; side: Side }
  | { e: 'CardDrawn'; side: Side; iid: Iid; byEffect: boolean }
  | { e: 'DrawSkipped'; side: Side; reason: 'handFull' | 'deckEmpty' }
  | { e: 'IntentSet'; intent: Intent }
  | { e: 'MoodChanged'; from: Mood; to: Mood }
  | { e: 'AppraisalAttempt'; round: number }
  | { e: 'Appraised'; iid: Iid; fromSlot: number; to: 'board' | 'vault'; toSlot: number; sym?: Iid }
  | { e: 'AppraisalFailed'; round: number; reason: 'noTarget' }
  | { e: 'Repositioned'; iid: Iid; pos: Pos }
  | { e: 'LaneMoved'; iid: Iid; from: number; to: number; swapped: Iid | -1 }
  | { e: 'Revealed'; iid: Iid; side: Side }
  | { e: 'Ambushed'; iid: Iid; p: number } // D-338: a face-down monster flipped to attack, +p Power until the end of the turn
  | { e: 'Summoned'; side: Side; iid: Iid; slot: number; pos: Pos; faceDown: boolean }
  | { e: 'CovetousSummoned'; iid: Iid; sacrificed: Iid; slot: number }
  | { e: 'Sacrificed'; iid: Iid; reason: 'graft' | 'covetous'; from: 'hand' | 'board' | 'vault' }
  | { e: 'GraftStarted' }
  | { e: 'GraftStep'; stage: GraftStage; mats: readonly Iid[] }
  | { e: 'GraftCancelled' }
  | {
      e: 'Grafted';
      side: Side;
      iid: Iid;
      family: DefIdx;
      element: ElemIdx;
      materials: readonly Iid[];
      kw: KwMask;
      ascended: boolean;
      unstable: boolean;
      slot: number;
      pos: Pos;
    }
  | { e: 'Split'; side: Side; iid: Iid; parts: readonly Iid[]; slots: readonly number[]; pos: Pos } // slots[i] = -1: part went to the hand (D-307)
  | { e: 'Bonded'; side: Side; host: Iid; symbiote: Iid; kw: KwMask; guard: number } // kw/guard = the host's after (D-308)
  | { e: 'SymbioteEmerged'; side: Side; iid: Iid; host: Iid; slot: number; cause: 'destroyed' | 'returned' } // D-308
  | { e: 'SpellCast'; side: Side; iid: Iid; target: Iid | -1 }
  | { e: 'TrapSet'; side: Side; iid: Iid; slot: number }
  | { e: 'TrapTriggered'; side: Side; iid: Iid; slot: number }
  | { e: 'AttackDeclared'; attacker: Iid; target: Iid | -1 }
  | { e: 'AttackCancelled'; attacker: Iid; by: Iid }
  | {
      e: 'CombatResolved';
      attacker: Iid;
      defender: Iid;
      aP: number;
      dStat: number;
      advantage: boolean;
      pierce: boolean;
      brittle: boolean;
      destroyed: readonly Iid[];
    }
  | { e: 'Damage'; side: Side; amount: number; source: Iid | -1; lifeAfter: number }
  | { e: 'LifeGained'; side: Side; amount: number; source: Iid; lifeAfter: number }
  | { e: 'StatsModified'; iid: Iid; p: number; g: number; duration: Duration; source: Iid }
  | { e: 'PositionChanged'; iid: Iid; pos: Pos; source: Iid }
  | { e: 'WardBroken'; iid: Iid }
  | { e: 'Destroyed'; iid: Iid; side: Side; cause: 'combat' | 'effect' | 'unstable'; by: Iid | -1 }
  | { e: 'ReturnedToHand'; iid: Iid; side: Side; from: 'board' | 'discard'; source: Iid }
  | { e: 'ShroudApplied'; iid: Iid; until: number }
  | { e: 'ShroudExpired'; iid: Iid }
  | { e: 'ModifierExpired'; iid: Iid }
  | { e: 'UnstableExpired'; iid: Iid }
  | { e: 'TurnEnded'; turn: number }
  | { e: 'VaultSealed' }
  | { e: 'GameOver'; result: Result };
