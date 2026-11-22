import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { addWeeks, isoWeek, VOLUME_TARGET, weeklySets, weekStart, type VolumeSet } from '../../domain/insights';
import { splitSide } from '../../domain/exerciseDefaults';
import { fmtNumber, fmtShortDate } from '../../domain/units';
import { Card, EmptyState } from '../../components/ui';

const WEEKS = 6;

export function VolumeView() {
  const data = useLiveQuery(async () => {
    const [sets, sessions, stations, exercises] = await Promise.all([
      db.sets.toArray(),
      db.sessions.toArray(),
      db.stations.toArray(),
      db.exercises.toArray(),
    ]);
    const start = new Map(sessions.map((s) => [s.id, s.startedAt]));
    const stEx = new Map(stations.map((s) => [s.id, s.exerciseId]));
    const ex = new Map(exercises.map((e) => [e.id, e]));
    const vs: VolumeSet[] = [];
    for (const s of sets) {
      const e = ex.get(stEx.get(s.stationId) ?? s.exerciseId);
      if (!e || e.type === 'time_distance') continue;
      vs.push({ ts: start.get(s.sessionId) ?? s.createdAt, muscleGroup: e.muscleGroup, sided: !!splitSide(e.name).side, warmup: s.isWarmup });
    }
    return weeklySets(vs);
  });

  const thisWeek = weekStart(Date.now());
  const [offset, setOffset] = useState(0);
  const week = addWeeks(thisWeek, -offset);
  const weeks = useMemo(() => Array.from({ length: WEEKS }, (_, i) => addWeeks(thisWeek, -(WEEKS - 1 - i))), [thisWeek]);

  if (!data) return null;
  if (data.size === 0) return <EmptyState title="Noch keine Trainingsdaten." />;

  const row = data.get(week) ?? new Map<string, number>();
  const muscles = [...new Set([...data.values()].flatMap((r) => [...r.keys()]))].sort((a, b) => (row.get(b) ?? 0) - (row.get(a) ?? 0) || a.localeCompare(b));
  const max = Math.max(VOLUME_TARGET.max + 4, ...muscles.map((m) => row.get(m) ?? 0));
  const pct = (v: number) => `${(v / max) * 100}%`;
  const total = [...row.values()].reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-4">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" className="rounded px-3 py-1 text-lg" onClick={() => setOffset(offset + 1)} aria-label="Vorherige Woche">
            ‹
          </button>
          <div className="text-center">
            <h2 className="font-semibold">
              KW {isoWeek(week)} {offset === 0 && <span className="font-normal text-slate-500">(aktuell)</span>}
            </h2>
            <p className="text-xs text-slate-500">
              {fmtShortDate(week)} – {fmtShortDate(addWeeks(week, 1) - 86400000)} · {fmtNumber(total, 1)} Arbeitssätze
            </p>
          </div>
          <button
            type="button"
            className="rounded px-3 py-1 text-lg disabled:opacity-30"
            disabled={offset === 0}
            onClick={() => setOffset(offset - 1)}
            aria-label="Nächste Woche"
          >
            ›
          </button>
        </div>

        <ul className="space-y-2">
          {muscles.map((m) => {
            const v = row.get(m) ?? 0;
            const inRange = v >= VOLUME_TARGET.min && v <= VOLUME_TARGET.max;
            return (
              <li key={m}>
                <div className="mb-0.5 flex justify-between text-sm">
                  <span>{m}</span>
                  <span className={`font-semibold ${v === 0 ? 'text-slate-400' : ''}`}>
                    {fmtNumber(v, 1)}
                    <span className="ml-1 text-xs font-normal text-slate-500">
                      {v === 0 ? '' : v < VOLUME_TARGET.min ? 'wenig' : inRange ? 'im Bereich' : 'viel'}
                    </span>
                  </span>
                </div>
                <div className="relative h-3 rounded-full bg-slate-200 dark:bg-slate-700">
                  {/* Orientierungsbereich 10–20 Sätze */}
                  <div
                    className="absolute inset-y-0 rounded-full bg-emerald-500/15"
                    style={{ left: pct(VOLUME_TARGET.min), width: pct(VOLUME_TARGET.max - VOLUME_TARGET.min) }}
                  />
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full ${inRange ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'}`}
                    style={{ width: pct(v) }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Arbeitssätze pro Muskelgruppe (ohne Aufwärmen; einseitig: 3 Sätze je Seite = 3). Hell hinterlegt:
          Orientierungsbereich {VOLUME_TARGET.min}–{VOLUME_TARGET.max} Sätze/Woche. Muskelgruppen legst du unter Verwalten → Übungen fest.
        </p>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Verlauf ({WEEKS} Wochen)</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="py-1 text-left font-medium">Muskel</th>
                {weeks.map((w) => (
                  <th key={w} className="px-1 py-1 text-right font-medium">
                    KW{isoWeek(w)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {muscles.map((m) => (
                <tr key={m} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-1 pr-2">{m}</td>
                  {weeks.map((w) => {
                    const v = data.get(w)?.get(m) ?? 0;
                    return (
                      <td key={w} className="px-1 py-1 text-right">
                        <span
                          className="inline-block min-w-8 rounded px-1 tabular-nums"
                          style={{ backgroundColor: v ? `rgba(16,185,129,${Math.min(0.15 + v / 30, 0.7)})` : undefined }}
                        >
                          {v ? fmtNumber(v, 1) : '·'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
