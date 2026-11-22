/**
 * "Trainings hinzufügen": hängt Trainings aus einer Datei an, ohne bestehende Daten zu löschen.
 *
 * Unterstützte Formate:
 *  - Trainingslog: { sessions: [{ date, gym, workout_type, exercises: [{ exercise, side?, sets: [{ weight_kg, reps, side?, warmup? }] }] }] }
 *    (auch als Array oder einzelnes Session-Objekt; deutsche Feldnamen wie datum/studio/uebung/gewicht/wdh gehen auch)
 *  - App-Backup (format "gym-progress-tracker"): nur fehlende Datensätze werden ergänzt.
 */
import { ALL_TABLES, db, newId } from './schema';
import { BACKUP_FORMAT, validateBackup } from './backup';
import { getSetting, setSetting } from './repositories/settings';
import type { Exercise, Gym, PlanDay, Session, SetEntry, Station } from './types';

export interface ImportSet {
  weightKg: number;
  reps: number;
  warmup: boolean;
}
export interface ImportExercise {
  name: string;
  side?: 'L' | 'R';
  sets: ImportSet[];
}
export interface ImportSession {
  key: string;
  date?: string; // ISO yyyy-mm-dd
  gymName: string;
  workoutType?: string;
  exercises: ImportExercise[];
}

/** Vergleichsschlüssel: Kleinbuchstaben, nur Buchstaben/Ziffern. */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, '');

export const SIDE_LABEL = { L: 'links', R: 'rechts' } as const;
export const exerciseLabel = (e: { name: string; side?: 'L' | 'R' }) =>
  e.side ? `${e.name} (${SIDE_LABEL[e.side]})` : e.name;

const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return undefined;
};
const toNum = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.').replace(/kg$/i, '').trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
const toSide = (v: unknown): 'L' | 'R' | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (s === 'l' || s.startsWith('link') || s === 'left') return 'L';
  if (s === 'r' || s.startsWith('recht') || s === 'right') return 'R';
  return undefined;
};
export function toIsoDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return undefined;
}

export function isAppBackup(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { format?: unknown }).format === BACKUP_FORMAT;
}

/** Liest ein Trainingslog in ein einheitliches Format. Wirft bei unbrauchbaren Dateien. */
export function parseSessionsFile(data: unknown): ImportSession[] {
  let list: unknown[];
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object' && Array.isArray((data as { sessions?: unknown }).sessions))
    list = (data as { sessions: unknown[] }).sessions;
  else if (data && typeof data === 'object' && 'exercises' in data) list = [data];
  else throw new Error('Keine Trainings gefunden. Erwartet wird ein Objekt mit "sessions".');

  const out: ImportSession[] = [];
  list.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') return;
    const s = raw as Record<string, unknown>;
    const gymName = String(pick(s, 'gym', 'studio', 'Studio') ?? '').trim();
    const exRaw = pick(s, 'exercises', 'uebungen', 'übungen');
    if (!gymName || !Array.isArray(exRaw)) return;

    const exercises: ImportExercise[] = [];
    for (const er of exRaw) {
      if (!er || typeof er !== 'object') continue;
      const e = er as Record<string, unknown>;
      if (e.counts_as_reference === false) continue;
      const name = String(pick(e, 'exercise', 'name', 'uebung', 'übung') ?? '').trim();
      const setsRaw = e.sets;
      if (!name || !Array.isArray(setsRaw)) continue;
      const exSide = toSide(e.side);
      const bySide = new Map<string, ImportExercise>();
      for (const sr of setsRaw) {
        if (!sr || typeof sr !== 'object') continue;
        const st = sr as Record<string, unknown>;
        const reps = toNum(pick(st, 'reps', 'wdh', 'wiederholungen'));
        if (reps === undefined || reps <= 0) continue;
        const weightKg = toNum(pick(st, 'weight_kg', 'weight', 'kg', 'gewicht')) ?? 0;
        const side = toSide(st.side) ?? exSide;
        const k = side ?? '-';
        if (!bySide.has(k)) bySide.set(k, { name, side, sets: [] });
        bySide.get(k)!.sets.push({ weightKg, reps, warmup: st.warmup === true || st.aufwaermen === true });
      }
      exercises.push(...bySide.values());
    }
    if (!exercises.length) return;
    const wt = pick(s, 'workout_type', 'split', 'type', 'tag');
    out.push({
      key: `s${i}`,
      date: toIsoDate(pick(s, 'date', 'datum')),
      gymName,
      workoutType: typeof wt === 'string' ? wt : undefined,
      exercises,
    });
  });
  if (!out.length) throw new Error('Die Datei enthält keine importierbaren Trainings.');
  return out;
}

