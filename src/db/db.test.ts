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
