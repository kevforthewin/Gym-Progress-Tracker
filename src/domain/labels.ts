import type { ExerciseType } from '../db/types';

export const EXERCISE_TYPE_LABEL: Record<ExerciseType, string> = {
  weight_reps: 'Gewicht × Wdh.',
  bodyweight: 'Körpergewicht',
  time_distance: 'Zeit / Distanz',
};
