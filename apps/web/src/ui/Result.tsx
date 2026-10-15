import { useGame } from './context';

export function Result() {
  const state = useGame((s) => s.state);
  const setup = useGame((s) => s.setup);
  const ctx = useGame((s) => s.ctx);
  if (state === null || state.result === null || setup === null || ctx === null) return null;
  const won = state.result.winner === 0;
  return (
    <main>
      <h1>{won ? 'Victory' : 'Defeat'}</h1>
      <p>{{ collectorDefeated: 'The Collector is defeated.', playerDefeated: 'You fell.', vaultSealed: 'The vault sealed.' }[state.result.reason]}</p>
      <ul>
        <li>Rounds used: {state.result.round} (par {setup.difficulty.par})</li>
        <li>Life left: {state.sides[0].life}</li>
        <li>Grafts: {state.track.grafts}</li>
      </ul>
      <h2>Objectives</h2>
      <ul>{setup.objectives.map((id) => <li key={id}>{ctx.render(ctx.objectiveText.get(id) ?? id)}</li>)}</ul>
    </main>
  );
}
