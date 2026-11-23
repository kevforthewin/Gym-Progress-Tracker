/**
 * Apple-Health-Daten einlesen – ohne DB-Abhängigkeit.
 *  1) Kurzbefehl-Text (Zwischenablage), Zeilen wie  "steps;2026-11-22;8543"
 *  2) Health-Export (export.xml), zeilenweise über HealthExportAggregator
 */

export interface HealthDayValues {
  steps?: number;
  activeKcal?: number;
  vo2max?: number;
  restingHr?: number;
}

export interface HealthWorkout {
  externalId: string;
  date: string;
  kind: string;
  durationMin: number;
  distanceKm?: number;
  kcal?: number;
}

export interface HealthImport {
  days: Record<string, HealthDayValues>;
  weights: Record<string, number>; // date -> kg
  workouts: HealthWorkout[];
}

export const emptyHealthImport = (): HealthImport => ({ days: {}, weights: {}, workouts: [] });

// ---------------------------------------------------------------------------
// Hilfen

/** "2026-11-22", "2026-11-22 08:00:00 +0100", "22.11.2026", "22.11.26, 08:00" -> "2026-11-22" */
export function healthDate(v: string): string | undefined {
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return undefined;
}

/**
 * Zahl aus Kurzbefehl-Text (deutsches Format möglich):
 * "8.543" (Tausender) bei ganzzahligen Typen, "45,2" Dezimal, "8543 Schritte", "45.2".
 */