// ---------------------------------------------------------------------------
// Analyse: was lässt sich automatisch zuordnen?

export type AliasMap = Record<string, string>; // `${gymId}|${norm(label)}` -> stationId

export interface GymMatch {
  name: string;
  gymId?: string;
}
export interface ExerciseMatch {
  gymName: string;
  label: string;
  stationId?: string;
  allZeroWeight: boolean;
}
export interface SessionPreview {
  key: string;
  date: string;
  gymName: string;
  planDayId?: string;
  duplicate: boolean;
  setCount: number;
}
export interface ImportAnalysis {
  gyms: GymMatch[];
  exercises: ExerciseMatch[];
  sessions: SessionPreview[];
}

export const exKey = (gymName: string, label: string) => `${norm(gymName)}|${norm(label)}`;

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const isoToTs = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 18).getTime();
};
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString();

function matchStation(stations: Station[], exercises: Map<string, Exercise>, label: string, aliases: AliasMap, gymId: string) {
  const n = norm(label);
  const alias = aliases[`${gymId}|${n}`];
  if (alias && stations.some((s) => s.id === alias)) return alias;
  return (
    stations.find((s) => norm(s.name) === n)?.id ??
    stations.find((s) => norm(exercises.get(s.exerciseId)?.name ?? '') === n)?.id
  );
}

async function findPlanDay(workoutType: string | undefined, days: PlanDay[], activePlanId?: string) {
  if (!workoutType) return undefined;
  const n = norm(workoutType);
  const hits = days.filter((d) => norm(d.name) === n);
  return (hits.find((d) => d.planId === activePlanId) ?? hits[0])?.id;
}

