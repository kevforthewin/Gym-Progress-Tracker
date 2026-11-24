import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { strengthHighlights, type Highlight } from '../../../domain/dashboard';
import { fmtNumber } from '../../../domain/units';
import { Card } from '../../../components/ui';
import type { DashboardData } from './useDashboardData';

const W = 140;
const H = 48;
const PAD = 4;

/** Kleine Verlaufslinie je Gym, gemeinsame y-Achse innerhalb der Kachel. */
function Sparkline({ h, color }: { h: Highlight; color: (gymId: string) => string }) {
  const all = h.series.flatMap((s) => s.points);
  const t0 = Math.min(...all.map((p) => p.ts));
  const t1 = Math.max(...all.map((p) => p.ts));
  let v0 = Math.min(...all.map((p) => p.v));
  let v1 = Math.max(...all.map((p) => p.v));
  if (v1 - v0 < 1) (v0 -= 1), (v1 += 1);
  const x = (t: number) => PAD + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * PAD);
  const y = (v: number) => H - PAD - ((v - v0) / (v1 - v0)) * (H - 2 * PAD);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-12 w-full" preserveAspectRatio="none" aria-hidden>
      {h.series.map((s) => {
        const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.ts).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
        const last = s.points[s.points.length - 1];
        return (
          <g key={s.stationId}>
            <path d={d} fill="none" stroke={color(s.gymId)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <circle cx={x(last.ts)} cy={y(last.v)} r={3} fill={color(s.gymId)} stroke="#1e293b" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
}

/** Die meisttrainierten Übungen der letzten 12 Wochen als kleine Verläufe (je Gym eine Linie). */
export function HighlightsCard({ data }: { data: DashboardData }) {
  const nav = useNavigate();
  const items = useMemo(() => strengthHighlights(data.sessions, data.sets, data.stations, data.exercises, () => true), [data]);
  const gym = new Map(data.gyms.map((g) => [g.id, g]));
  const color = (id: string) => gym.get(id)?.color ?? '#94a3b8';
  const multi = data.gyms.length > 1 && items.some((h) => h.series.length > 1);

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Kraft-Highlights</h2>
        <span className="text-xs text-slate-500">12 Wochen · e1RM</span>
      </div>
      {multi && (
        <ul className="flex gap-3 text-xs text-slate-500">
          {data.gyms.map((g) => (
            <li key={g.id} className="flex items-center gap-1">
              <span className="h-0.5 w-3 rounded" style={{ background: g.color }} />
              {g.name}
            </li>
          ))}
        </ul>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Mindestens zwei Trainings pro Übung in den letzten 12 Wochen nötig.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {items.map((h) => {
            const latest = [...h.series].sort((a, b) => b.points[b.points.length - 1].ts - a.points[a.points.length - 1].ts)[0];
            return (
              <button
                key={h.exerciseId}
                type="button"
                onClick={() => nav(`/progress?tab=exercises&gym=${latest.gymId}&station=${latest.stationId}`)}
                className="rounded-lg border border-slate-200 p-2 text-left dark:border-slate-700"
              >
                <p className="line-clamp-2 h-10 text-sm font-medium leading-5">{h.name}</p>
                <Sparkline h={h} color={color} />
                <ul className="mt-1 space-y-0.5">
                  {h.series.map((s) => (
                    <li key={s.stationId} className="flex items-baseline justify-between gap-1 text-[11px]">
                      <span className="flex min-w-0 items-center gap-1 text-slate-500">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color(s.gymId) }} />
                        <span className="truncate">{gym.get(s.gymId)?.name.split(/\s+/)[0]}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <strong>{fmtNumber(s.last, h.unit === 'kg' ? 1 : 0)}</strong>
                        <span className={s.pct > 0.005 ? 'text-emerald-600 dark:text-emerald-400' : s.pct < -0.005 ? 'text-red-600 dark:text-red-400' : 'text-slate-500'}>
                          {' '}
                          {s.pct > 0.005 ? '▲' : s.pct < -0.005 ? '▼' : '▶'}
                          {fmtNumber(Math.abs(s.pct * 100), 0)}%
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-500">
        Die {items.length || 6} Übungen mit den meisten Trainings. Werte: bestes geschätztes 1RM pro Training{items.some((h) => h.unit === 'Wdh.') ? ' (Körpergewicht: max. Wdh.)' : ''}. Antippen öffnet den Verlauf.
      </p>
    </Card>
  );
}
