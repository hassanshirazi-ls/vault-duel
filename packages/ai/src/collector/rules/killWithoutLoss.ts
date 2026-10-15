// Attack rule 2: "Destroy your highest-Power monster he can beat without losing his attacker" (D-092). Candidates are
// attacks his preview says he wins without losing the attacker. Within a tier, by
// target Power, then attackers in D-090 order (so the strongest attacker that can kill takes the kill, D-218). With
// `allowTrades` (Agitated, D-081) an even trade (both destroyed) against a target with Power at least his attacker's
// is also accepted. Ranking: clean kills, then trades, then Ward strips (D-218).
import { attackInfos, byAttacker, byTargetSlot } from '../attacks';
import type { AttackInfo } from '../attacks';
import type { AttackRule } from './context';

export const killWithoutLoss: AttackRule = ({ view, ai }) => {
  const trades = ai.params.killWithoutLoss.allowTrades;
  if (trades === undefined) throw new Error('collector.json › ai › params.killWithoutLoss.allowTrades is missing');
  const ranked: { info: AttackInfo; tier: number; power: number }[] = [];
  for (const info of attackInfos(view)) {
    const { est, foe } = info;
    if (foe === null || foe.faceDown || !est.known) continue;
    let tier = -1;
    if (!est.losesAttacker && est.destroysDefender) tier = 0;
    else if (trades && est.losesAttacker && est.destroysDefender && foe.power >= info.attacker.power) tier = 1;
    else if (!est.losesAttacker && est.stripsWard) tier = 2;
    if (tier >= 0) ranked.push({ info, tier, power: foe.power });
  }
  const order = byAttacker(ai.tieBreak);
  ranked.sort((a, b) => a.tier - b.tier || b.power - a.power || order(a.info, b.info) || byTargetSlot(a.info, b.info));
  return ranked.map((r) => r.info.choice);
};
