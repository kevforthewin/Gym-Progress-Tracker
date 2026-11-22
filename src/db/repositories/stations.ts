import { db, newId } from '../schema';
import type { Station } from '../types';

export async function createStation(input: Omit<Station, 'id' | 'createdAt'>): Promise<Station> {
  const st: Station = { id: newId(), createdAt: Date.now(), ...input, name: input.name.trim() };
  await db.stations.add(st);
  return st;
}

export const updateStation = (id: string, changes: Partial<Omit<Station, 'id'>>) =>
  db.stations.update(id, changes);

export async function deleteStation(id: string): Promise<boolean> {
  if ((await db.sets.where('stationId').equals(id).count()) > 0) return false;
  await db.stations.delete(id);
  return true;
}

export const stationsForGym = (gymId: string) => db.stations.where('gymId').equals(gymId).toArray();

/** Gerät für Übung in Gym (falls mehrere: zuletzt angelegtes). */
export async function stationFor(gymId: string, exerciseId: string): Promise<Station | undefined> {
  const list = await db.stations.where('[gymId+exerciseId]').equals([gymId, exerciseId]).toArray();
  return list.sort((a, b) => b.createdAt - a.createdAt)[0];
}
