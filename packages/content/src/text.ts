// Text placeholders (ARCHITECTURE.md §3, §10.3, D-172). Card, objective, twist and keyword text may contain
// "{NAME}", which renders the number, and "{NAME|singular|plural}", which renders the number, a space and the word
// for its count. Pure and browser-safe. The validator uses parseTemplate; the display edge uses renderText with the
// Globals the engine runs on, so --set and ?set= show up in the text. Substitution is not done in compile.ts (D-120).
import type { Globals } from '@vault-duel/engine';

/** One piece of a template: plain text, a number placeholder, or a count placeholder with its two words. */
export type TemplatePiece =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'number'; readonly name: string; readonly raw: string }
  | { readonly kind: 'count'; readonly name: string; readonly singular: string; readonly plural: string; readonly raw: string };

export interface ParsedTemplate {
  readonly pieces: readonly TemplatePiece[];
  /** Placeholder names in order of first appearance, without repeats. */
  readonly names: readonly string[];
  /** Raw spans that are not valid placeholders: a bad name or form, an unclosed "{", or a stray "}". */
  readonly malformed: readonly string[];
}

// A name is capitals, digits and underscores, starting with a letter. A count form has two words of [^{}|]+.
const PLACEHOLDER = /^([A-Z][A-Z0-9_]*)(?:\|([^{}|]+)\|([^{}|]+))?$/;

/** Splits a template into pieces and reports every malformed span. Never throws. */
export function parseTemplate(text: string): ParsedTemplate {
  const pieces: TemplatePiece[] = [];
  const malformed: string[] = [];
  let plain = '';
  const flush = (): void => {
    if (plain !== '') pieces.push({ kind: 'text', value: plain });
    plain = '';
  };
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === '}') {
      malformed.push('}');
      i += 1;
      continue;
    }
    if (ch !== '{') {
      plain += ch;
      i += 1;
      continue;
    }
    const close = text.indexOf('}', i + 1);
    const open = text.indexOf('{', i + 1);
    if (close === -1 || (open !== -1 && open < close)) {
      // Unclosed: the span runs to the next "{" or to the end of the text.
      const end = open === -1 ? text.length : open;
      malformed.push(text.slice(i, end));
      i = end;
      continue;
    }
    const raw = text.slice(i, close + 1);
    const match = PLACEHOLDER.exec(text.slice(i + 1, close));
    if (match === null) {
      malformed.push(raw);
    } else {
      flush();
      const name = match[1] ?? '';
      if (match[2] === undefined) pieces.push({ kind: 'number', name, raw });
      else pieces.push({ kind: 'count', name, singular: match[2], plural: match[3] ?? '', raw });
    }
    i = close + 1;
  }
  flush();
  const names: string[] = [];
  for (const piece of pieces) {
    if (piece.kind !== 'text' && !names.includes(piece.name)) names.push(piece.name);
  }
  return { pieces, names, malformed };
}

/** Text with every placeholder removed. Its digits are the "bare numbers" of D-172 rules 4 and 5. */
export function plainText(template: ParsedTemplate): string {
  return template.pieces.map((piece) => (piece.kind === 'text' ? piece.value : '')).join('');
}

/** The value of a placeholder name: a numeric core global, or a CONTENT_NUMBERS entry (D-171). Undefined otherwise. */
export function placeholderValue(name: string, g: Globals): number | undefined {
  const core = g as unknown as Readonly<Record<string, unknown>>;
  if (Object.hasOwn(core, name)) {
    const value = core[name];
    return typeof value === 'number' ? value : undefined;
  }
  return Object.hasOwn(g.CONTENT_NUMBERS, name) ? g.CONTENT_NUMBERS[name] : undefined;
}

/**
 * Renders a template with `g`. "{NAME}" becomes the decimal number. "{NAME|card|cards}" becomes the number, a space,
 * then "card" when the number is 1 and "cards" otherwise. Throws on a malformed span or an unknown name: the validator
 * reports both before any text is rendered, so a throw here means the content was not checked.
 */
export function renderText(text: string, g: Globals): string {
  const template = parseTemplate(text);
  const bad = template.malformed[0];
  if (bad !== undefined) throw new Error(`renderText: malformed placeholder "${bad}" in "${text}"`);
  return template.pieces
    .map((piece) => {
      if (piece.kind === 'text') return piece.value;
      const value = placeholderValue(piece.name, g);
      if (value === undefined) throw new Error(`renderText: no numeric global named ${piece.name} in "${text}"`);
      if (piece.kind === 'number') return String(value);
      return `${value} ${value === 1 ? piece.singular : piece.plural}`;
    })
    .join('');
}
