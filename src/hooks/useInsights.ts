import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/schema';
import { stationHistory } from '../db/repositories/sessions';
import type { Station } from '../db/types';
import { buildStatus, compareSides, weekStart, type SideComparison, type StatusOverview } from '../domain/insights';
import { computeTarget, type Prescription } from '../domain/progression';
import { splitSide } from '../domain/exerciseDefaults';

const DEFAULT_RX: Prescription = { sets: 3, repMin: 8, repMax: 12 };
const ACTIVE_DAYS = 45;

export interface Insights {
  status: StatusOverview;
  sides: (SideComparison & { gymName: string })[];
  week: { sessions: number; sets: number; prevSessions: number; prevSets: number };
}

/** Status, Seitenvergleich und Wochenbilanz – über alle aktiv genutzten Geräte (letzte 45 Tage). */
export function useInsights(): Insights | undefined {
  return useLiveQuery(async () => {
    const [stations, exercises, gyms, pdes, sessions] = await Promise.all([
      db.stations.toArray(),
      db.exercises.toArray(),
      db.gyms.toArray(),
      db.planDayExercises.toArray(),
      db.sessions.toArray(),
    ]);
    const exMap = new Map(exercises.map((e) => [e.id, e]));
    const gymName = new Map(gyms.map((g) => [g.id, g.name]));
    const multiGym = gyms.length > 1;
    const since = Date.now() - ACTIVE_DAYS * 86400000;

    const items: Parameters<typeof buildStatus>[0] = [];
    const lastByStation = new Map<string, Awaited<ReturnType<typeof stationHistory>>>();
    for (const st of stations) {
      const ex = exMap.get(st.exerciseId);
      if (!ex || ex.type === 'time_distance') continue;
      const history = await stationHistory(st.id);
      lastByStation.set(st.id, history);
      if (!history.length || history[history.length - 1].date < since) continue;
      const pde = pdes.find((p) => p.exerciseId === st.exerciseId);
      if (!pde) continue; // nur Übungen, die im Plan stehen
      const rx = pde ? { sets: pde.sets, repMin: pde.repMin, repMax: pde.repMax } : DEFAULT_RX;
      const target = computeTarget({ type: ex.type, prescription: rx, increment: st.weightIncrement, steps: st.weightSteps, startWeight: st.startWeight, history });
      items.push({ stationId: st.id, label: multiGym ? `${st.name} · ${shortGym(gymName.get(st.gymId))}` : st.name, history, target });
    }
    // Paare (links/rechts) mit gleichem Befund zusammenfassen
    const status = buildStatus(items);
    for (const k of ['deload', 'stalled', 'ready', 'prs'] as const) {
      const merged = new Map<string, (typeof status)[typeof k][number]>();
      for (const it of status[k]) {
        const key = it.label.replace(/ \((links|rechts)\)/, '') + '|' + it.detail;
        const prev = merged.get(key);
        if (prev) prev.label = prev.label.replace(/ \((links|rechts)\)/, ' (L/R)');
        else merged.set(key, { ...it });
      }
      status[k] = [...merged.values()];
    }

    // Seitenvergleich: Paare pro Gym
    const sides: Insights['sides'] = [];
    const byBase = new Map<string, { L?: Station; R?: Station }>();
    for (const st of stations) {
      const { base, side } = splitSide(exMap.get(st.exerciseId)?.name ?? st.name);
      if (!side) continue;
      const k = `${st.gymId}|${base}`;
      const e = byBase.get(k) ?? {};
      e[side === 'links' ? 'L' : 'R'] = st;
      byBase.set(k, e);
    }
    for (const [k, pair] of byBase) {
      if (!pair.L || !pair.R) continue;
      const l = lastByStation.get(pair.L.id)?.at(-1);
      const r = lastByStation.get(pair.R.id)?.at(-1);
      if (!l || !r || Math.max(l.date, r.date) < since) continue;
      const c = compareSides(k.split('|')[1], l, r);
      if (c && c.weaker && c.diffPct >= 10) sides.push({ ...c, gymName: shortGym(gymName.get(pair.L.gymId)) });
    }
    sides.sort((a, b) => b.diffPct - a.diffPct);

    // Woche
    const thisWeek = weekStart(Date.now());
    const prevWeek = weekStart(thisWeek - 86400000);
    const inWeek = (w: number) => sessions.filter((s) => weekStart(s.startedAt) === w);
    const countSets = async (ids: string[]) => (ids.length ? (await db.sets.where('sessionId').anyOf(ids).toArray()).filter((s) => !s.isWarmup).length : 0);
    const cur = inWeek(thisWeek);
    const prev = inWeek(prevWeek);
    return {
      status,
      sides,
      week: {
        sessions: cur.length,
        sets: await countSets(cur.map((s) => s.id)),
        prevSessions: prev.length,
        prevSets: await countSets(prev.map((s) => s.id)),
      },
    };
  });
}

function shortGym(name?: string) {
  if (!name) return '';
  return name.split(/\s+/)[0];
}
