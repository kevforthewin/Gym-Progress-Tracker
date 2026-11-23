import { db, newId } from '../schema';
import type { HealthImport } from '../../domain/health';
import { upsertBodyweight } from './body';

export interface HealthApplyResult {
  days: number;
  weights: number;
  workouts: number;
  skippedWorkouts: number;
}

/** Übernimmt importierte Health-Daten: Tageswerte überschreiben (pro Feld), Gewicht je Tag, Workouts ohne Duplikate als Cardio. */
export async function applyHealthImport(data: HealthImport): Promise<HealthApplyResult> {
  const res: HealthApplyResult = { days: 0, weights: 0, workouts: 0, skippedWorkouts: 0 };
  await db.transaction('rw', [db.health, db.bodyweights, db.cardio], async () => {
    const now = Date.now();
    const dates = Object.keys(data.days);
    const existing = new Map((await db.health.bulkGet(dates)).filter(Boolean).map((d) => [d!.date, d!]));
    await db.health.bulkPut(
      dates.map((date) => {
        const clean = Object.fromEntries(Object.entries(data.days[date]).filter(([, v]) => v !== undefined));
        return { ...(existing.get(date) ?? {}), ...clean, date, updatedAt: now };
      }),
    );
    res.days = dates.length;

    for (const [date, kg] of Object.entries(data.weights)) {
      await upsertBodyweight(date, kg);
      res.weights++;
    }

    const ids = data.workouts.map((w) => w.externalId);
    const known = new Set((await db.cardio.where('externalId').anyOf(ids).toArray()).map((c) => c.externalId));
    const fresh = data.workouts.filter((w) => !known.has(w.externalId));
    await db.cardio.bulkAdd(
      fresh.map((w) => ({
        id: newId(),
        date: w.date,
        kind: w.kind,
        durationMin: w.durationMin,
        distanceKm: w.distanceKm,
        kcal: w.kcal,
        source: 'health' as const,
        externalId: w.externalId,
        createdAt: now,
      })),
    );
    res.workouts = fresh.length;
    res.skippedWorkouts = data.workouts.length - fresh.length;
  });
  return res;
}
