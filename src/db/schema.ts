import Dexie, { type EntityTable } from 'dexie';
import type {
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
] as const;
export type TableName = (typeof ALL_TABLES)[number];
