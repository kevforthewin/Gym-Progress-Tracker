import { db, newId } from '../schema';
import type { CardioEntry } from '../types';

export const isoDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const todayIso = () => isoDate(Date.now());

/** Ein Eintrag pro Tag: vorhandenen Wert überschreiben. */
export async function upsertBodyweight(date: string, weightKg: number | undefined) {
  const existing = await db.bodyweights.where('date').equals(date).toArray();
  if (weightKg === undefined || !Number.isFinite(weightKg) || weightKg <= 0) {
    await db.bodyweights.bulkDelete(existing.map((e) => e.id));
    return;
  }
  if (existing[0]) {
    await db.bodyweights.update(existing[0].id, { weightKg });
    if (existing.length > 1) await db.bodyweights.bulkDelete(existing.slice(1).map((e) => e.id));
  } else await db.bodyweights.add({ id: newId(), date, weightKg, createdAt: Date.now() });
}

export const bodyweightOn = async (date: string) => (await db.bodyweights.where('date').equals(date).first())?.weightKg;

export async function addCardio(input: Omit<CardioEntry, 'id' | 'createdAt'>) {
  const e: CardioEntry = { id: newId(), createdAt: Date.now(), ...input };
  await db.cardio.add(e);
  return e;
}
export const deleteCardio = (id: string) => db.cardio.delete(id);
