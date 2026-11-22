import { describe, expect, it } from 'vitest';
import { groupPlanUnits, groupStations } from './units';
import type { Exercise, PlanDayExercise, Station } from '../../db/types';

const ex = (id: string, name: string): Exercise => ({ id, name, type: 'weight_reps', createdAt: 0 });
const pde = (id: string, exerciseId: string, order: number): PlanDayExercise => ({ id, planDayId: 'd', exerciseId, order, sets: 3, repMin: 8, repMax: 12 });

describe('units', () => {
  const exercises = new Map([ex('b', 'Bankdrücken'), ex('r', 'Kabel-Seitheben (rechts)'), ex('l', 'Kabel-Seitheben (links)')].map((e) => [e.id, e]));
  it('paart links/rechts, links zuerst', () => {
    const u = groupPlanUnits([pde('1', 'b', 0), pde('2', 'r', 1), pde('3', 'l', 2)], exercises);
    expect(u.map((x) => [x.base, x.pdes.map((p) => p.exerciseId)])).toEqual([
      ['Bankdrücken', ['b']],
      ['Kabel-Seitheben', ['l', 'r']],
    ]);
  });
  it('gruppiert Stationen', () => {
    const st = (id: string, exerciseId: string): Station => ({ id, gymId: 'g', exerciseId, name: exercises.get(exerciseId)!.name, weightIncrement: 2.5, createdAt: 0 });
    expect(groupStations([st('s1', 'r'), st('s2', 'b'), st('s3', 'l')], exercises).map((g) => [g.base, g.stations.map((s) => s.id)])).toEqual([
      ['Kabel-Seitheben', ['s3', 's1']],
      ['Bankdrücken', ['s2']],
    ]);
  });
});
