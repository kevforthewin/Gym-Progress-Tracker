import { db, newId } from '../schema';
import type { Gym } from '../types';

export async function createGym(name: string, notes?: string): Promise<Gym> {
  const gym: Gym = { id: newId(), name: name.trim(), notes, archived: false, createdAt: Date.now() };
  await db.gyms.add(gym);
  return gym;
}

export const updateGym = (id: string, changes: Partial<Omit<Gym, 'id'>>) => db.gyms.update(id, changes);

/** Löscht Gym inkl. Geräten, Sessions und Sätzen. */
export async function deleteGym(id: string) {
  await db.transaction('rw', [db.gyms, db.stations, db.sessions, db.sets], async () => {
    const sessionIds = await db.sessions.where('gymId').equals(id).primaryKeys();
    await db.sets.where('sessionId').anyOf(sessionIds).delete();
    await db.sessions.bulkDelete(sessionIds);
    await db.stations.where('gymId').equals(id).delete();
    await db.gyms.delete(id);
  });
}

export const listGyms = async (includeArchived = false) =>
  (await db.gyms.orderBy('name').toArray()).filter((g) => includeArchived || !g.archived);
