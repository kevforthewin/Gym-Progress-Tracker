import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../db/schema';
import { isoToTs } from '../../db/addSessions';
import { addWeeks, isoWeek, weekStart } from '../../domain/insights';
import { fmtDate, fmtNumber } from '../../domain/units';
import { Card } from '../../components/ui';
import { ProgressChart } from './ProgressChart';
import { HealthCard } from './HealthCard';

/** Körper-Auswertung (nur Diagramme – Eingaben laufen über „Heute“). */
export function BodyView() {
  return (
    <div className="space-y-4">
      <BodyweightChart />
      <HealthCard />
      <CardioChart />
    </div>
  );
}

function BodyweightChart() {
  const entries = useLiveQuery(() => db.bodyweights.orderBy('date').toArray());
  if (!entries) return null;
  const last = entries.at(-1);
  const ref30 = entries.find((e) => isoToTs(e.date) >= Date.now() - 30 * 86400000);
  const delta = last && ref30 && last !== ref30 ? last.weightKg - ref30.weightKg : undefined;

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Körpergewicht</h2>
        {last && (
          <span className="text-sm">
            <strong>{fmtNumber(last.weightKg, 1)} kg</strong>
            {delta !== undefined && (
              <span className="ml-1 text-xs text-slate-500">
                ({delta >= 0 ? '+' : ''}
                {fmtNumber(delta, 1)} kg / 30 T.)
              </span>
            )}
          </span>
        )}
      </div>
      {entries.length >= 2 ? (
        <ProgressChart format={(v) => `${fmtNumber(v, 1)} kg`} data={entries.map((e) => ({ date: isoToTs(e.date), value: e.weightKg, pr: false }))} />
      ) : (
        <p className="text-sm text-slate-500">
          Ab zwei Einträgen siehst du den Verlauf. Eintragen über <strong>Heute → ⚖️ Gewicht</strong> (oder automatisch aus Apple Health).
        </p>
      )}
      {entries.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">Alle Einträge ({entries.length})</summary>
          <ul className="mt-1 divide-y divide-slate-200 dark:divide-slate-700">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="flex justify-between py-1">
                <span>{fmtDate(isoToTs(e.date))}</span>
                <span>
                  {fmtNumber(e.weightKg, 1)} kg
                  <button type="button" className="ml-3 text-slate-400" aria-label="Eintrag löschen" onClick={() => db.bodyweights.delete(e.id)}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function CardioChart() {
  const entries = useLiveQuery(() => db.cardio.toArray());
  if (!entries) return null;
  const thisWeek = weekStart(Date.now());
  const weeks = Array.from({ length: 12 }, (_, i) => addWeeks(thisWeek, -(11 - i)));
  const perWeek = weeks.map((w) => entries.filter((e) => weekStart(isoToTs(e.date)) === w).reduce((a, e) => a + e.durationMin, 0));
  const maxMin = Math.max(150, ...perWeek);
  const since = addWeeks(thisWeek, -11);
  const byKind = new Map<string, number>();
  for (const e of entries.filter((x) => isoToTs(x.date) >= since)) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + e.durationMin);

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Cardio</h2>
        <Link to="/history?type=cardio" className="text-sm text-emerald-600 dark:text-emerald-400">
          Einträge ›
        </Link>
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">
          Noch kein Cardio. Eintragen über <strong>Heute → 🏃 Cardio</strong> – Apple-Watch-Workouts kommen über Health automatisch.
        </p>
      ) : (
        <>
          <div>
            <p className="mb-1 text-xs text-slate-500">Minuten pro Woche (gestrichelt: 150 min)</p>
            <div className="relative flex h-28 items-end gap-1">
              <div className="absolute inset-x-0 border-t border-dashed border-slate-400/60" style={{ bottom: `${(150 / maxMin) * 100}%` }} />
              {perWeek.map((v, i) => (
                <div key={weeks[i]} className="flex h-full flex-1 flex-col justify-end" title={`KW ${isoWeek(weeks[i])}: ${v} min`}>
                  <div className="rounded-t bg-emerald-500" style={{ height: `${(v / maxMin) * 100}%`, minHeight: v ? 2 : 0 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex gap-1 text-center text-[9px] text-slate-500">
              {weeks.map((w, i) => (
                <span key={w} className="flex-1">
                  {perWeek[i] ? fmtNumber(perWeek[i], 0) : '·'}
                  <br />
                  {i % 2 === 1 ? `KW${isoWeek(w)}` : ''}
                </span>
              ))}
            </div>
          </div>
          {byKind.size > 0 && (
            <p className="text-xs text-slate-500">
              12 Wochen:{' '}
              {[...byKind]
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k} ${fmtNumber(v, 0)} min`)
                .join(' · ')}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
