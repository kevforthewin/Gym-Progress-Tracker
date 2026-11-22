import type { Exercise, PlanDayExercise, Station } from '../../db/types';
import { splitSide } from '../../domain/exerciseDefaults';

export interface PlanUnit {
  key: string;
  base: string;
  pdes: PlanDayExercise[];
}

const sideRank = (name: string) => (splitSide(name).side === 'rechts' ? 1 : 0);

/** Fasst Plan-Einträge "X (links)" + "X (rechts)" zu einer Einheit zusammen (Reihenfolge = erstes Vorkommen). */
export function groupPlanUnits(pdes: PlanDayExercise[], exercises: Map<string, Exercise>): PlanUnit[] {
  const used = new Set<string>();
  const units: PlanUnit[] = [];
  for (const pde of pdes) {
    if (used.has(pde.id)) continue;
    used.add(pde.id);
    const name = exercises.get(pde.exerciseId)?.name ?? '';
    const { base, side } = splitSide(name);
    const group = [pde];
    if (side) {
      const partner = pdes.find((p) => {
        if (used.has(p.id)) return false;
        const o = splitSide(exercises.get(p.exerciseId)?.name ?? '');
        return o.side && o.side !== side && o.base === base;
      });
      if (partner) {
        used.add(partner.id);
        group.push(partner);
      }
    }
    group.sort((a, b) => sideRank(exercises.get(a.exerciseId)?.name ?? '') - sideRank(exercises.get(b.exerciseId)?.name ?? ''));
    units.push({ key: group.map((p) => p.id).join('|'), base, pdes: group });
  }
  return units;
}

/** Gruppiert Stationen nach Grundname (Paare links/rechts). */
export function groupStations(stations: Station[], exercises: Map<string, Exercise>): { base: string; stations: Station[] }[] {
  const map = new Map<string, Station[]>();
  for (const st of stations) {
    const base = splitSide(exercises.get(st.exerciseId)?.name ?? st.name).base;
    map.set(base, [...(map.get(base) ?? []), st]);
  }
  return [...map].map(([base, list]) => ({
    base,
    stations: list.sort((a, b) => sideRank(exercises.get(a.exerciseId)?.name ?? a.name) - sideRank(exercises.get(b.exerciseId)?.name ?? b.name)),
  }));
}
