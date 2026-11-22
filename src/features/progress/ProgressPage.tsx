import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { stationSessions } from '../../db/repositories/sessions';
import type { ExerciseType } from '../../db/types';
import { personalRecords, prDates, sessionMetrics, type PrKey } from '../../domain/metrics';
import { fmtDate, fmtDistance, fmtDuration, fmtKg, fmtNumber } from '../../domain/units';
import { useLookup } from '../../hooks/useLookup';
import { Card, EmptyState, Tabs } from '../../components/ui';
import { ProgressChart } from './ProgressChart';
import { fmtSet } from '../session/format';

const METRICS: Record<ExerciseType, { key: PrKey; label: string; unit?: string; fmt: (v: number) => string; axis?: (v: number) => string }[]> = {
  weight_reps: [
    { key: 'bestE1rm', label: 'e1RM', unit: 'kg', fmt: fmtKg },
    { key: 'topWeight', label: 'Top-Gewicht', unit: 'kg', fmt: fmtKg },
    { key: 'volume', label: 'Volumen', unit: 'kg', fmt: (v) => `${fmtNumber(v, 0)} kg` },
  ],
  bodyweight: [
    { key: 'maxReps', label: 'Max. Wdh.', fmt: (v) => `${v}` },
    { key: 'topWeight', label: 'Zusatzgewicht', unit: 'kg', fmt: fmtKg },
    { key: 'volume', label: 'Volumen (Zusatz)', unit: 'kg', fmt: (v) => `${fmtNumber(v, 0)} kg` },
  ],
  time_distance: [
    { key: 'maxDistanceM', label: 'Distanz', unit: 'km', fmt: fmtDistance, axis: (v) => fmtNumber(v / 1000, 1) },
    { key: 'maxDurationSec', label: 'Dauer', unit: 'mm:ss', fmt: fmtDuration, axis: fmtDuration },
  ],
};

