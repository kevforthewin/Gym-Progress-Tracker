import Dexie, { type EntityTable } from 'dexie';
import { guessMuscleGroup } from '../domain/exerciseDefaults';
import type {
  BodyweightEntry,
  CardioEntry,
  HealthDay,
  Exercise,
  Gym,
  Plan,
  PlanDay,
  PlanDayExercise,
  Session,
  SetEntry,
  Setting,
  Station,
} from './types';

export class GymDB extends Dexie {
  gyms!: EntityTable<Gym, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  stations!: EntityTable<Station, 'id'>;
  plans!: EntityTable<Plan, 'id'>;
  planDays!: EntityTable<PlanDay, 'id'>;
  planDayExercises!: EntityTable<PlanDayExercise, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  sets!: EntityTable<SetEntry, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  bodyweights!: EntityTable<BodyweightEntry, 'id'>;
  cardio!: EntityTable<CardioEntry, 'id'>;
  health!: EntityTable<HealthDay, 'date'>;

  constructor(name = 'gym-progress-tracker') {
    super(name);
    // Neue Felder/Indizes => neue version(n) mit .upgrade() anlegen, nie alte ändern.
    this.version(1).stores({
      gyms: 'id, name',
      exercises: 'id, name',
      stations: 'id, gymId, exerciseId, [gymId+exerciseId]',
      plans: 'id, order',
      planDays: 'id, planId',
      planDayExercises: 'id, planDayId, exerciseId',
      sessions: 'id, gymId, planDayId, startedAt',
      sets: 'id, sessionId, stationId, [stationId+createdAt]',
      settings: 'key',
    });
    this.version(2)
      .stores({ bodyweights: 'id, date', cardio: 'id, date' })
      .upgrade(async (tx) => {
        // Bekannte Alternativen einmalig gruppieren (nur wenn noch keine Gruppe gesetzt ist).
        await tx
          .table('exercises')
          .toCollection()
          .modify((e: Exercise) => {
            fillExerciseDefaults(e);
          });
        // Körpergewicht aus Sessions übernehmen
        const sessions = await tx.table('sessions').toArray();
        const seen = new Set<string>();
        for (const s of sessions.sort((a, b) => b.startedAt - a.startedAt)) {
          if (!s.bodyweightKg) continue;
          const d = new Date(s.startedAt);
          const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          if (seen.has(date)) continue;
          seen.add(date);
          await tx.table('bodyweights').add({ id: newId(), date, weightKg: s.bodyweightKg, createdAt: Date.now() });
        }
      });
    this.version(3).stores({ health: 'date', cardio: 'id, date, externalId' });
  }
}

export const db = new GymDB();

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const ALL_TABLES = [
  'gyms',
  'exercises',
  'stations',
  'plans',
  'planDays',
  'planDayExercises',
  'sessions',
  'sets',
  'settings',
  'bodyweights',
  'cardio',
  'health',
] as const;

/** Vorbelegung bekannter Alternativ-Gruppen (Name ohne Seitenangabe). */
const DEFAULT_GROUPS: Record<string, string> = {
  'face pull': 'Hintere Schulter',
  'reverse butterfly': 'Hintere Schulter',
  'reverse butterfly einarmig': 'Hintere Schulter',
  'multi pec': 'Seitheben',
  'kabel-seitheben': 'Seitheben',
  'seithebemaschine matrix': 'Seitheben',
  'kurzhantel-seitheben': 'Seitheben',
  'rudern sitzend frei': 'Rudern',
  'hoist mid row': 'Rudern',
  'rudern matrix': 'Rudern',
  't-bar rudern': 'Rudern',
  'freies rudern am kabelzug': 'Rudern',
  'kabelrudern': 'Rudern',
  latzug: 'Vertikalzug',
  'latzug matrix': 'Vertikalzug',
  'latzug alte maschine': 'Vertikalzug',
  'klimmzüge': 'Vertikalzug',
  'schulterdrücken kurzhantel': 'Schulterdrücken',
  'hoist shoulder press': 'Schulterdrücken',
  'hammer strength shoulder press': 'Schulterdrücken',
  'rückenstrecker': 'Rückenstrecker',
  'rückenstrecker matrix': 'Rückenstrecker',
  'rückenstrecker alte maschine': 'Rückenstrecker',
  'hoist incline press': 'Schrägbank',
  'schrägbankdrücken langhantel': 'Schrägbank',
  'schrägbankdrücken kurzhantel 30°': 'Schrägbank',
  'pec fly': 'Brust-Fly',
  'butterfly matrix': 'Brust-Fly',
  'cable fly kabelzug': 'Brust-Fly',
  'low-to-high cable fly': 'Brust-Fly',
  'kabelcurl neuer kabelzug': 'Bizeps',
  'kabelcurl alter kabelzug': 'Bizeps',
  'hoist preacher curl': 'Bizeps',
  'kurzhantel incline curl': 'Bizeps',
  'sz-curls': 'Bizeps',
  'bizepsmaschine matrix': 'Bizeps',
  'trizepsmaschine matrix': 'Trizeps',
  'trizeps pressdown standard': 'Trizeps',
  'trizeps overhead': 'Trizeps',
  'trizeps overhead kabel': 'Trizeps',
};
/** Setzt fehlende Muskelgruppe/Alternativ-Gruppe anhand des Namens. Gibt true zurück, wenn etwas geändert wurde. */
export function fillExerciseDefaults(e: Exercise): boolean {
  let changed = false;
  if (e.alternativeGroup === undefined) {
    const g = defaultAlternativeGroup(e.name);
    if (g) (e.alternativeGroup = g), (changed = true);
  }
  if (e.muscleGroup === undefined) {
    const m = guessMuscleGroup(e.name);
    if (m) (e.muscleGroup = m), (changed = true);
  }
  return changed;
}

/** Nach Importen aufrufen. */
export async function applyExerciseDefaults() {
  await db.exercises.toCollection().modify((e) => {
    fillExerciseDefaults(e);
  });
}

export function defaultAlternativeGroup(name: string): string | undefined {
  const base = name.replace(/\s*\((links|rechts)\)\s*$/i, '').trim().toLowerCase();
  return DEFAULT_GROUPS[base];
}
export type TableName = (typeof ALL_TABLES)[number];
