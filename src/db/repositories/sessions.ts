import { db, newId } from '../schema';
import type { Session, SetEntry } from '../types';
import type { SessionHistory } from '../../domain/progression';

export async function startSession(gymId: string, planDayId?: string): Promise<Session> {
  const session: Session = { id: newId(), gymId, planDayId, startedAt: Date.now() };
  await db.sessions.add(session);
  return session;
}

export const updateSession = (id: string, changes: Partial<Omit<Session, 'id'>>) =>
  db.sessions.update(id, changes);

export const finishSession = (id: string) => db.sessions.update(id, { finishedAt: Date.now() });

export async function deleteSession(id: string) {
  await db.transaction('rw', [db.sessions, db.sets], async () => {
    await db.sets.where('sessionId').equals(id).delete();
    await db.sessions.delete(id);
  });
}

export const activeSession = async () =>
  (await db.sessions.orderBy('startedAt').reverse().toArray()).find((s) => !s.finishedAt);

export const recentSessions = (limit = 20) => db.sessions.orderBy('startedAt').reverse().limit(limit).toArray();

/** Letzte Session, deren Plantag zu einem der übergebenen Tage gehört. */
export async function lastSessionForDays(dayIds: string[]): Promise<Session | undefined> {
  if (!dayIds.length) return undefined;
  const list = await db.sessions.where('planDayId').anyOf(dayIds).toArray();
  return list.sort((a, b) => b.startedAt - a.startedAt)[0];
}

export const setsForSession = async (sessionId: string) =>
  (await db.sets.where('sessionId').equals(sessionId).toArray()).sort(
    (a, b) => a.createdAt - b.createdAt,
  );

/** Alle Sätze einer Station, gruppiert nach Session (älteste zuerst). */
export async function stationSessions(
  stationId: string,
  opts: { excludeSessionId?: string; includeWarmup?: boolean; includeExcluded?: boolean } = {},
): Promise<{ session: Session; sets: SetEntry[] }[]> {
  const sets = await db.sets
    .where('[stationId+createdAt]')
    .between([stationId, -Infinity], [stationId, Infinity])
    .toArray();
  const bySession = new Map<string, SetEntry[]>();
  for (const s of sets) {
    if (s.sessionId === opts.excludeSessionId) continue;
    if (s.isWarmup && !opts.includeWarmup) continue;
    if (s.excluded && !opts.includeExcluded) continue;
    const arr = bySession.get(s.sessionId) ?? [];
    arr.push(s);
    bySession.set(s.sessionId, arr);
  }
  const sessions = await db.sessions.bulkGet([...bySession.keys()]);
  return sessions
    .filter((s): s is Session => !!s)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((session) => ({
      session,
      sets: (bySession.get(session.id) ?? []).sort((a, b) => a.setIndex - b.setIndex),
    }));
}

export async function stationHistory(stationId: string, excludeSessionId?: string): Promise<SessionHistory[]> {
  const grouped = await stationSessions(stationId, { excludeSessionId });
  return grouped.map(({ session, sets }) => ({
    date: session.startedAt,
    sets: sets.map(({ weightKg, reps, durationSec, distanceM }) => ({ weightKg, reps, durationSec, distanceM })),
  }));
}
