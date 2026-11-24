import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { progressByExercise, progressRate, type ExerciseProgress } from '../../../domain/dashboard';
import { fmtNumber } from '../../../domain/units';
import { Card } from '../../../components/ui';
import { ALL_GYMS, STATUS, type DashboardData } from './useDashboardData';

type Bucket = 'up' | 'flat' | 'down';
const signed = (p: number) => `${p >= 0 ? '+' : ''}${fmtNumber(p * 100, 1)} %`;

/** Welche Übungen sind in den letzten 4 Wochen stärker geworden? Gyms je Übung zusammengefasst. */
export function ProgressRateCard({ data }: { data: DashboardData }) {
  const nav = useNavigate();
  const r = useMemo(
    () => progressByExercise(progressRate(data.sessions, data.sets, data.stations, data.exercises, () => true), data.stations, data.exercises),
    [data],
  );
  const [open, setOpen] = useState<Bucket | null>(null);
  const total = r.up.length + r.flat.length + r.down.length;
  const tiles: { key: Bucket; label: string; icon: string; color: string; list: ExerciseProgress[] }[] = [
    { key: 'up', label: 'gesteigert', icon: '▲', color: STATUS.hit, list: r.up },
    { key: 'flat', label: 'gehalten', icon: '▶', color: '#94a3b8', list: r.flat },
    { key: 'down', label: 'gesunken', icon: '▼', color: STATUS.miss, list: r.down },
  ];
  const gymName = new Map(data.gyms.map((g) => [g.id, g.name.split(/\s+/)[0]]));
  gymName.set(ALL_GYMS, 'alle Gyms');

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Fortschritt</h2>
        <span className="text-xs text-slate-500">letzte 4 Wochen vs. 4 davor</span>
      </div>
      {total === 0 ? (
        <p className="text-sm text-slate-500">Zu wenig Daten: Es braucht Trainings in beiden Zeiträumen.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {tiles.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={!t.list.length}
                onClick={() => setOpen(open === t.key ? null : t.key)}
                className={`rounded-lg border px-1 py-2 text-center disabled:opacity-40 ${
                  open === t.key ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <div className="text-xl font-bold tabular-nums">
                  <span className="mr-1 text-xs" style={{ color: t.color }} aria-hidden>
                    {t.icon}
                  </span>
                  {t.list.length}
                </div>
                <div className="text-[11px] text-slate-500">Übungen {t.label}</div>
              </button>
            ))}
          </div>
          <div className="flex h-2 w-full gap-0.5">
            {tiles
              .filter((t) => t.list.length)
              .map((t) => (
                <div key={t.key} className="h-full first:rounded-l last:rounded-r" style={{ width: `${(t.list.length / total) * 100}%`, background: t.color }} />
              ))}
          </div>
          {open && (
            <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
              {tiles
                .find((t) => t.key === open)!
                .list.map((ex) => (
                  <li key={ex.exerciseId} className="py-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{ex.name}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{signed(ex.pct)}</span>
                    </div>
                    {ex.parts.map((p) => (
                      <button
                        key={p.stationId}
                        type="button"
                        className="flex w-full justify-between gap-2 text-left text-xs text-slate-500"
                        onClick={() => {
                          const real = data.realStation(p.stationId);
                          nav(`/progress?tab=exercises&gym=${real.gymId}&station=${real.id}`);
                        }}
                      >
                        <span>{gymName.get(p.gymId)}</span>
                        <span className="tabular-nums">
                          {fmtNumber(p.before, p.unit === 'kg' ? 1 : 0)} → {fmtNumber(p.now, p.unit === 'kg' ? 1 : 0)} {p.unit === 'kg' ? 'kg e1RM' : 'Wdh.'} ({signed(p.pct)}) ›
                        </span>
                      </button>
                    ))}
                  </li>
                ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-500">
            Je Übung zusammengefasst. Maschinen werden immer am selben Gerät verglichen (Ø über die Gyms), Freihantel-Übungen über alle Gyms
            gemeinsam. Bestes geschätztes 1RM, bei Körpergewicht max. Wdh. Kachel antippen für die Liste.
          </p>
        </>
      )}
    </Card>
  );
}
