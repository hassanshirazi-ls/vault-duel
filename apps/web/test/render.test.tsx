import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Action } from '@vault-duel/engine';
import { App } from '../src/ui/App';
import { StoreContext } from '../src/ui/context';
import { makeStore, simplePick, started } from './helpers';

type Harness = Awaited<ReturnType<typeof started>>;

// Server rendering reads zustand's initial state; point it at the live state so each render shows the current screen.
const html = (h: Harness): string =>
  renderToString(
    <StoreContext.Provider value={{ ...h.store, getInitialState: h.store.getState }}>
      <App />
    </StoreContext.Provider>,
  );

describe('screens render (server-side smoke)', () => {
  it('renders home, the duel on every step, and the result', async () => {
    const booted = makeStore('2026-10-14');
    await booted.store.getState().boot();
    const home = html(booted);
    expect(home).toContain('Enter the vault');
    expect(home).toContain('Appraisal rounds');

    const h = await started('2026-10-14');
    expect(html(h)).toContain('Keep this hand?');
    let steps = 0;
    while (h.store.getState().state?.result === null && steps < 600) {
      h.store.getState().act(simplePick(h.store.getState().legal));
      if (steps % 3 === 0) {
        const out = html(h);
        if (h.store.getState().state?.result === null) expect(out).toContain('The Collector');
      }
      steps++;
    }
    const result = html(h);
    expect(result).toContain('Bill of sale');
    expect(result).toMatch(/ACQUIRED|SEALED IN THE VAULT/);
  });

  it('renders the Graft workbench and swaps the material order through legal actions', async () => {
    let tested = false;
    for (const date of ['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19']) {
      const h = await started(date);
      for (let i = 0; i < 300 && h.store.getState().state?.result === null && !tested; i++) {
        const s = h.store.getState();
        if (s.groups?.graftBegin == null) {
          s.act(simplePick(s.legal));
          continue;
        }
        s.act(s.groups.graftBegin);
        expect(html(h)).toContain('Graft workbench');
        const pick = (): void => {
          const g = h.store.getState().groups;
          h.store.getState().act([...(g?.graftPicks.values() ?? [])][0] as Action);
        };
        pick();
        pick();
        const before = h.store.getState().state?.pending?.mats;
        expect(before).toHaveLength(2);
        expect(html(h)).toContain('Graft workbench');
        h.store.getState().graftSwap();
        expect(h.store.getState().error).toBeNull();
        expect(h.store.getState().state?.pending?.mats).toEqual([...(before ?? [])].reverse());
        tested = true;
      }
      if (tested) break;
    }
    expect(tested).toBe(true);
  });
});

describe('the main menu and the duel menu button (D-265)', () => {
  it('lists the menu entries on Home, a Menu button and Undo in the duel, and Main menu on the Result', async () => {
    const booted = makeStore('2026-10-14');
    await booted.store.getState().boot();
    booted.store.getState().closeHowTo();
    const home = html(booted);
    for (const entry of ['Daily duel', 'Enter the vault', 'Practice', 'How to play', 'Binder', 'Stats']) expect(home).toContain(entry);

    const h = await started('2026-10-14');
    h.store.getState().act(h.store.getState().groups?.keep as Action);
    const duel = html(h);
    expect(duel).toContain('aria-label="Menu"');
    expect(duel).toContain('Undo');
    h.store.getState().openMenu();
    expect(html(h)).toContain('Resume');

    const done = await started('2026-10-14');
    for (let i = 0; i < 600 && done.store.getState().state?.result === null; i++) done.store.getState().act(simplePick(done.store.getState().legal));
    expect(html(done)).toContain('Main menu');
    done.store.getState().startPractice();
    for (let i = 0; i < 600 && done.store.getState().state?.result === null; i++) done.store.getState().act(simplePick(done.store.getState().legal));
    const practice = html(done);
    expect(practice).toContain('Replay');
    expect(practice).toContain('Main menu');
  });
});

describe('How to play and feedback render', () => {
  it('shows the pages on first Home with the dialog markup, and the "?" button', async () => {
    const booted = makeStore('2026-10-14');
    await booted.store.getState().boot();
    const out = html(booted);
    expect(out).toContain('role="dialog"');
    expect(out).toContain('1 of 11: The goal');
    expect(out).toContain('aria-label="How to play"');
    booted.store.getState().closeHowTo();
    expect(html(booted)).not.toContain('role="dialog"');
  });
});

describe('menu A, the wheel and Try it (D-273, D-275)', () => {
  it('draws Home with the plates and the countdown, and the guide with the wheel, bonus and Try it', async () => {
    const booted = makeStore('2026-10-14');
    await booted.store.getState().boot();
    const guide = html(booted);
    expect(guide).toContain('Element wheel:');
    expect(guide).toContain('+2');
    expect(guide).toContain('Try it');
    booted.store.getState().closeHowTo();
    const home = html(booted);
    expect(home).toContain("Opens after today&#x27;s duel");
    expect(home).toContain('Today&#x27;s lot');
    expect(home).toContain('Next duel in');
  });
});
