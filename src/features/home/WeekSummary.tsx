import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/schema';
import { isoDate } from '../../db/repositories/body';
import { addWeeks, weekStart } from '../../domain/insights';
import { fmtNumber } from '../../domain/units';
import { Card } from '../../components/ui';

/** Diese Woche: Trainings, Sätze, Cardio-Minuten, Ø Schritte – mit Vorwoche zum Vergleich. */
export function WeekSummary() {
  const nav = useNavigate();
  const data = useLiveQuery(async () => {
    const cur = weekStart(Date.now());
    const prev = addWeeks(cur, -1);
    const sessions = await db.sessions.where('startedAt').aboveOrEqual(prev).toArray();
    const week = (from: number, to: number) => {
      const ss = sessions.filter((s) => s.startedAt >= from && s.startedAt < to);
      return ss;
    };
    const stats = async (from: number, to: number) => {
      const ss = week(from, to);
      const sets = ss.length ? (await db.sets.where('sessionId').anyOf(ss.map((s) => s.id)).toArray()).filter((x) => !x.isWarmup).length : 0;
      const [a, b] = [isoDate(from), isoDate(to)];
      const cardio = (await db.cardio.where('date').between(a, b, true, false).toArray()).reduce((s, c) => s + c.durationMin, 0);
      const steps = (await db.health.where('date').between(a, b, true, false).toArray()).map((h) => h.steps).filter((x): x is number => !!x);
      return { sessions: ss.length, sets, cardio, steps: steps.length ? steps.reduce((x, y) => x + y, 0) / steps.length : undefined };
    };
    return { now: await stats(cur, addWeeks(cur, 1)), prev: await stats(prev, cur) };
  });
  if (!data) return null;
  const tiles: [string, number | undefined, number | undefined, number, string][] = [
    ['Trainings', data.now.sessions, data.prev.sessions, 0, '/history'],
    ['Sätze', data.now.sets, data.prev.sets, 0, '/progress?tab=volume'],
    ['Cardio min', data.now.cardio, data.prev.cardio, 0, '/history?type=cardio'],
    ['Ø Schritte', data.now.steps, data.prev.steps, 0, '/progress?tab=body'],
  ];
  return (
    <Card className="space-y-2">
      <h2 className="font-semibold">Diese Woche</h2>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map(([label, v, p, d, to]) => (
          <button key={label} type="button" onClick={() => nav(to)} className="rounded-lg border border-slate-200 px-1 py-2 text-center dark:border-slate-700">
            <div className="text-lg font-bold tabular-nums">{v === undefined ? '–' : fmtNumber(v, d)}</div>
            <div className="text-[11px] leading-tight text-slate-500">{label}</div>
            <div className="text-[10px] text-slate-400">Vorw. {p === undefined ? '–' : fmtNumber(p, d)}</div>
          </button>
        ))}
      </div>
    </Card>
  );
}
