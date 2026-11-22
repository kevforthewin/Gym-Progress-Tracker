import { db, newId } from './schema';
import type { Exercise, ExerciseType, PlanDayExercise, Station } from './types';
import { setSetting } from './repositories/settings';

type Def = [name: string, type: ExerciseType, muscle: string, increment: number, sets: number, min: number, max: number];

const DAYS: Record<string, Def[]> = {
  Push: [
    ['Brustpresse', 'weight_reps', 'Brust', 5, 3, 8, 12],
    ['Schulterpresse', 'weight_reps', 'Schultern', 5, 3, 8, 12],
    ['Trizepsdrücken Kabel', 'weight_reps', 'Trizeps', 2.5, 3, 10, 15],
  ],
  Pull: [
    ['Latzug', 'weight_reps', 'Rücken', 5, 3, 8, 12],
    ['Rudern Maschine', 'weight_reps', 'Rücken', 5, 3, 8, 12],
    ['Klimmzüge', 'bodyweight', 'Rücken', 2.5, 3, 5, 10],
    ['Bizepscurls Kurzhantel', 'weight_reps', 'Bizeps', 2, 3, 8, 12],
  ],
  Legs: [
    ['Beinpresse', 'weight_reps', 'Beine', 10, 3, 8, 12],
    ['Beinbeuger', 'weight_reps', 'Beine', 5, 3, 10, 15],
    ['Wadenheben', 'weight_reps', 'Waden', 5, 3, 12, 20],
    ['Plank', 'time_distance', 'Core', 0, 2, 0, 0],
    ['Laufband', 'time_distance', 'Cardio', 0, 1, 0, 0],
  ],
};

/** Legt ein Beispiel-Gym und einen Push/Pull/Legs-Plan an. */
export async function seedExampleData() {
  const now = Date.now();
  const gymId = newId();
  const planId = newId();
  const exercises: Exercise[] = [];
  const stations: Station[] = [];
  const pdes: PlanDayExercise[] = [];

  const days = Object.entries(DAYS).map(([name, defs], order) => {
    const dayId = newId();
    defs.forEach(([exName, type, muscleGroup, inc, sets, repMin, repMax], i) => {
      const exId = newId();
      exercises.push({ id: exId, name: exName, type, muscleGroup, createdAt: now });
      stations.push({ id: newId(), gymId, exerciseId: exId, name: exName, weightIncrement: inc, createdAt: now });
      pdes.push({
        id: newId(),
        planDayId: dayId,
        exerciseId: exId,
        order: i,
        sets,
        repMin,
        repMax,
        ...(exName === 'Plank' ? { targetDurationSec: 60 } : {}),
        ...(exName === 'Laufband' ? { targetDurationSec: 1200, targetDistanceM: 3000 } : {}),
      });
    });
    return { id: dayId, planId, name, order };
  });

  await db.transaction('rw', [db.gyms, db.exercises, db.stations, db.plans, db.planDays, db.planDayExercises, db.settings], async () => {
    await db.gyms.add({ id: gymId, name: 'Mein Gym', archived: false, createdAt: now });
    await db.exercises.bulkAdd(exercises);
    await db.stations.bulkAdd(stations);
    await db.plans.add({ id: planId, name: 'Push / Pull / Legs', order: 0, createdAt: now });
    await db.planDays.bulkAdd(days);
    await db.planDayExercises.bulkAdd(pdes);
    await setSetting('activePlanId', planId);
    await setSetting('seeded', true);
  });
}