export function ExerciseProgress() {
  const lookup = useLookup();
  const [params, setParams] = useSearchParams();
  const gymId = params.get('gym') ?? '';
  const stationId = params.get('station') ?? '';
  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    if (k === 'gym') p.delete('station');
    setParams(p, { replace: true });
  };

  useEffect(() => {
    if (!gymId && lookup?.gyms.size) set('gym', [...lookup.gyms.values()][0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, gymId]);

  /** Überblick: alle Stationen des Gyms mit Daten, erste vs. letzte Session. */
  const overview = useLiveQuery(async () => {
    if (!gymId) return [];
    const stations = await db.stations.where('gymId').equals(gymId).toArray();
    const rows = await Promise.all(
      stations.map(async (st) => {
        const grouped = await stationSessions(st.id);
        const series = grouped.map((g) => sessionMetrics(g.session.startedAt, g.sets));
        return { station: st, series };
      }),
    );
    return rows.filter((r) => r.series.length > 0).sort((a, b) => a.station.name.localeCompare(b.station.name));
  }, [gymId]);

  // Inkl. "zählt nicht"-Sätzen (werden in der Tabelle durchgestrichen gezeigt, aber nicht ausgewertet)
  const detail = useLiveQuery(async () => (stationId ? stationSessions(stationId, { includeExcluded: true }) : undefined), [stationId]);
  const station = lookup?.stations.get(stationId);
  const exercise = station && lookup?.exercises.get(station.exerciseId);
  const metrics = exercise ? METRICS[exercise.type] : [];
  const [metricKey, setMetricKey] = useState<PrKey>('bestE1rm');
  useEffect(() => {
    if (metrics.length && !metrics.some((m) => m.key === metricKey)) setMetricKey(metrics[0].key);
  }, [metrics, metricKey]);

  const counted = useMemo(
    () => (detail ?? []).map((g) => ({ ...g, counted: g.sets.filter((s) => !s.excluded) })),
    [detail],
  );
  const series = useMemo(
    () => counted.filter((g) => g.counted.length).map((g) => sessionMetrics(g.session.startedAt, g.counted)),
    [counted],
  );
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];

  if (!lookup) return null;

  const headline = (type: ExerciseType) => METRICS[type][0];

  return (
    <>
      <div className="mb-4 flex gap-2">
        <select className="input" value={gymId} onChange={(e) => set('gym', e.target.value)} aria-label="Gym">
          {[...lookup.gyms.values()].map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <select className="input" value={stationId} onChange={(e) => set('station', e.target.value)} aria-label="Gerät">
          <option value="">Alle Geräte</option>
          {overview?.map((r) => (
            <option key={r.station.id} value={r.station.id}>
              {r.station.name}
            </option>
          ))}
        </select>
      </div>

      {!stationId && overview && (
        overview.length === 0 ? (
          <EmptyState title="Noch keine Daten in diesem Gym." />
        ) : (
          <ul className="space-y-2">
            {overview.map(({ station: st, series: s }) => {
              const ex = lookup.exercises.get(st.exerciseId);
              if (!ex) return null;
              const m = headline(ex.type);
              const first = s[0][m.key];
              const lastV = s[s.length - 1][m.key];
              const delta = first > 0 ? ((lastV - first) / first) * 100 : 0;
              return (
                <li key={st.id}>
                  <button type="button" className="w-full text-left" onClick={() => set('station', st.id)}>
                    <Card className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{st.name}</p>
                        <p className="text-xs text-slate-500">
                          {s.length} Sessions · {m.label}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">{m.fmt(lastV)}</p>
                        {s.length > 1 && (
                          <p className={`text-xs ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                            {delta >= 0 ? '▲' : '▼'} {fmtNumber(Math.abs(delta), 1)} %
                          </p>
                        )}
                      </div>
                    </Card>
                  </button>
                </li>
              );
            })}
          </ul>
        )
      )}

      {stationId && exercise && metric && (
        <div className="space-y-4">
          <Tabs value={metric.key} onChange={setMetricKey} options={metrics.map((m) => ({ value: m.key, label: m.label }))} />
          <Card>
            <h2 className="mb-2 font-semibold">
              {station?.name}: {metric.label}
              {metric.unit && <span className="font-normal text-slate-500"> ({metric.unit})</span>}
            </h2>
            {series.length < 2 ? (
              <p className="text-sm text-slate-500">Mindestens zwei Sessions nötig für einen Verlauf.</p>
            ) : (
              <ProgressChart
                format={metric.fmt}
                axisFormat={metric.axis}
                data={(() => {
                  const prs = prDates(series, metric.key);
                  return series.filter((m) => m[metric.key] > 0).map((m) => ({ date: m.date, value: m[metric.key], pr: prs.has(m.date) }));
                })()}
              />
            )}
            <p className="mt-2 text-xs text-slate-500">🟠 = neuer Bestwert</p>
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">Bestwerte</h2>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {personalRecords(series, metrics.map((m) => m.key)).map((pr) => {
                const m = metrics.find((x) => x.key === pr.key)!;
                return (
                  <div key={pr.key}>
                    <dt className="text-xs text-slate-500">{m.label}</dt>
                    <dd className="text-lg font-bold">{m.fmt(pr.value)}</dd>
                    <dd className="text-xs text-slate-500">{fmtDate(pr.date)}</dd>
                  </div>
                );
              })}
            </dl>
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">Alle Sessions</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="py-1">Datum</th>
                  <th className="py-1">Sätze</th>
                  <th className="py-1 text-right">{metric.label}</th>
                </tr>
              </thead>
              <tbody>
                {[...counted].reverse().map((g) => (
                  <tr key={g.session.id} className="border-t border-slate-200 align-top dark:border-slate-700">
                    <td className="whitespace-nowrap py-1.5 pr-2">{fmtDate(g.session.startedAt)}</td>
                    <td className="py-1.5 pr-2">
                      {g.sets.map((s, i) => (
                        <span key={s.id} className={s.excluded ? 'text-slate-400 line-through' : ''}>
                          {i > 0 && ', '}
                          {fmtSet(exercise.type, s)}
                        </span>
                      ))}
                    </td>
                    <td className="py-1.5 text-right font-medium">
                      {g.counted.length ? metric.fmt(sessionMetrics(g.session.startedAt, g.counted)[metric.key]) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
