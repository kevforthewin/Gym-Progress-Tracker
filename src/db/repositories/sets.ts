import { db, newId } from '../schema';
import type { SetEntry } from '../types';

export async function addSet(input: Omit<SetEntry, 'id' | 'createdAt' | 'setIndex'>): Promise<SetEntry> {
  const existing = await db.sets
    .where('sessionId')
    .equals(input.sessionId)
    .filter((s) => s.stationId === input.stationId)
    .count();
  const entry: SetEntry = { id: newId(), createdAt: Date.now(), setIndex: existing, ...input };
  await db.sets.add(entry);
  return entry;
}

export const updateSet = (id: string, changes: Partial<Omit<SetEntry, 'id'>>) => db.sets.update(id, changes);

export const deleteSet = (id: string) => db.sets.delete(id);
