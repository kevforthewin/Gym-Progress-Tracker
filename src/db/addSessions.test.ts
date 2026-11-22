import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './schema';
import { seedExampleData } from './seed';
import { createGym } from './repositories/gyms';
import { createExercise } from './repositories/exercises';
import { createStation } from './repositories/stations';
import { analyzeImport, applyImport, exKey, mergeAppBackup, norm, parseSessionsFile, type ImportDecisions } from './addSessions';
import { exportData } from './backup';
import { getSetting } from './repositories/settings';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

const log = {
  sessions: [
    {
      date: '2026-11-20',
      gym: 'Iron & Soul',
      workout_type: 'Push',
      exercises: [
        { exercise: 'Bankdrücken', sets: [{ weight_kg: 70, reps: 8 }, { weight_kg: 70, reps: 8 }, { weight_kg: 70, reps: null }] },
        { exercise: 'Kabel-Seitheben', sets: [{ weight_kg: 7.9, reps: 11, side: 'L' }, { weight_kg: 7.9, reps: 12, side: 'R' }] },
        { exercise: 'Matrix Brustpresse', counts_as_reference: false, sets: [{ weight_kg: 59, reps: 7 }] },
        { exercise: 'Low-to-High Fly', sets: [{ weight_kg: 14, reps: 10, warmup: true }, { weight_kg: 21, reps: 6 }] },
      ],
    },
  ],
};

async function setupIron() {
  const gym = await createGym('IRON & Soul');
  const bank = await createExercise({ name: 'Bankdrücken', type: 'weight_reps' });
  const sl = await createExercise({ name: 'Kabel-Seitheben (links)', type: 'weight_reps' });
  const sr = await createExercise({ name: 'Kabel-Seitheben (rechts)', type: 'weight_reps' });
  const bankSt = await createStation({ gymId: gym.id, exerciseId: bank.id, name: 'Bankdrücken', weightIncrement: 2.5 });
  await createStation({ gymId: gym.id, exerciseId: sl.id, name: 'Kabel-Seitheben (links)', weightIncrement: 2.2 });
  await createStation({ gymId: gym.id, exerciseId: sr.id, name: 'Kabel-Seitheben (rechts)', weightIncrement: 2.2 });
  return { gym, bankSt };
}

const accept = (a: Awaited<ReturnType<typeof analyzeImport>>): ImportDecisions => ({
  gyms: Object.fromEntries(a.gyms.map((g) => [norm(g.name), g.gymId ?? 'new'])),
  exercises: {},
  sessions: Object.fromEntries(a.sessions.map((s) => [s.key, { include: !s.duplicate, date: s.date, planDayId: s.planDayId }])),
});

describe('parseSessionsFile', () => {
  it('liest Trainingslog, trennt Seiten, ignoriert Nicht-Referenzen und Sätze ohne Wdh.', () => {
    const [s] = parseSessionsFile(log);
    expect(s.date).toBe('2026-11-20');
    expect(s.exercises.map((e) => [e.name, e.side, e.sets.length])).toEqual([
      ['Bankdrücken', undefined, 2],
      ['Kabel-Seitheben', 'L', 1],
      ['Kabel-Seitheben', 'R', 1],
      ['Low-to-High Fly', undefined, 2],
    ]);
    expect(s.exercises[3].sets[0].warmup).toBe(true);
  });

  it('akzeptiert einzelnes Training mit deutschem Datum und null-Gewicht', () => {
    const [s] = parseSessionsFile({ datum: '22.11.2026', studio: 'EVO', exercises: [{ name: 'Klimmzüge', sets: [{ weight_kg: null, reps: 7 }] }] });
    expect(s.date).toBe('2026-11-22');
    expect(s.exercises[0].sets[0].weightKg).toBe(0);
  });

  it('wirft bei leerer Datei', () => {
    expect(() => parseSessionsFile({ foo: 1 })).toThrow();
  });
});

