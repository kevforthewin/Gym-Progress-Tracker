import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { seedExampleData } from './seed';
import { exportData, importData } from './backup';
import { startSession } from './repositories/sessions';
import { addSet } from './repositories/sets';
import { stationHistory } from './repositories/sessions';
import { deleteExercise } from './repositories/exercises';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

describe('db', () => {
  it('seed legt Plan und Geräte an', async () => {
    await seedExampleData();
    expect(await db.gyms.count()).toBe(1);
    expect(await db.planDays.count()).toBe(3);
    expect(await db.stations.count()).toBe(await db.exercises.count());
  });

  it('stationHistory gruppiert je Session, ohne Warmup und aktuelle Session', async () => {
    await seedExampleData();
    const st = (await db.stations.toArray())[0];
    const s1 = await startSession(st.gymId);
    await addSet({ sessionId: s1.id, stationId: st.id, exerciseId: st.exerciseId, weightKg: 20, reps: 10, isWarmup: true });
    await addSet({ sessionId: s1.id, stationId: st.id, exerciseId: st.exerciseId, weightKg: 40, reps: 10, isWarmup: false });
    const s2 = await startSession(st.gymId);
    await addSet({ sessionId: s2.id, stationId: st.id, exerciseId: st.exerciseId, weightKg: 40, reps: 11, isWarmup: false });

    const h = await stationHistory(st.id, s2.id);
    expect(h).toHaveLength(1);
    expect(h[0].sets).toEqual([{ weightKg: 40, reps: 10, durationSec: undefined, distanceM: undefined }]);
    expect(await stationHistory(st.id)).toHaveLength(2);
  });

  it('Übung mit Historie lässt sich nicht löschen', async () => {
    await seedExampleData();
    const st = (await db.stations.toArray())[0];
    const s = await startSession(st.gymId);
    await addSet({ sessionId: s.id, stationId: st.id, exerciseId: st.exerciseId, weightKg: 40, reps: 10, isWarmup: false });
    expect(await deleteExercise(st.exerciseId)).toBe(false);
  });

  it('Export/Import Roundtrip', async () => {
    await seedExampleData();
    const backup = JSON.parse(JSON.stringify(await exportData()));
    await Promise.all(db.tables.map((t) => t.clear()));
    await importData(backup);
    expect(await db.exercises.count()).toBe(backup.tables.exercises.length);
    await expect(importData({ foo: 1 })).rejects.toThrow();
  });
});

describe('ausgeschlossene Sätze', () => {
  it('zählen nicht für die Historie (Ziel), bleiben aber gespeichert', async () => {
    await seedExampleData();
    const st = (await db.stations.toArray())[0];
    const s1 = await startSession(st.gymId);
    await addSet({ sessionId: s1.id, stationId: st.id, exerciseId: st.exerciseId, weightKg: 50, reps: 10, isWarmup: false, excluded: true, excludeReason: 'unsauber' });
    await addSet({ sessionId: s1.id, stationId: st.id, exerciseId: st.exerciseId, weightKg: 40, reps: 10, isWarmup: false });
    const h = await stationHistory(st.id);
    expect(h[0].sets.map((x) => x.weightKg)).toEqual([40]);
    expect(await db.sets.count()).toBe(2);
  });
});

describe('Migration v1 -> v2', () => {
  it('setzt Alternativ-Gruppen/Muskelgruppen und übernimmt Körpergewicht aus Sessions', async () => {
    const { default: Dexie } = await import('dexie');
    const { GymDB } = await import('./schema');
    const name = 'migration-test';
    const v1 = new Dexie(name);
    v1.version(1).stores({
      gyms: 'id, name', exercises: 'id, name', stations: 'id, gymId, exerciseId, [gymId+exerciseId]', plans: 'id, order',
      planDays: 'id, planId', planDayExercises: 'id, planDayId, exerciseId', sessions: 'id, gymId, planDayId, startedAt',
      sets: 'id, sessionId, stationId, [stationId+createdAt]', settings: 'key',
    });
    await v1.open();
    await v1.table('exercises').bulkAdd([
      { id: 'a', name: 'Face Pull', type: 'weight_reps', createdAt: 0 },
      { id: 'b', name: 'Hoist Mid Row', type: 'weight_reps', createdAt: 0 },
      { id: 'c', name: 'Bankdrücken', type: 'weight_reps', muscleGroup: 'Brust', alternativeGroup: 'Eigene', createdAt: 0 },
    ]);
    await v1.table('sessions').add({ id: 's', gymId: 'g', startedAt: new Date(2026, 10, 20, 18).getTime(), bodyweightKg: 82.5 });
    v1.close();

    const v2 = new GymDB(name);
    await v2.open();
    const ex = Object.fromEntries((await v2.exercises.toArray()).map((e) => [e.id, e]));
    expect(ex.a.alternativeGroup).toBe('Hintere Schulter');
    expect(ex.a.muscleGroup).toBe('Hintere Schulter');
    expect(ex.b).toMatchObject({ alternativeGroup: 'Rudern', muscleGroup: 'Rücken' });
    expect(ex.c).toMatchObject({ alternativeGroup: 'Eigene', muscleGroup: 'Brust' });
    expect(await v2.bodyweights.toArray()).toMatchObject([{ date: '2026-11-20', weightKg: 82.5 }]);
    v2.close();
  });
});
