/**
 * Schnelleingabe: wandelt Freitext wie
 *   "Bankdrücken 70 a 8/8/7"
 *   "Reverse butterfly\nLinks 54 a 8/8/8\nRechts 54 a 7/8/8"
 *   "Kabel-Seitheben\n6,8 a 10/10/10 pro Seite"
 *   "Klimmzüge\n7/7/6"
 * in Übungen mit Sätzen um.
 */
import type { ExcludeReason } from '../db/types';

export interface ParsedSet {
  weightKg: number;
  reps: number;
  warmup: boolean;
  excluded?: boolean;
  excludeReason?: ExcludeReason;
}
export interface ParsedExercise {
  name: string;
  side?: 'L' | 'R';
  sets: ParsedSet[];
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const REPS_SEQ = new RegExp(String.raw`(${NUM})(?:\s*\/\s*(${NUM}))+`);
const WEIGHT_REPS = new RegExp(String.raw`(${NUM})\s*(?:kg)?\s*(?:a|à|x|×|@|mal)\s*(${NUM}(?:\s*\/\s*${NUM})*)`, 'gi');

const toNum = (s: string) => Number(s.replace(',', '.'));
const repsList = (s: string) => s.split('/').map((x) => toNum(x.trim())).filter((n) => Number.isFinite(n) && n > 0);

function sidePrefix(line: string): { side?: 'L' | 'R'; rest: string } {
  const m = line.match(/^\s*(links|rechts|left|right|l|r)\s*[:\-–]?\s+(?=\d|k(?:ö|oe)rpergewicht|kg\b|bw\b)/i);
  if (!m) return { rest: line };
  const w = m[1].toLowerCase();
  return { side: w.startsWith('l') ? 'L' : 'R', rest: line.slice(m[0].length) };
}

function exclusion(line: string): Pick<ParsedSet, 'excluded' | 'excludeReason'> {
  if (/unsauber|schlampig|ohne volle rom/i.test(line)) return { excluded: true, excludeReason: 'unsauber' };
  if (/ersatz|besetzt/i.test(line)) return { excluded: true, excludeReason: 'ersatz' };
  if (/z(ä|ae)hlt nicht|nicht (werten|z(ä|ae)hlen)|keine referenz/i.test(line)) return { excluded: true, excludeReason: 'sonstiges' };
  return {};
}

function cleanName(s: string): string {
  return s
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[:\-–]+\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const isBodyweight = (line: string) => /k(ö|oe)rpergewicht|\bbw\b|\bkg\s*$/i.test(line) && !/\d+\s*kg/i.test(line);

/** Satzdaten aus einer Zeile; null wenn die Zeile keine Sätze enthält. */
function parseData(line: string): { sets: Omit<ParsedSet, 'warmup'>[]; dataStart: number } | null {
  const out: Omit<ParsedSet, 'warmup'>[] = [];
  let first = -1;
  for (const m of line.matchAll(WEIGHT_REPS)) {
    if (first < 0) first = m.index ?? 0;
    for (const r of repsList(m[2])) out.push({ weightKg: toNum(m[1]), reps: r });
  }
  if (out.length) return { sets: out, dataStart: first };

  const seq = line.match(REPS_SEQ);
  if (seq && seq.index !== undefined) {
    const before = line.slice(0, seq.index);
    const w = [...before.matchAll(new RegExp(NUM, 'g'))][0];
    const weight = w && !isBodyweight(line) ? toNum(w[0]) : 0;
    const start = w ? (w.index ?? 0) : seq.index;
    return { sets: repsList(seq[0]).map((r) => ({ weightKg: weight, reps: r })), dataStart: start };
  }
  return null;
}

export function parseTrainingText(text: string): ParsedExercise[] {
  const result: ParsedExercise[] = [];
  let current: string | null = null;

  const push = (name: string, side: 'L' | 'R' | undefined, sets: ParsedSet[]) => {
    const last = result.at(-1);
    if (last && last.name === name && last.side === side) last.sets.push(...sets);
    else result.push({ name, side, sets });
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/ /g, ' ').trim();
    if (!line) continue;
    const { side, rest } = sidePrefix(line);
    const data = parseData(rest);
    if (!data) {
      // Reine Textzeile -> möglicher Übungsname (lange Fließtext-Zeilen ignorieren)
      const n = cleanName(line);
      current = n.length >= 2 && n.length <= 60 && /\p{L}/u.test(n) ? n : null;
      continue;
    }
    const inlineName = cleanName(rest.slice(0, data.dataStart));
    const name = !side && inlineName.length >= 2 && /\p{L}{2}/u.test(inlineName) && !/^(kg|ca|je)$/i.test(inlineName) ? inlineName : current;
    if (!name) continue;
    current = name;
    const warmup = /warm-?up|aufw(ä|ae)rm/i.test(line);
    const ex = exclusion(line);
    const sets = data.sets.map((s) => ({ ...s, warmup, ...ex }));
    const both = !side && /(pro|je)\s+seite/i.test(line);
    if (both) {
      push(name, 'L', sets.map((x) => ({ ...x })));
      push(name, 'R', sets.map((x) => ({ ...x })));
    } else push(name, side, sets);
  }
  return result.filter((e) => e.sets.length);
}
