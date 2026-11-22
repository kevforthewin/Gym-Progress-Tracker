import { db, newId } from '../schema';
import type { Plan, PlanDay, PlanDayExercise } from '../types';

export async function createPlan(name: string): Promise<Plan> {
  const order = await db.plans.count();
  const plan: Plan = { id: newId(), name: name.trim(), order, createdAt: Date.now() };
  await db.plans.add(plan);
  return plan;
}

export const updatePlan = (id: string, changes: Partial<Omit<Plan, 'id'>>) => db.plans.update(id, changes);

export async function deletePlan(id: string) {
  await db.transaction('rw', [db.plans, db.planDays, db.planDayExercises, db.sessions], async () => {
    const dayIds = await db.planDays.where('planId').equals(id).primaryKeys();
    for (const dayId of dayIds) await deletePlanDayInner(dayId);
    await db.plans.delete(id);
  });
}

export async function createPlanDay(planId: string, name: string): Promise<PlanDay> {
  const order = await db.planDays.where('planId').equals(planId).count();
  const day: PlanDay = { id: newId(), planId, name: name.trim(), order };
  await db.planDays.add(day);
  return day;
}

export const updatePlanDay = (id: string, changes: Partial<Omit<PlanDay, 'id'>>) =>
  db.planDays.update(id, changes);

async function deletePlanDayInner(id: string) {
  await db.planDayExercises.where('planDayId').equals(id).delete();
  // Sessions behalten, nur Verknüpfung lösen.
  await db.sessions.where('planDayId').equals(id).modify((s) => {
    delete s.planDayId;
  });
  await db.planDays.delete(id);
}

export const deletePlanDay = (id: string) =>
  db.transaction('rw', [db.planDays, db.planDayExercises, db.sessions], () => deletePlanDayInner(id));

export const daysForPlan = async (planId: string) =>
  (await db.planDays.where('planId').equals(planId).toArray()).sort((a, b) => a.order - b.order);

export async function addPlanDayExercise(
  input: Omit<PlanDayExercise, 'id' | 'order'>,
): Promise<PlanDayExercise> {
  const order = await db.planDayExercises.where('planDayId').equals(input.planDayId).count();
  const pde: PlanDayExercise = { id: newId(), order, ...input };
  await db.planDayExercises.add(pde);
  return pde;
}

export const updatePlanDayExercise = (id: string, changes: Partial<Omit<PlanDayExercise, 'id'>>) =>
  db.planDayExercises.update(id, changes);

export const deletePlanDayExercise = (id: string) => db.planDayExercises.delete(id);

export const exercisesForDay = async (planDayId: string) =>
  (await db.planDayExercises.where('planDayId').equals(planDayId).toArray()).sort((a, b) => a.order - b.order);

/** Verschiebt ein Element in einer sortierten Liste um `delta` und schreibt `order` neu. */
export async function moveItem(
  table: 'planDays' | 'planDayExercises',
  items: { id: string }[],
  id: string,
  delta: number,
) {
  const idx = items.findIndex((i) => i.id === id);
  const target = idx + delta;
  if (idx < 0 || target < 0 || target >= items.length) return;
  const reordered = [...items];
  const [it] = reordered.splice(idx, 1);
  reordered.splice(target, 0, it);
  await db.transaction('rw', db.table(table), async () => {
    await Promise.all(reordered.map((x, order) => db.table(table).update(x.id, { order })));
  });
}