export async function analyzeImport(sessions: ImportSession[]): Promise<ImportAnalysis> {
  const [gyms, stations, exercises, days, existing, aliases, activePlanId] = await Promise.all([
    db.gyms.toArray(),
    db.stations.toArray(),
    db.exercises.toArray(),
    db.planDays.toArray(),
    db.sessions.toArray(),
    getSetting('importAliases'),
    getSetting('activePlanId'),
  ]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  const gymMatches = new Map<string, GymMatch>();
  for (const s of sessions) {
    const k = norm(s.gymName);
    if (!gymMatches.has(k)) gymMatches.set(k, { name: s.gymName, gymId: gyms.find((g) => norm(g.name) === k)?.id });
  }

  const exMatches = new Map<string, ExerciseMatch>();
  for (const s of sessions) {
    const gymId = gymMatches.get(norm(s.gymName))?.gymId;
    const gymStations = gymId ? stations.filter((st) => st.gymId === gymId) : [];
    for (const e of s.exercises) {
      const label = exerciseLabel(e);
      const k = exKey(s.gymName, label);
      const prev = exMatches.get(k);
      const zero = e.sets.every((x) => x.weightKg === 0);
      if (prev) {
        prev.allZeroWeight = prev.allZeroWeight && zero;
        continue;
      }
      exMatches.set(k, {
        gymName: s.gymName,
        label,
        stationId: gymId ? matchStation(gymStations, exMap, label, aliases ?? {}, gymId) : undefined,
        allZeroWeight: zero,
      });
    }
  }

  const previews: SessionPreview[] = [];
  for (const s of sessions) {
    const date = s.date ?? todayIso();
    const gymId = gymMatches.get(norm(s.gymName))?.gymId;
    const planDayId = await findPlanDay(s.workoutType, days, activePlanId);
    const t = isoToTs(date);
    const duplicate =
      !!gymId &&
      existing.some((x) => x.gymId === gymId && sameDay(x.startedAt, t) && (x.planDayId ?? '') === (planDayId ?? ''));
    previews.push({
      key: s.key,
      date,
      gymName: s.gymName,
      planDayId,
      duplicate,
      setCount: s.exercises.reduce((a, e) => a + e.sets.length, 0),
    });
  }

  return { gyms: [...gymMatches.values()], exercises: [...exMatches.values()], sessions: previews };
}

// ---------------------------------------------------------------------------
// Übernehmen

export type ExerciseChoice = { kind: 'station'; stationId: string } | { kind: 'new' } | { kind: 'skip' };

export interface ImportDecisions {
  /** norm(gymName) -> gymId oder 'new' */
  gyms: Record<string, string>;
  /** exKey -> Auswahl */
  exercises: Record<string, ExerciseChoice>;
  /** session.key -> { include, date } */
  sessions: Record<string, { include: boolean; date: string; planDayId?: string }>;
}

export interface ImportResult {
  sessions: number;
  sets: number;
  newGyms: number;
  newStations: number;
}

export async function applyImport(sessions: ImportSession[], analysis: ImportAnalysis, d: ImportDecisions): Promise<ImportResult> {
  const result: ImportResult = { sessions: 0, sets: 0, newGyms: 0, newStations: 0 };
  const now = Date.now();

  await db.transaction('rw', [db.gyms, db.exercises, db.stations, db.sessions, db.sets, db.settings], async () => {
    // Gyms
    const gymIds = new Map<string, string>();
    for (const g of analysis.gyms) {
      const k = norm(g.name);
      const choice = d.gyms[k] ?? g.gymId ?? 'new';
      if (choice === 'new') {
        const gym: Gym = { id: newId(), name: g.name.trim(), archived: false, createdAt: now };
        await db.gyms.add(gym);
        gymIds.set(k, gym.id);
        result.newGyms++;
      } else gymIds.set(k, choice);
    }

    // Übungen/Geräte
    const allExercises = await db.exercises.toArray();
    const stationIds = new Map<string, string | null>();
    const aliases: AliasMap = { ...((await getSetting('importAliases')) ?? {}) };
    for (const e of analysis.exercises) {
      const k = exKey(e.gymName, e.label);
      const choice: ExerciseChoice = d.exercises[k] ?? (e.stationId ? { kind: 'station', stationId: e.stationId } : { kind: 'new' });
      const gymId = gymIds.get(norm(e.gymName))!;
      if (choice.kind === 'skip') {
        stationIds.set(k, null);
      } else if (choice.kind === 'station') {
        stationIds.set(k, choice.stationId);
        aliases[`${gymId}|${norm(e.label)}`] = choice.stationId;
      } else {
        let ex = allExercises.find((x) => norm(x.name) === norm(e.label));
        if (!ex) {
          ex = { id: newId(), name: e.label.trim(), type: e.allZeroWeight ? 'bodyweight' : 'weight_reps', createdAt: now };
          await db.exercises.add(ex);
          allExercises.push(ex);
        }
        const st: Station = { id: newId(), gymId, exerciseId: ex.id, name: e.label.trim(), weightIncrement: 2.5, createdAt: now };
        await db.stations.add(st);
        stationIds.set(k, st.id);
        aliases[`${gymId}|${norm(e.label)}`] = st.id;
        result.newStations++;
      }
    }
    await setSetting('importAliases', aliases);

    // Trainings
    const stationById = new Map((await db.stations.toArray()).map((s) => [s.id, s]));
    for (const s of sessions) {
      const dec = d.sessions[s.key];
      if (!dec?.include) continue;
      const gymId = gymIds.get(norm(s.gymName))!;
      const t = isoToTs(dec.date);
      const session: Session = { id: newId(), gymId, startedAt: t, finishedAt: t + 90 * 60_000 };
      if (dec.planDayId) session.planDayId = dec.planDayId;
      const sets: SetEntry[] = [];
      let n = 0;
      for (const e of s.exercises) {
        const sid = stationIds.get(exKey(s.gymName, exerciseLabel(e)));
        const st = sid ? stationById.get(sid) : undefined;
        if (!st) continue;
        const already = sets.filter((x) => x.stationId === st.id).length;
        e.sets.forEach((x, i) =>
          sets.push({
            id: newId(),
            sessionId: session.id,
            stationId: st.id,
            exerciseId: st.exerciseId,
            setIndex: already + i,
            weightKg: x.weightKg,
            reps: x.reps,
            isWarmup: x.warmup,
            createdAt: t + n++ * 60_000,
          }),
        );
      }
      if (!sets.length) continue;
      await db.sessions.add(session);
      await db.sets.bulkAdd(sets);
      result.sessions++;
      result.sets += sets.length;
    }
  });
  return result;
}

/** App-Backup ergänzend einspielen: nur Datensätze mit unbekannter ID werden hinzugefügt. */
export async function mergeAppBackup(data: unknown): Promise<number> {
  validateBackup(data);
  let added = 0;
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
      if (t === 'settings') continue;
      const rows = (data.tables[t] ?? []) as { id: string }[];
      if (!rows.length) continue;
      const existing = new Set((await db.table(t).bulkGet(rows.map((r) => r.id))).filter(Boolean).map((r: { id: string }) => r.id));
      const fresh = rows.filter((r) => !existing.has(r.id));
      if (fresh.length) await db.table(t).bulkAdd(fresh);
      added += fresh.length;
    }
  });
  return added;
}
