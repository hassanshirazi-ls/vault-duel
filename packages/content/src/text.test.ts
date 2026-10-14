// Text placeholders (D-172): the parser and renderer on declared strings and engine fixture globals. The live texts
// are checked by content:check (rules) and by a one-off render comparison in the change that migrated them, so no
// test here pins a live string or a DEFAULT_GLOBALS value (D-168).
import { describe, expect, it } from 'vitest';
import { TEST_GLOBALS, withGlobals } from '@vault-duel/engine/test-utils/globals';
import { parseTemplate, renderText } from './text';

const G = TEST_GLOBALS;

describe('parseTemplate', () => {
  it('returns plain text as one piece with no names', () => {
    const parsed = parseTemplate('Draw a card.');
    expect(parsed.pieces).toEqual([{ kind: 'text', value: 'Draw a card.' }]);
    expect(parsed.names).toEqual([]);
    expect(parsed.malformed).toEqual([]);
  });

  it('reads number and count placeholders, and lists each name once', () => {
    const parsed = parseTemplate('Draw {SCRYING_DRAW|card|cards}, then {SCRYING_DRAW}.');
    expect(parsed.names).toEqual(['SCRYING_DRAW']);
    expect(parsed.pieces.map((piece) => piece.kind)).toEqual(['text', 'count', 'text', 'number', 'text']);
    expect(parsed.malformed).toEqual([]);
  });

  it('reports malformed spans: a lowercase name, a count form without its plural, spaces, and stray braces', () => {
    expect(parseTemplate('{Unmake}').malformed).toEqual(['{Unmake}']);
    expect(parseTemplate('{NAME|card}').malformed).toEqual(['{NAME|card}']);
    expect(parseTemplate('{ NAME }').malformed).toEqual(['{ NAME }']);
    expect(parseTemplate('a } b').malformed).toEqual(['}']);
  });

  it('reports an unclosed "{" up to the next "{", and keeps the valid placeholder after it', () => {
    const parsed = parseTemplate('{A{B}');
    expect(parsed.malformed).toEqual(['{A']);
    expect(parsed.names).toEqual(['B']);
  });
});

describe('renderText', () => {
  it('renders a number placeholder as a decimal integer', () => {
    expect(renderText('Power {UNMAKE_MAX_POWER} or less.', G)).toBe(`Power ${G.CONTENT_NUMBERS['UNMAKE_MAX_POWER']} or less.`);
    expect(renderText('{MAX_ROUNDS}', G)).toBe(String(G.MAX_ROUNDS));
  });

  it('renders a count placeholder with the singular word for 1 and the plural otherwise', () => {
    const one = withGlobals({ CONTENT_NUMBERS: { SCRYING_DRAW: 1 } });
    const many = withGlobals({ CONTENT_NUMBERS: { SCRYING_DRAW: 3 } });
    expect(renderText('Draw {SCRYING_DRAW|card|cards}.', one)).toBe('Draw 1 card.');
    expect(renderText('Draw {SCRYING_DRAW|card|cards}.', many)).toBe('Draw 3 cards.');
  });

  it('shows an override of a content number, because the text is rendered with the run\'s globals', () => {
    const over = withGlobals({ CONTENT_NUMBERS: { UNMAKE_MAX_POWER: 9 } });
    expect(renderText('{UNMAKE_MAX_POWER}', over)).toBe('9');
  });

  it('throws on a malformed span or an unknown name, because the validator reports both first', () => {
    expect(() => renderText('{Unmake}', G)).toThrow('malformed placeholder');
    expect(() => renderText('{NO_SUCH_NAME}', G)).toThrow('no numeric global named NO_SUCH_NAME');
  });
});
