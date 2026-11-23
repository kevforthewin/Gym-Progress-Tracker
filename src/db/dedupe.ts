/**
 * Doppelte Einträge erkennen und zusammenführen (z. B. nach dem Einspielen zweier Backups mit
 * unterschiedlichen IDs). Zusammengeführt wird immer über den Namen.
 */
import { db } from './schema';
import { norm } from './addSessions';
import { getSetting, setSetting } from './repositories/settings';
import type { Exercise, Gym, Plan, PlanDay, Session, SetEntry, Station } from './types';

export interface DuplicateReport {
  gyms: number;
  plans: number;
  planDays: number;
  exercises: number;
  stations: number;
  sessions: number;
  total: number;
}

/** Gruppiert nach Schlüssel, gibt nur Gruppen mit >1 Element zurück. */
function groups<T>(items: T[], key: (t: T) => string): T[][] {
  const m = new Map<string, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return [...m.values()].filter((g) => g.length > 1);
}
const extra = (gs: unknown[][]) => gs.reduce((a, g) => a + g.length - 1, 0);

const sessionSignature = (s: Session, sets: SetEntry[], stationName: (id: string) => string) =>
  `${s.gymId}|${s.startedAt}|` +
  sets
    .filter((x) => x.sessionId === s.id)
    .map((x) => `${norm(stationName(x.stationId))}:${x.weightKg ?? ''}x${x.reps ?? ''}${x.isWarmup ? 'w' : ''}`)
    .sort()
    .join(',');

export async function findDuplicates(): Promise<DuplicateReport> {
  const [gyms, plans, planDays, exercises, stations, sessions, sets] = await Promise.all([
    db.gyms.toArray(),
    db.plans.toArray(),
    db.planDays.toArray(),
    db.exercises.toArray(),
    db.stations.toArray(),
    db.sessions.toArray(),
    db.sets.toArray(),
  ]);
  const gymKey = new Map<string, string>(); // gymId -> norm(name)
  for (const g of gyms) gymKey.set(g.id, norm(g.name));
  const planKey = new Map(plans.map((p) => [p.id, norm(p.name)]));
  const stName = new Map(stations.map((s) => [s.id, s.name]));

  const r = {
    gyms: extra(groups(gyms, (g) => norm(g.name))),
    plans: extra(groups(plans, (p) => norm(p.name))),
    planDays: extra(groups(planDays, (d) => `${planKey.get(d.planId)}|${norm(d.name)}`)),
    exercises: extra(groups(exercises, (e) => norm(e.name))),
    stations: extra(groups(stations, (s) => `${gymKey.get(s.gymId)}|${norm(s.name)}`)),
    sessions: extra(
      groups(
        sessions.map((s) => ({ s, sig: sessionSignature({ ...s, gymId: gymKey.get(s.gymId) ?? s.gymId }, sets, (id) => stName.get(id) ?? id) })),
        (x) => x.sig,
      ),
    ),
  };
  return { ...r, total: r.gyms + r.plans + r.planDays + r.exercises + r.stations + r.sessions };
}