export function healthNumber(v: string, integer = false): number | undefined {
  let t = v.replace(/[^\d.,\-]/g, '');
  if (!t) return undefined;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (integer && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** "30", "30 min", "1800 s", "0:30:00", "1 h" -> Minuten */
export function durationMinutes(v: string): number | undefined {
  const t = v.trim().toLowerCase();
  const hms = t.match(/^(\d+):(\d{2})(?::(\d{2}))?$/);
  if (hms) return hms[3] !== undefined ? +hms[1] * 60 + +hms[2] + +hms[3] / 60 : +hms[1] + +hms[2] / 60;
  const n = healthNumber(t);
  if (n === undefined) return undefined;
  if (/\bh|std/.test(t)) return n * 60;
  if (/\bs\b|sek|sec/.test(t)) return n / 60;
  if (/min/.test(t)) return n;
  return n >= 300 ? n / 60 : n; // reine Zahl: groß = Sekunden
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------
// 1) Kurzbefehl-Text

const TYPE_ALIASES: Record<string, keyof HealthDayValues | 'weight' | 'workout'> = {
  steps: 'steps', schritte: 'steps',
  kcal: 'activeKcal', activekcal: 'activeKcal', aktivekalorien: 'activeKcal', aktiveenergie: 'activeKcal', energie: 'activeKcal',
  vo2: 'vo2max', vo2max: 'vo2max', cardiofitness: 'vo2max',
  rhr: 'restingHr', ruhepuls: 'restingHr', restinghr: 'restingHr', ruheherzfrequenz: 'restingHr',
  weight: 'weight', gewicht: 'weight', körpergewicht: 'weight',
  workout: 'workout', training: 'workout',
};

/**
 * Zeilenformat (Trennzeichen ; oder Tab):
 *   steps;DATUM;WERT   kcal;DATUM;WERT   vo2;DATUM;WERT   rhr;DATUM;WERT   weight;DATUM;KG
 *   workout;DATUM;ART;DAUER;DISTANZ_KM;KCAL
 * Mehrere Zeilen gleicher Art/Tag: Schritte & kcal werden summiert, sonst gilt der letzte Wert.
 */
export function parseShortcutText(text: string): HealthImport {
  const out = emptyHealthImport();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\s*[;\t]\s*/);
    if (parts.length < 3) continue;
    const type = TYPE_ALIASES[parts[0].toLowerCase().replace(/[^a-zäöü0-9]/g, '')];
    const date = healthDate(parts[1]);
    if (!type || !date) continue;
    if (type === 'workout') {
      const durationMin = durationMinutes(parts[3] ?? '');
      if (!durationMin) continue;
      const kind = parts[2] || 'Workout';
      out.workouts.push({
        externalId: `sc|${date}|${kind}|${Math.round(durationMin)}`,
        date,
        kind,
        durationMin: round(durationMin),
        distanceKm: parts[4] ? healthNumber(parts[4]) : undefined,
        kcal: parts[5] ? healthNumber(parts[5], true) : undefined,
      });
      continue;
    }
    const integer = type === 'steps' || type === 'activeKcal' || type === 'restingHr';
    const v = healthNumber(parts[2], integer);
    if (v === undefined || v <= 0) continue;
    if (type === 'weight') {
      out.weights[date] = round(v, 2);
      continue;
    }
    const day = (out.days[date] ??= {});
    if (type === 'steps' || type === 'activeKcal') day[type] = Math.round((day[type] ?? 0) + v);
    else day[type] = round(v, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2) Health-Export (export.xml), zeilenweise

const WORKOUT_NAMES: Record<string, string> = {
  Running: 'Laufen', Walking: 'Gehen', Cycling: 'Radfahren', Rowing: 'Rudergerät', Elliptical: 'Crosstrainer',
  StairClimbing: 'Treppensteigen', Stairs: 'Treppensteigen', Swimming: 'Schwimmen', Hiking: 'Wandern',
  HighIntensityIntervalTraining: 'HIIT', MixedCardio: 'Cardio', Yoga: 'Yoga', CoreTraining: 'Core',
  Cooldown: 'Cooldown', Dance: 'Tanzen', Boxing: 'Boxen', JumpRope: 'Seilspringen', StepTraining: 'Stepper',
};
/** Krafttraining loggst du in der App selbst – diese Workouts werden nicht als Cardio übernommen. */
const SKIP_WORKOUTS = new Set(['TraditionalStrengthTraining', 'FunctionalStrengthTraining', 'Other']);

const attrs = (line: string) => {
  const o: Record<string, string> = {};
  for (const m of line.matchAll(/(\w+)="([^"]*)"/g)) o[m[1]] = m[2];
  return o;
};

const toKm = (v: number, unit?: string) => (unit === 'mi' ? v * 1.609344 : unit === 'm' ? v / 1000 : v);
const toKcal = (v: number, unit?: string) => (unit === 'kJ' ? v / 4.184 : unit === 'Cal' ? v : v);
const toMin = (v: number, unit?: string) => (unit === 's' ? v / 60 : unit === 'h' ? v * 60 : v);

export class HealthExportAggregator {
  /** date -> source -> Summe (Schritte/kcal je Quelle; Tageswert = Maximum über Quellen, wie Health es zusammenführt) */
  private steps = new Map<string, Map<string, number>>();
  private kcal = new Map<string, Map<string, number>>();
  private last = { vo2max: new Map<string, [string, number]>(), restingHr: new Map<string, [string, number]>(), weight: new Map<string, [string, number]>() };
  private workouts: HealthWorkout[] = [];
  private current: { a: Record<string, string>; kcal?: number; km?: number; indoor?: boolean } | null = null;
  private rest = '';
  constructor(private since?: string) {}

  /** Beliebige Text-Stücke (z. B. aus einem Stream) einspeisen. */
  push(chunk: string) {
    const text = this.rest + chunk;
    const lines = text.split('\n');
    this.rest = lines.pop() ?? '';
    for (const l of lines) this.line(l);
  }

  line(raw: string) {
    const l = raw.trim();
    if (l.startsWith('<Record ')) return this.record(attrs(l));
    if (l.startsWith('<Workout ')) {
      this.current = { a: attrs(l) };
      if (l.endsWith('/>')) this.endWorkout();
      return;
    }
    if (!this.current) return;
    if (l.startsWith('<WorkoutStatistics ')) {
      const a = attrs(l);
      const sum = Number(a.sum);
      if (!Number.isFinite(sum)) return;
      if (a.type === 'HKQuantityTypeIdentifierActiveEnergyBurned') this.current.kcal = toKcal(sum, a.unit);
      else if (/Distance/.test(a.type ?? '')) this.current.km = toKm(sum, a.unit);
    } else if (l.startsWith('<MetadataEntry ') && /HKIndoorWorkout/.test(l)) {
      this.current.indoor = /value="1"/.test(l);
    } else if (l.startsWith('</Workout>')) this.endWorkout();
  }

  private record(a: Record<string, string>) {
    const date = healthDate(a.startDate ?? '');
    if (!date || (this.since && date < this.since)) return;
    const v = Number(a.value);
    if (!Number.isFinite(v)) return;
    const src = a.sourceName ?? '?';
    const add = (m: Map<string, Map<string, number>>, val: number) => {
      const d = m.get(date) ?? new Map<string, number>();
      d.set(src, (d.get(src) ?? 0) + val);
      m.set(date, d);
    };
    const setLast = (m: Map<string, [string, number]>, val: number) => {
      const prev = m.get(date);
      if (!prev || (a.startDate ?? '') >= prev[0]) m.set(date, [a.startDate ?? '', val]);
    };
    switch (a.type) {
      case 'HKQuantityTypeIdentifierStepCount':
        return add(this.steps, v);
      case 'HKQuantityTypeIdentifierActiveEnergyBurned':
        return add(this.kcal, toKcal(v, a.unit));
      case 'HKQuantityTypeIdentifierVO2Max':
        return setLast(this.last.vo2max, v);
      case 'HKQuantityTypeIdentifierRestingHeartRate':
        return setLast(this.last.restingHr, v);
      case 'HKQuantityTypeIdentifierBodyMass':
        return setLast(this.last.weight, a.unit === 'lb' ? v * 0.45359237 : v);
    }
  }

  private endWorkout() {
    const c = this.current;
    this.current = null;
    if (!c) return;
    const type = (c.a.workoutActivityType ?? '').replace('HKWorkoutActivityType', '');
    const date = healthDate(c.a.startDate ?? '');
    if (!date || SKIP_WORKOUTS.has(type) || (this.since && date < this.since)) return;
    const dur = toMin(Number(c.a.duration), c.a.durationUnit);
    if (!Number.isFinite(dur) || dur < 1) return;
    let kind = WORKOUT_NAMES[type] ?? type.replace(/([a-z])([A-Z])/g, '$1 $2');
    if (c.indoor && type === 'Running') kind = 'Laufband';
    if (c.indoor && type === 'Cycling') kind = 'Indoor-Rad';
    const km = c.km ?? (c.a.totalDistance ? toKm(Number(c.a.totalDistance), c.a.totalDistanceUnit) : undefined);
    const kcal = c.kcal ?? (c.a.totalEnergyBurned ? toKcal(Number(c.a.totalEnergyBurned), c.a.totalEnergyBurnedUnit) : undefined);
    this.workouts.push({
      externalId: `hk|${c.a.startDate}|${type}`,
      date,
      kind,
      durationMin: round(dur),
      distanceKm: km && km > 0 ? round(km, 2) : undefined,
      kcal: kcal && kcal > 0 ? Math.round(kcal) : undefined,
    });
  }

  result(): HealthImport {
    if (this.rest) this.line(this.rest), (this.rest = '');
    const out = emptyHealthImport();
    const maxOf = (m: Map<string, number>) => Math.max(...m.values());
    for (const [d, m] of this.steps) (out.days[d] ??= {}).steps = Math.round(maxOf(m));
    for (const [d, m] of this.kcal) (out.days[d] ??= {}).activeKcal = Math.round(maxOf(m));
    for (const [d, [, v]] of this.last.vo2max) (out.days[d] ??= {}).vo2max = round(v, 1);
    for (const [d, [, v]] of this.last.restingHr) (out.days[d] ??= {}).restingHr = Math.round(v);
    for (const [d, [, v]] of this.last.weight) out.weights[d] = round(v, 2);
    out.workouts = this.workouts;
    return out;
  }
}
