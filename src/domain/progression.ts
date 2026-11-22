import type { ExerciseType } from '../db/types';

/** Ein Arbeitssatz (ohne Warmup) – DB-unabhängig. */
export interface WorkSet {
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
}

export interface SessionHistory {
  date: number;
  sets: WorkSet[];
}

export interface Prescription {
  sets: number;
  repMin: number;
  repMax: number;
  targetDurationSec?: number;
  targetDistanceM?: number;
}

export interface TargetInput {
  type: ExerciseType;
  prescription: Prescription;
  /** Gewichtssprung des Geräts in kg. */
  increment: number;
  startWeight?: number;
  /** Vergangene Sessions an DIESER Station, älteste zuerst. */
  history: SessionHistory[];
  /** Anteil der Steigerung bei Zeit/Distanz (Default 5 %). */
  enduranceStep?: number;
}

export type TargetReason = 'first' | 'increase' | 'repeat' | 'deload';

export interface Target {
  reason: TargetReason;
  message: string;
  sets: WorkSet[];
}

export const STAGNATION_SESSIONS = 3;
export const DELOAD_FACTOR = 0.9;

const fix = (n: number) => Math.round(n * 1000) / 1000;

export function roundToIncrement(value: number, increment: number): number {
  if (increment <= 0) return fix(value);
  return fix(Math.round(value / increment) * increment);
}

export function floorToIncrement(value: number, increment: number): number {
  if (increment <= 0) return fix(value);
  return fix(Math.floor(fix(value / increment)) * increment);
}

const fmtKg = (kg: number) => `${kg.toLocaleString('de-DE')} kg`;

export function topWeight(sets: WorkSet[]): number {
  return sets.reduce((m, s) => Math.max(m, s.weightKg ?? 0), 0);
}

/** Summe der Reps aller Sätze mit dem Top-Gewicht. */
export function repsAtTop(sets: WorkSet[]): number {
  const top = topWeight(sets);
  return sets.filter((s) => (s.weightKg ?? 0) === top).reduce((a, s) => a + (s.reps ?? 0), 0);
}

function repeat<T>(n: number, f: (i: number) => T): T[] {
  return Array.from({ length: Math.max(1, n) }, (_, i) => f(i));
}

export function computeTarget(input: TargetInput): Target {
  const history = input.history.filter((h) => h.sets.length > 0);
  if (input.type === 'time_distance') return enduranceTarget(input, history);
  return strengthTarget(input, history);
}

function strengthTarget(input: TargetInput, history: SessionHistory[]): Target {
  const { prescription: p, increment, type } = input;
  const last = history.at(-1);

  if (!last) {
    const w = input.startWeight ?? (type === 'bodyweight' ? 0 : undefined);
    return {
      reason: 'first',
      message:
        w === undefined
          ? `Erstes Training: Gewicht so wählen, dass ${p.repMin}–${p.repMax} Wdh. sauber gehen.`
          : `Erstes Training: ${p.sets}×${p.repMin} mit ${fmtKg(w)}.`,
      sets: repeat(p.sets, () => ({ weightKg: w, reps: p.repMin })),
    };
  }

  const top = topWeight(last.sets);
  const topSets = last.sets.filter((s) => (s.weightKg ?? 0) === top);
  const allAtMax = topSets.length >= p.sets && topSets.every((s) => (s.reps ?? 0) >= p.repMax);

  if (allAtMax) {
    const next = fix(top + increment);
    const bw = type === 'bodyweight' && top === 0;
    return {
      reason: 'increase',
      message: bw
        ? `${p.sets}×${p.repMax} geschafft – jetzt mit ${fmtKg(next)} Zusatzgewicht.`
        : `${p.sets}×${p.repMax} geschafft – +${fmtKg(increment)} auf ${fmtKg(next)}.`,
      sets: repeat(p.sets, () => ({ weightKg: next, reps: p.repMin })),
    };
  }

  // Stagnation: letzte N Sessions gleiches Top-Gewicht und keine Verbesserung der Reps.
  const recent = history.slice(-STAGNATION_SESSIONS);
  if (recent.length === STAGNATION_SESSIONS && top > 0) {
    const sameWeight = recent.every((h) => topWeight(h.sets) === top);
    const reps = recent.map((h) => repsAtTop(h.sets));
    const noProgress = reps.every((r, i) => i === 0 || r <= reps[i - 1]);
    if (sameWeight && noProgress) {
      const deload = floorToIncrement(top * DELOAD_FACTOR, increment);
      const w = deload < top ? deload : Math.max(0, fix(top - increment));
      return {
        reason: 'deload',
        message: `${STAGNATION_SESSIONS}× keine Steigerung bei ${fmtKg(top)} – Deload auf ${fmtKg(w)} und neu aufbauen.`,
        sets: repeat(p.sets, () => ({ weightKg: w, reps: p.repMin })),
      };
    }
  }

  const sets = repeat(p.sets, (i) => {
    const prev = topSets[i]?.reps ?? topSets.at(-1)?.reps ?? p.repMin;
    return { weightKg: top, reps: Math.min(p.repMax, Math.floor(prev) + 1) };
  });
  return {
    reason: 'repeat',
    message: `Gleiches Gewicht (${fmtKg(top)}), je Satz +1 Wdh. bis ${p.repMax}.`,
    sets,
  };
}

function bestEnduranceSet(sets: WorkSet[]): WorkSet {
  return sets.reduce((best, s) => {
    const bd = best.distanceM ?? 0;
    const sd = s.distanceM ?? 0;
    if (sd !== bd) return sd > bd ? s : best;
    return (s.durationSec ?? 0) > (best.durationSec ?? 0) ? s : best;
  }, sets[0]);
}

function enduranceTarget(input: TargetInput, history: SessionHistory[]): Target {
  const { prescription: p } = input;
  const step = input.enduranceStep ?? 0.05;
  const last = history.at(-1);
  const planned: WorkSet = { durationSec: p.targetDurationSec, distanceM: p.targetDistanceM };

  if (!last) {
    return {
      reason: 'first',
      message: 'Erstes Training: Basiswert setzen.',
      sets: repeat(p.sets, () => ({ ...planned })),
    };
  }

  const best = bestEnduranceSet(last.sets);
  const hasDistance = (best.distanceM ?? 0) > 0;

  const missedPlan =
    (p.targetDistanceM !== undefined && (best.distanceM ?? 0) < p.targetDistanceM) ||
    (p.targetDistanceM === undefined &&
      p.targetDurationSec !== undefined &&
      (best.durationSec ?? 0) < p.targetDurationSec);
  if (missedPlan) {
    return {
      reason: 'repeat',
      message: 'Planziel noch nicht erreicht – gleiches Ziel nochmal.',
      sets: repeat(p.sets, () => ({ ...planned })),
    };
  }

  if (hasDistance) {
    const distanceM = Math.ceil(((best.distanceM ?? 0) * (1 + step)) / 10) * 10;
    return {
      reason: 'increase',
      message: `+${Math.round(step * 100)} % Distanz in gleicher Zeit.`,
      sets: repeat(p.sets, () => ({ durationSec: best.durationSec, distanceM })),
    };
  }
  const durationSec = Math.ceil(((best.durationSec ?? 0) * (1 + step)) / 5) * 5;
  return {
    reason: 'increase',
    message: `+${Math.round(step * 100)} % Dauer.`,
    sets: repeat(p.sets, () => ({ durationSec })),
  };
}
