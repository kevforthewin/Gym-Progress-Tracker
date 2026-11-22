import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';

/** Alle Stammdaten als Maps – klein genug für Single-User. */
export function useLookup() {
  return useLiveQuery(async () => {
    const [gyms, exercises, stations, plans, planDays] = await Promise.all([
      db.gyms.toArray(),
      db.exercises.toArray(),
      db.stations.toArray(),
      db.plans.orderBy('order').toArray(),
      db.planDays.toArray(),
    ]);
    return {
      gyms: new Map(gyms.map((g) => [g.id, g])),
      exercises: new Map(exercises.map((e) => [e.id, e])),
      stations: new Map(stations.map((s) => [s.id, s])),
      plans,
      planDays: new Map(planDays.map((d) => [d.id, d])),
    };
  });
}
