export type ExerciseType = 'weight_reps' | 'bodyweight' | 'time_distance';

export interface Gym {
  id: string;
  name: string;
  notes?: string;
  archived: boolean;
  createdAt: number;
}

/** Globale, abstrakte Übung, z. B. „Brustpresse". */
export interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  muscleGroup?: string;
  notes?: string;
  createdAt: number;
}

/** Konkretes Gerät einer Übung in einem bestimmten Gym. Historie hängt immer hieran. */
export interface Station {
  id: string;
  gymId: string;
  exerciseId: string;
  name: string;
  /** Kleinster Gewichtssprung am Gerät in kg (z. B. 2.5 oder 5). */
  weightIncrement: number;
  /** Startgewicht für die erste Session (kg, bei Körpergewicht = Zusatzgewicht). */
  startWeight?: number;
  /** Einstellungen wie Sitzhöhe, Polsterposition … */
  settingsNote?: string;
  createdAt: number;
}

export interface Plan {
  id: string;
  name: string;
  order: number;
  createdAt: number;
}

export interface PlanDay {
  id: string;
  planId: string;
  name: string;
  order: number;
}

export interface PlanDayExercise {
  id: string;
  planDayId: string;
  exerciseId: string;
  order: number;
  sets: number;
  repMin: number;
  repMax: number;
  targetDurationSec?: number;
  targetDistanceM?: number;
}

export interface Session {
  id: string;
  gymId: string;
  planDayId?: string;
  startedAt: number;
  finishedAt?: number;
  bodyweightKg?: number;
  notes?: string;
}

export interface SetEntry {
  id: string;
  sessionId: string;
  stationId: string;
  exerciseId: string;
  setIndex: number;
  /** Bei weight_reps: Gewicht. Bei bodyweight: Zusatzgewicht (0 = ohne). */
  weightKg?: number;
  reps?: number;
  durationSec?: number;
  distanceM?: number;
  isWarmup: boolean;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}
