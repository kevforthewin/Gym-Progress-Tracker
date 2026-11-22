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
  /** Übungen mit gleicher Gruppe sind im Training gegeneinander tauschbar (z. B. "Hintere Schulter"). */
  alternativeGroup?: string;
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
  /** Freie Hinweise/Historie zum Gerät. */
  notes?: string;
  /** Tatsächlich einstellbare Gewichte (kg, aufsteigend). Wenn gesetzt, springen Ziel und Stepper auf diese Werte. */
  weightSteps?: number[];
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
  /** Getauschte Übungen: Schlüssel = Plan-Einheit (pde-IDs), Wert = verwendete Station(en). */
  swaps?: Record<string, string[]>;
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
  /** Satz zählt nicht fürs Ziel/Charts (bleibt aber in der Historie und im Volumen). */
  excluded?: boolean;
  excludeReason?: ExcludeReason;
  createdAt: number;
}

export type ExcludeReason = 'unsauber' | 'ersatz' | 'sonstiges';

export interface BodyweightEntry {
  id: string;
  date: string; // ISO yyyy-mm-dd
  weightKg: number;
  createdAt: number;
}

export interface CardioEntry {
  id: string;
  date: string; // ISO yyyy-mm-dd
  kind: string; // z. B. "Laufband", "Zone 2"
  durationMin: number;
  distanceKm?: number;
  avgHr?: number;
  gymId?: string;
  note?: string;
  createdAt: number;
}

export interface Setting {
  key: string;
  value: unknown;
}
