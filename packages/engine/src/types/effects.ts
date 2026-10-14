// ARCHITECTURE.md §9.1.
export type Num = number | `$${string}` | `-$${string}`;
export type Who = 'self' | 'opponent';
export type Duration = 'permanent' | 'thisTurn' | 'untilEndOfYourNextTurn' | 'untilYourNextTurn';

export type Cond =
  | { faceUp: true }
  | { powerLte: Num }
  | { powerGte: Num }
  | { type: 'monster' }
  | { relic: true }
  | { chimera: true }
  | { onBoard: true }
  | { directAttack: boolean }
  | { graftedThisTurn: true }
  | { element: string }
  | { kind: string }
  | { keyword: string }
  | { all: readonly Cond[] }
  | { any: readonly Cond[] }
  | { not: Cond };

export interface TargetSpec {
  readonly side: 'ally' | 'enemy';
  readonly zone: 'board' | 'discard';
  readonly where?: Cond;
}

export type Ref = 'chosen' | 'self' | 'attacker' | 'defender' | 'destroyed' | 'destroyer' | 'grafted';

export type Effect = (
  | { op: 'draw'; who: Who; n: Num }
  | { op: 'damage'; who: Who; n: Num }
  | { op: 'heal'; who: Who; n: Num }
  | { op: 'modifyStats'; target: Ref; power?: Num; guard?: Num; duration: Duration }
  | { op: 'destroy'; target: Ref }
  | { op: 'returnToHand'; target: Ref }
  | { op: 'changePosition'; target: Ref; to: 'attack' | 'guard' }
  | { op: 'preventAppraisal'; target: Ref; duration: 'untilYourNextTurn' }
  | { op: 'cancelAttack' }
) & { readonly if?: Cond };

export type TrapTrigger = 'enemyAttack' | 'enemyDirectAttack' | 'allyDestroyed' | 'enemyGraft';

export interface SpellDef {
  readonly target?: TargetSpec;
  readonly effects: readonly Effect[];
}
export interface TrapDef {
  readonly trigger: TrapTrigger;
  readonly when?: Cond;
  readonly effects: readonly Effect[];
}
