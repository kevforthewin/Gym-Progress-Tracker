import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { setSetting } from '../../../db/repositories/settings';
import { consistency, SPLIT_LABEL, type DayCell, type Split } from '../../../domain/dashboard';
import { isoWeek } from '../../../domain/insights';
import { fmtNumber } from '../../../domain/units';
import { Card } from '../../../components/ui';
import { CARDIO_COLOR, SPLIT_COLOR, type DashboardData } from './useDashboardData';

const WEEKS = 6;
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const DATE_FMT = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

function cellStyle(c: DayCell): React.CSSProperties {
  const colors = c.splits.map((s) => SPLIT_COLOR[s]);
  if (colors.length === 1) return { background: colors[0] };
  if (colors.length > 1) return { background: `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)` };
  if (c.cardioMin > 0) return { background: CARDIO_COLOR };
  return {};
}

/** Kalender der letzten 6 Wochen (Zeile = Woche) mit Wochenziel. */
export function ConsistencyCard({ data }: { data: DashboardData }) {
  const c = useMemo(() => consistency(data.sessions, data.cardio, data.goal, WEEKS), [data]);
  const [sel, setSel] = useState<DayCell | null>(null);
  const setGoal = (g: number) => setSetting('weeklyGoal', Math.min(7, Math.max(1, g)));
  const usedSplits = (Object.keys(SPLIT_COLOR) as Split[]).filter((s) => c.weeks.some((w) => w.days.some((d) => d.splits.includes(s))));
  const anyCardio = c.weeks.some((w) => w.days.some((d) => d.cardioMin > 0));
  const today = new Date().toDateString();

  return (
    <Card className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Konsistenz</h2>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          Ziel
          <button type="button" className="h-6 w-6 rounded bg-slate-200 dark:bg-slate-700" aria-label="Ziel verringern" onClick={() => setGoal(c.goal - 1)}>
            −
          </button>
          <span className="w-3 text-center text-sm font-semibold text-slate-900 dark:text-slate-100">{c.goal}</span>
          <button type="button" className="h-6 w-6 rounded bg-slate-200 dark:bg-slate-700" aria-label="Ziel erhöhen" onClick={() => setGoal(c.goal + 1)}>
            +
          </button>
          /Woche
        </div>
      </div>

      <dl className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-center dark:bg-slate-900/50">
        <Stat label="letzte 7 Tage" value={`${c.last7}/${c.goal}`} good={c.last7 >= c.goal} />
        <Stat
          label="Ø/Woche (4 W.)"
          value={fmtNumber(c.avg4w, 1)}
          good={c.avg4w >= c.goal}
          trend={c.avg4w - c.avg4wPrev}
        />
        <Stat
          label={c.inGoalWeeks ? (c.inGoalWeeks === 1 ? 'Woche im Ziel' : 'Wochen im Ziel') : 'unter Ziel'}
          value={c.inGoalWeeks ? String(c.inGoalWeeks) : '–'}
          good={c.inGoalWeeks > 0}
        />
      </dl>

      <div className="grid gap-[3px]" style={{ gridTemplateColumns: '2.4rem repeat(7, minmax(0, 1fr)) 2.4rem' }}>
        <span />
        {WEEKDAYS.map((d) => (
          <span key={d} className="text-center text-[10px] text-slate-500">
            {d}
          </span>
        ))}
        <span className="text-center text-[10px] text-slate-500">Σ</span>

        {c.weeks.map((w) => (
          <Week key={w.start}>
            <span className={`flex items-center text-[10px] ${w.current ? 'font-semibold text-slate-300' : 'text-slate-500'}`}>KW{isoWeek(w.start)}</span>
            {w.days.map((cell) => {
              const trained = cell.splits.length > 0;
              const isSel = sel?.date === cell.date;
              const isToday = new Date(cell.ts).toDateString() === today;
              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={cell.future}
                  onClick={() => setSel(isSel ? null : cell)}
                  aria-label={`${DATE_FMT.format(cell.ts)}${trained ? `: ${cell.splits.map((s) => SPLIT_LABEL[s]).join(', ')}` : ''}${cell.cardioMin ? `, Cardio ${cell.cardioMin} min` : ''}`}
                  className={`relative h-7 rounded-[4px] text-[10px] tabular-nums ${
                    trained
                      ? 'font-semibold text-white'
                      : cell.cardioMin
                        ? 'font-semibold text-slate-900'
                        : cell.future
                          ? 'text-slate-600'
                          : 'bg-slate-500/15 text-slate-500'
                  } ${
                    isSel ? 'outline outline-2 outline-offset-1 outline-slate-100' : isToday ? 'outline outline-1 outline-offset-1 outline-slate-400' : ''
                  }`}
                  style={cellStyle(cell)}
                >
                  {new Date(cell.ts).getDate()}
                  {trained && cell.cardioMin > 0 && (
                    <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full ring-1 ring-slate-900/60" style={{ background: CARDIO_COLOR }} />
                  )}
                </button>
              );
            })}
            <span
              className={`flex items-center justify-center text-xs tabular-nums ${
                w.goalMet ? 'font-bold text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
              }`}
            >
              {w.sessions}
              {w.goalMet && '✓'}
            </span>
          </Week>
        ))}
      </div>

      {sel && (
        <div className="rounded-lg bg-slate-50 p-2 text-sm dark:bg-slate-900/50">
          <p className="font-medium">{DATE_FMT.format(sel.ts)}</p>
          {sel.sessionIds.length === 0 && !sel.cardioMin && <p className="text-slate-500">Kein Training</p>}
          {sel.sessionIds.map((id) => {
            const info = data.sessionInfo.get(id);
            return (
              <Link key={id} to={`/session/${id}`} className="block text-emerald-600 dark:text-emerald-400">
                🏋️ {info?.dayName} · {info?.gymName} ›
              </Link>
            );
          })}
          {sel.cardioMin > 0 && <p className="text-slate-500">🏃 Cardio {fmtNumber(sel.cardioMin, 0)} min</p>}
        </div>
      )}

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {usedSplits.map((s) => (
          <li key={s} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: SPLIT_COLOR[s] }} />
            {SPLIT_LABEL[s]}
          </li>
        ))}
        {anyCardio && (
          <li className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: CARDIO_COLOR }} />
            Cardio
          </li>
        )}
        <li className="ml-auto">Tag antippen</li>
      </ul>
    </Card>
  );
}

function Stat({ label, value, good, trend }: { label: string; value: string; good?: boolean; trend?: number }) {
  const t = trend !== undefined && Math.abs(trend) >= 0.05 ? trend : undefined;
  return (
    <div>
      <dd className={`text-base font-bold tabular-nums ${good ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
        {value}
        {t !== undefined && (
          <span className="ml-1 text-[11px] font-semibold text-slate-500" title="vs. die 4 Wochen davor">
            {t > 0 ? '▲' : '▼'} {t > 0 ? '+' : '−'}
            {fmtNumber(Math.abs(t), 1)}
          </span>
        )}
      </dd>
      <dt className="text-[10px] text-slate-500">{label}</dt>
    </div>
  );
}

function Week({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