export async function mergeDuplicates(): Promise<DuplicateReport> {
  const before = await findDuplicates();
  await db.transaction('rw', db.tables, async () => {
    // ---- Gyms ----
    const sessions = await db.sessions.toArray();
    const sessionCount = (gymId: string) => sessions.filter((s) => s.gymId === gymId).length;
    for (const grp of groups(await db.gyms.toArray(), (g: Gym) => norm(g.name))) {
      const [keep, ...drop] = grp.sort((a, b) => sessionCount(b.id) - sessionCount(a.id) || a.createdAt - b.createdAt);
      for (const d of drop) {
        await db.stations.where('gymId').equals(d.id).modify({ gymId: keep.id });
        await db.sessions.where('gymId').equals(d.id).modify({ gymId: keep.id });
        await db.cardio.filter((c) => c.gymId === d.id).modify({ gymId: keep.id });
        await db.gyms.delete(d.id);
      }
    }

    // ---- Übungen ----
    for (const grp of groups(await db.exercises.toArray(), (e: Exercise) => norm(e.name))) {
      const used = async (id: string) => db.stations.where('exerciseId').equals(id).count();
      const scored = await Promise.all(grp.map(async (e) => ({ e, n: await used(e.id) })));
      scored.sort((a, b) => b.n - a.n || a.e.createdAt - b.e.createdAt);
      const keep = scored[0].e;
      const patch: Partial<Exercise> = {};
      for (const { e } of scored.slice(1)) {
        if (keep.muscleGroup === undefined && e.muscleGroup !== undefined) patch.muscleGroup = e.muscleGroup;
        if (keep.alternativeGroup === undefined && e.alternativeGroup !== undefined) patch.alternativeGroup = e.alternativeGroup;
        await db.stations.where('exerciseId').equals(e.id).modify({ exerciseId: keep.id });
        await db.sets.filter((s) => s.exerciseId === e.id).modify({ exerciseId: keep.id });
        await db.planDayExercises.where('exerciseId').equals(e.id).modify({ exerciseId: keep.id });
        await db.exercises.delete(e.id);
      }
      if (Object.keys(patch).length) await db.exercises.update(keep.id, patch);
    }

    // ---- Geräte (gleiches Gym + Name) ----
    const stationMap = new Map<string, string>(); // alt -> neu
    for (const grp of groups(await db.stations.toArray(), (s: Station) => `${s.gymId}|${norm(s.name)}`)) {
      const counts = await Promise.all(grp.map((s) => db.sets.where('stationId').equals(s.id).count()));
      const order = grp.map((s, i) => ({ s, n: counts[i] })).sort((a, b) => b.n - a.n || a.s.createdAt - b.s.createdAt);
      const keep = order[0].s;
      const steps = new Set(keep.weightSteps ?? []);
      const patch: Partial<Station> = {};
      for (const { s } of order.slice(1)) {
        (s.weightSteps ?? []).forEach((w) => steps.add(w));
        if (!keep.settingsNote && s.settingsNote) patch.settingsNote = s.settingsNote;
        if (!keep.notes && s.notes) patch.notes = s.notes;
        await db.sets.where('stationId').equals(s.id).modify({ stationId: keep.id, exerciseId: keep.exerciseId });
        stationMap.set(s.id, keep.id);
        await db.stations.delete(s.id);
      }
      if (steps.size) patch.weightSteps = [...steps].sort((a, b) => a - b);
      await db.stations.update(keep.id, patch);
    }
    if (stationMap.size) {
      await db.sessions.toCollection().modify((s: Session) => {
        if (!s.swaps) return;
        for (const k of Object.keys(s.swaps)) s.swaps[k] = s.swaps[k].map((id) => stationMap.get(id) ?? id);
      });
      const aliases = (await getSetting('importAliases')) ?? {};
      for (const k of Object.keys(aliases)) aliases[k] = stationMap.get(aliases[k]) ?? aliases[k];
      await setSetting('importAliases', aliases);
    }

    // ---- Pläne & Plantage ----
    const activePlanId = await getSetting('activePlanId');
    for (const grp of groups(await db.plans.toArray(), (p: Plan) => norm(p.name))) {
      const [keep, ...drop] = grp.sort((a, b) => (a.id === activePlanId ? -1 : b.id === activePlanId ? 1 : a.createdAt - b.createdAt));
      for (const d of drop) {
        await db.planDays.where('planId').equals(d.id).modify({ planId: keep.id });
        await db.plans.delete(d.id);
      }
      if (drop.some((d) => d.id === activePlanId)) await setSetting('activePlanId', keep.id);
    }
    const plans = await db.plans.toArray();
    for (const p of plans) {
      const days = await db.planDays.where('planId').equals(p.id).toArray();
      for (const grp of groups(days, (d: PlanDay) => norm(d.name))) {
        const [keep, ...drop] = grp.sort((a, b) => a.order - b.order);
        for (const d of drop) {
          await db.planDayExercises.where('planDayId').equals(d.id).modify({ planDayId: keep.id });
          await db.sessions.where('planDayId').equals(d.id).modify({ planDayId: keep.id });
          await db.planDays.delete(d.id);
        }
      }
    }
    // doppelte Übungen innerhalb eines Plantags
    const pdes = (await db.planDayExercises.toArray()).sort((a, b) => a.order - b.order);
    const seen = new Set<string>();
    for (const pde of pdes) {
      const k = `${pde.planDayId}|${pde.exerciseId}`;
      if (seen.has(k)) await db.planDayExercises.delete(pde.id);
      else seen.add(k);
    }
    // Reihenfolge je Tag neu durchnummerieren
    const byDay = new Map<string, typeof pdes>();
    for (const pde of (await db.planDayExercises.toArray()).sort((a, b) => a.order - b.order))
      byDay.set(pde.planDayId, [...(byDay.get(pde.planDayId) ?? []), pde]);
    for (const list of byDay.values()) await Promise.all(list.map((pde, i) => db.planDayExercises.update(pde.id, { order: i })));

    // ---- Trainings: gleiches Gym, gleicher Zeitpunkt, gleiche Sätze ----
    const allSets = await db.sets.toArray();
    const stName = new Map((await db.stations.toArray()).map((s) => [s.id, s.name]));
    for (const grp of groups(await db.sessions.toArray(), (s: Session) => sessionSignature(s, allSets, (id) => stName.get(id) ?? id))) {
      const [, ...drop] = grp.sort((a, b) => (a.finishedAt ? 0 : 1) - (b.finishedAt ? 0 : 1));
      for (const d of drop) {
        await db.sets.where('sessionId').equals(d.id).delete();
        await db.sessions.delete(d.id);
      }
    }

    // ---- Körpergewicht: ein Eintrag pro Tag; Cardio: exakte Duplikate ----
    for (const grp of groups(await db.bodyweights.toArray(), (b) => b.date)) await db.bodyweights.bulkDelete(grp.slice(1).map((b) => b.id));
    for (const grp of groups(await db.cardio.toArray(), (c) => `${c.date}|${norm(c.kind)}|${c.durationMin}|${c.distanceKm ?? ''}`))
      await db.cardio.bulkDelete(grp.slice(1).map((c) => c.id));
  });
  return before;
}
