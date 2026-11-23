import { beforeEach, describe, expect, it } from 'vitest';
import { db, newId } from './schema';
import { seedExampleData } from './seed';
import { exportData } from './backup';
import { mergeAppBackup, backupToImportSessions, analyzeImport, applyImport, norm } from './addSessions';
import { findDuplicates, mergeDuplicates } from './dedupe';
import { startSession } from './repositories/sessions';
import { addSet } from './repositories/sets';
import { setSetting } from './repositories/settings';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

/** Alle IDs im Backup durch neue ersetzen (wie zwei unabhängig erzeugte Backup-Dateien). */
function remapIds(backup: Awaited<ReturnType<typeof exportData>>) {
  const map = new Map<string, string>();
  const idOf = (id: string) => map.get(id) ?? (map.set(id, newId()), map.get(id)!);
  for (const t of Object.values(backup.tables) as { id?: string }[][]) for (const r of t) if (r.id) idOf(r.id);
  const json = JSON.stringify(backup).replace(/"([0-9a-f-]{36})"/g, (m, id) => (map.has(id) ? `"${map.get(id)}"` : m));
  return JSON.parse(json);
}

async function setup() {
  await seedExampleData();
  const st = (await db.stations.toArray())[0];
  const s = await startSession(st.gymId, (await db.planDays.toArray())[0].id);
  await addSet({ sessionId: s.id, stationId: st.id, exerciseId: st.exerciseId, weightKg: 40, reps: 10, isWarmup: false });
  await addSet({ sessionId: s.id, stationId: st.id, exerciseId: st.exerciseId, weightKg: 40, reps: 9, isWarmup: false });
  await setSetting('importAliases', {});
}

const counts = async () => ({
  gyms: await db.gyms.count(), plans: await db.plans.count(), days: await db.planDays.count(), pdes: await db.planDayExercises.count(),
  exercises: await db.exercises.count(), stations: await db.stations.count(), sessions: await db.sessions.count(), sets: await db.sets.count(),
});

describe('Duplikate', () => {
  it('erkennt und bereinigt doppelt eingespielte Backups vollständig', async () => {
    await setup();
    const original = await counts();
    await mergeAppBackup(remapIds(await exportData())); // alter Weg -> alles doppelt
    expect((await counts()).plans).toBe(2);
    const report = await findDuplicates();
    expect(report).toMatchObject({ gyms: 1, plans: 1, sessions: 1 });
    expect(report.exercises).toBe(original.exercises);

    await mergeDuplicates();
    expect(await counts()).toEqual(original);
    expect((await findDuplicates()).total).toBe(0);
    // Plantage zeigen auf existierenden Plan, Sätze auf existierende Geräte
    const planIds = new Set((await db.plans.toArray()).map((p) => p.id));
    expect((await db.planDays.toArray()).every((d) => planIds.has(d.planId))).toBe(true);
    const stIds = new Set((await db.stations.toArray()).map((s) => s.id));
    expect((await db.sets.toArray()).every((s) => stIds.has(s.stationId))).toBe(true);
  });

  it('App-Backup über "Trainings hinzufügen" erzeugt keine Duplikate', async () => {
    await setup();
    const original = await counts();
    const sessions = backupToImportSessions(remapIds(await exportData()));
    const a = await analyzeImport(sessions);
    expect(a.gyms.every((g) => g.gymId)).toBe(true);
    expect(a.sessions.every((s) => s.duplicate)).toBe(true);
    await applyImport(sessions, a, {
      gyms: Object.fromEntries(a.gyms.map((g) => [norm(g.name), g.gymId!])),
      exercises: {},
      sessions: Object.fromEntries(a.sessions.map((s) => [s.key, { include: !s.duplicate, date: s.date, planDayId: s.planDayId }])),
    });
    expect(await counts()).toEqual(original);
  });
});
