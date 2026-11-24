import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../../db/schema';
import { getSetting } from '../../../db/repositories/settings';
import { splitOfDayName, type DExercise, type DSession, type DSet, type DStation, type DCardio } from '../../../domain/dashboard';

export const DEFAULT_WEEKLY_GOAL = 4;
/** Pseudo-Gym für gym-übergreifende (Freihantel-)Übungen */
export const ALL_GYMS = '*';
export const ALL_GYMS_COLOR = '#d55181';

/** Farben (Dataviz-Palette, Dark-Stufen, gegen die Kartenfarbe validiert). */
export const SPLIT_COLOR = { push: '#3987e5', pull: '#d95926', legs: '#199e70', other: '#64748b' } as const;
export const GYM_COLORS = ['#9085e9', '#c98500'];
export const STATUS = { hit: '#0ca30c', miss: '#d03b3b' } as const;

export interface DashboardData {
  sessions: DSession[];
  sets: DSet[];
  stations: DStation[];
  exercises: Map<string, DExercise>;
  cardio: DCardio[];
  goal: number;
  sessionInfo: Map<string, { dayName: string; gymName: string }>;
  /** virtuelle Station (gym-übergreifend) -> echtes, zuletzt genutztes Gerät (für Links) */
  realStation: (stationId: string) => { id: string; gymId: string };
  gyms: { id: string; name: string; color: string }[];
}

export function useDashboardData(): DashboardData | undefined {
  return useLiveQuery(async () => {
    const [sessions, sets, stations, exercises, planDays, cardio, gyms, goal] = await Promise.all([
      db.sessions.toArray(),
      db.sets.toArray(),
      db.stations.toArray(),
      db.exercises.toArray(),
      db.planDays.toArray(),
      db.cardio.toArray(),
      db.gyms.toArray(),
      getSetting('weeklyGoal'),
    ]);
    const dayName = new Map(planDays.map((d) => [d.id, d.name]));
    const gymName = new Map(gyms.map((g) => [g.id, g.name]));
    // Gyms mit Trainings, stabile Farbzuordnung nach Name
    const usedGyms = [...new Set(sessions.map((s) => s.gymId))]
      .map((id) => ({ id, name: gymName.get(id) ?? '?' }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((g, i) => ({ ...g, color: GYM_COLORS[i % GYM_COLORS.length] }));

    // Freihantel-Übungen: Sätze aller Gyms auf eine gemeinsame Station "shared:<exerciseId>" legen
    const sharedEx = new Set(exercises.filter((e) => e.sharedAcrossGyms).map((e) => e.id));
    const stationById = new Map(stations.map((s) => [s.id, s]));
    const lastUse = new Map<string, number>();
    for (const x of sets) if ((lastUse.get(x.stationId) ?? 0) < x.createdAt) lastUse.set(x.stationId, x.createdAt);
    const virtualOf = (stationId: string) => {
      const st = stationById.get(stationId);
      return st && sharedEx.has(st.exerciseId) ? `shared:${st.exerciseId}` : stationId;
    };
    const latestReal = new Map<string, string>(); // virtual -> real
    for (const st of stations) {
      const v = virtualOf(st.id);
      const cur = latestReal.get(v);
      if (!cur || (lastUse.get(st.id) ?? 0) > (lastUse.get(cur) ?? 0)) latestReal.set(v, st.id);
    }
    const dStations = [...latestReal].map(([v, realId]) => {
      const s = stationById.get(realId)!;
      return {
        id: v,
        gymId: v.startsWith('shared:') ? ALL_GYMS : s.gymId,
        exerciseId: s.exerciseId,
        name: v.startsWith('shared:') ? exercises.find((e) => e.id === s.exerciseId)?.name ?? s.name : s.name,
        weightIncrement: s.weightIncrement,
        weightSteps: s.weightSteps,
        startWeight: s.startWeight,
      };
    });

    return {
      sessions: sessions.map((s) => ({ id: s.id, gymId: s.gymId, split: splitOfDayName(dayName.get(s.planDayId ?? '')), startedAt: s.startedAt })),
      sets: sets.map((s) => ({
        sessionId: s.sessionId,
        stationId: virtualOf(s.stationId),
        weightKg: s.weightKg,
        reps: s.reps,
        isWarmup: s.isWarmup,
        excluded: s.excluded,
        setIndex: s.setIndex,
        createdAt: s.createdAt,
      })),
      stations: dStations,
      realStation: (id: string) => {
        const real = stationById.get(latestReal.get(id) ?? id);
        return { id: real?.id ?? id, gymId: real?.gymId ?? '' };
      },
      exercises: new Map(exercises.map((e) => [e.id, { id: e.id, name: e.name, type: e.type }])),
      cardio: cardio.map((c) => ({ date: c.date, durationMin: c.durationMin })),
      goal: goal ?? DEFAULT_WEEKLY_GOAL,
      sessionInfo: new Map(sessions.map((s) => [s.id, { dayName: dayName.get(s.planDayId ?? '') ?? 'Freies Training', gymName: gymName.get(s.gymId) ?? '' }])),
      gyms: usedGyms,
    };
  });
}
