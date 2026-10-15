import { deckLine } from '../view/cards';
import { useGame } from './context';

export function Home() {
  const ctx = useGame((s) => s.ctx);
  const setup = useGame((s) => s.setup);
  const source = useGame((s) => s.source);
  const start = useGame((s) => s.start);
  if (ctx === null || setup === null) return null;
  const { difficulty } = setup;
  const twist = setup.twist >= 0 ? ctx.twistText[setup.twist] : undefined;
  return (
    <main>
      <h1>Vault Duel</h1>
      <p>
        {setup.date} - difficulty {'★'.repeat(difficulty.stars)}
        {'☆'.repeat(3 - difficulty.stars)} ({difficulty.stars} of 3 stars), par round {difficulty.par}
        {source !== null && ` [${source}]`}
      </p>
      {twist !== undefined && <p>Weekly twist: {ctx.render(twist)}</p>}
      <h2>Objectives</h2>
      <ul>{setup.objectives.map((id) => <li key={id}>{ctx.render(ctx.objectiveText.get(id) ?? id)}</li>)}</ul>
      <h2>Your deck</h2>
      <ol>
        {setup.deckList.map((id, i) => {
          const c = deckLine(ctx, id);
          return (
            <li key={i}>
              {c.element !== null && `[${c.element.icon}] ${c.element.name} `}
              {c.name} ({c.type}){c.text !== null && ` - ${c.text}`}
            </li>
          );
        })}
      </ol>
      <button onClick={start}>Start duel</button>
    </main>
  );
}
