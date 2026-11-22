import { db, fillExerciseDefaults, newId } from '../schema';
import type { Exercise, ExerciseType } from '../types';

export async function createExercise(input: {
  name: string;
  type: ExerciseType;
  muscleGroup?: string;
  notes?: string;
}): Promise<Exercise> {
  const ex: Exercise = { id: newId(), createdAt: Date.now(), ...input, name: input.name.trim() };
  fillExerciseDefaults(ex);
  await db.exercises.add(ex);
  return ex;
}

export const updateExercise = (id: string, changes: Partial<Omit<Exercise, 'id'>>) =>
  db.exercises.update(id, changes);

/** Nur erlaubt, wenn keine Sätze existieren – sonst ginge Historie verloren. */
export async function deleteExercise(id: string): Promise<boolean> {
  const stationIds = await db.stations.where('exerciseId').equals(id).primaryKeys();
  const used = stationIds.length && (await db.sets.where('stationId').anyOf(stationIds).count()) > 0;
  if (used) return false;
  await db.transaction('rw', [db.exercises, db.stations, db.planDayExercises], async () => {
    await db.stations.bulkDelete(stationIds);
    await db.planDayExercises.where('exerciseId').equals(id).delete();
    await db.exercises.delete(id);
  });
  return true;
}

export const listExercises = () => db.exercises.orderBy('name').toArray();
