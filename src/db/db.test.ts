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

describe('gym-übergreifende Übungen', () => {
  it('Freihantel teilt die Historie über Gyms, Maschinen nicht', async () => {
    const { createGym } = await import('./repositories/gyms');
    const { createExercise } = await import('./repositories/exercises');
    const { createStation } = await import('./repositories/stations');
    const evo = await createGym('EVO');
    const iron = await createGym('IRON');
    const bank = await createExercise({ name: 'Bankdrücken', type: 'weight_reps' });
    const fly = await createExercise({ name: 'Butterfly Matrix', type: 'weight_reps' });
    expect(bank.sharedAcrossGyms).toBe(true);
    expect(fly.sharedAcrossGyms).toBe(false);
    const be = await createStation({ gymId: evo.id, exerciseId: bank.id, name: 'Bankdrücken', weightIncrement: 2.5 });
    const bi = await createStation({ gymId: iron.id, exerciseId: bank.id, name: 'Bankdrücken', weightIncrement: 2.5 });
    const fe = await createStation({ gymId: evo.id, exerciseId: fly.id, name: 'Butterfly', weightIncrement: 5 });
    const fi = await createStation({ gymId: iron.id, exerciseId: fly.id, name: 'Butterfly', weightIncrement: 5 });
    const s1 = await startSession(evo.id);
    await addSet({ sessionId: s1.id, stationId: be.id, exerciseId: bank.id, weightKg: 70, reps: 7, isWarmup: false });
    await addSet({ sessionId: s1.id, stationId: fe.id, exerciseId: fly.id, weightKg: 50, reps: 10, isWarmup: false });
    const s2 = await startSession(iron.id);
    await addSet({ sessionId: s2.id, stationId: bi.id, exerciseId: bank.id, weightKg: 70, reps: 8, isWarmup: false });
    await addSet({ sessionId: s2.id, stationId: fi.id, exerciseId: fly.id, weightKg: 40, reps: 12, isWarmup: false });

    expect((await stationHistory(be.id)).map((h) => h.sets[0].reps)).toEqual([7, 8]); // beide Gyms
    expect((await stationHistory(bi.id, s2.id)).map((h) => h.sets[0].reps)).toEqual([7]); // aktuelle Session ausgeschlossen
    expect((await stationHistory(fi.id)).map((h) => h.sets[0].weightKg)).toEqual([40]); // Maschine: nur IRON
  });

  it('Namensregeln', async () => {
    const { guessSharedAcrossGyms: g } = await import('../domain/exerciseDefaults');
    for (const n of ['Bankdrücken', 'Schrägbankdrücken Kurzhantel 30°', 'Schrägbankdrücken Langhantel', 'Schulterdrücken Kurzhantel', 'Hammercurls', 'SZ-Curls', 'Kurzhantel Incline Curl', 'Klimmzüge', 'Vorgebeugtes Shruggen', 'Kurzhantel-Seitheben'])
      expect([n, g(n)]).toEqual([n, true]);
    for (const n of ['Hoist Incline Press', 'Butterfly Matrix', 'Hammer Strength Shoulder Press', 'Kabel-Seitheben (links)', 'Latzug', 'Face Pull', 'Trizepsmaschine Matrix', 'Beinpresse', 'Multi Pec'])
      expect([n, g(n)]).toEqual([n, false]);
  });
});