describe('analyzeImport / applyImport', () => {
  it('ordnet Gym (Schreibweise egal) und Übungen inkl. Seiten zu und hängt an', async () => {
    const { bankSt } = await setupIron();
    const sessions = parseSessionsFile(log);
    const a = await analyzeImport(sessions);
    expect(a.gyms[0].gymId).toBeDefined();
    expect(a.exercises.filter((e) => e.stationId).map((e) => e.label)).toEqual([
      'Bankdrücken',
      'Kabel-Seitheben (links)',
      'Kabel-Seitheben (rechts)',
    ]);
    expect(a.exercises.find((e) => e.label === 'Low-to-High Fly')?.stationId).toBeUndefined();

    const r = await applyImport(sessions, a, accept(a));
    expect(r).toEqual({ sessions: 1, sets: 6, newGyms: 0, newStations: 1, addedToPlan: 0 });
    expect(await db.sets.where('stationId').equals(bankSt.id).count()).toBe(2);
    expect(await db.sets.filter((s) => s.isWarmup).count()).toBe(1);
  });

  it('erkennt doppelte Trainings beim zweiten Import', async () => {
    await setupIron();
    const sessions = parseSessionsFile(log);
    const a1 = await analyzeImport(sessions);
    await applyImport(sessions, a1, accept(a1));
    const a2 = await analyzeImport(sessions);
    expect(a2.sessions[0].duplicate).toBe(true);
    const r = await applyImport(sessions, a2, accept(a2));
    expect(r.sessions).toBe(0);
  });

  it('merkt sich manuelle Zuordnungen', async () => {
    const { gym, bankSt } = await setupIron();
    const sessions = parseSessionsFile({ gym: 'IRON & Soul', exercises: [{ exercise: 'Flachbank LH', sets: [{ weight_kg: 70, reps: 7 }] }] });
    const a = await analyzeImport(sessions);
    const d = accept(a);
    d.exercises[exKey('IRON & Soul', 'Flachbank LH')] = { kind: 'station', stationId: bankSt.id };
    await applyImport(sessions, a, d);
    expect((await getSetting('importAliases'))?.[`${gym.id}|${norm('Flachbank LH')}`]).toBe(bankSt.id);
    const again = await analyzeImport(sessions);
    expect(again.exercises[0].stationId).toBe(bankSt.id);
  });

  it('ordnet workout_type dem Plantag zu und legt unbekannte Gyms an', async () => {
    await seedExampleData();
    const sessions = parseSessionsFile({ gym: 'Neues Gym', workout_type: 'pull', exercises: [{ exercise: 'Latzug', sets: [{ weight_kg: 50, reps: 10 }] }] });
    const a = await analyzeImport(sessions);
    expect(a.gyms[0].gymId).toBeUndefined();
    const pull = (await db.planDays.toArray()).find((d) => d.name === 'Pull');
    expect(a.sessions[0].planDayId).toBe(pull?.id);
    const r = await applyImport(sessions, a, accept(a));
    expect(r.newGyms).toBe(1);
    expect(await db.gyms.count()).toBe(2);
  });
});

describe('Plan-Aufnahme', () => {
  it('nimmt neue Übungen auf Wunsch in den Plantag auf (einmalig)', async () => {
    await seedExampleData();
    const gym = (await db.gyms.toArray())[0];
    const pull = (await db.planDays.toArray()).find((d) => d.name === 'Pull')!;
    const file = { gym: gym.name, workout_type: 'Pull', exercises: [
      { exercise: 'Hoist Mid Row', sets: [{ weight_kg: 70, reps: 9 }, { weight_kg: 70, reps: 10 }] },
      { exercise: 'Latzug', sets: [{ weight_kg: 60, reps: 10 }] },
    ] };
    const sessions = parseSessionsFile(file);
    const a = await analyzeImport(sessions);
    const mid = a.exercises.find((e) => e.label === 'Hoist Mid Row')!;
    expect(mid.inPlan).toBe(false);
    expect(mid.planDayIds).toEqual([pull.id]);
    expect(a.exercises.find((e) => e.label === 'Latzug')!.inPlan).toBe(true);
    const d = accept(a);
    d.addToPlan = { [exKey(gym.name, 'Hoist Mid Row')]: true };
    const before = await db.planDayExercises.where('planDayId').equals(pull.id).count();
    const r = await applyImport(sessions, a, d);
    expect(r.addedToPlan).toBe(1);
    const list = await db.planDayExercises.where('planDayId').equals(pull.id).sortBy('order');
    expect(list).toHaveLength(before + 1);
    expect(list.at(-1)).toMatchObject({ sets: 3, repMin: 8, repMax: 12, order: before });
    // zweiter Import: steht schon im Plan
    const again = await analyzeImport(parseSessionsFile({ ...file, date: '2030-01-01' }));
    expect(again.exercises.find((e) => e.label === 'Hoist Mid Row')!.inPlan).toBe(true);
  });
});

describe('mergeAppBackup', () => {
  it('ergänzt nur fehlende Datensätze', async () => {
    await seedExampleData();
    const backup = JSON.parse(JSON.stringify(await exportData()));
    const gymCount = await db.gyms.count();
    expect(await mergeAppBackup(backup)).toBe(0);
    await db.gyms.clear();
    expect(await mergeAppBackup(backup)).toBe(gymCount);
  });
});
