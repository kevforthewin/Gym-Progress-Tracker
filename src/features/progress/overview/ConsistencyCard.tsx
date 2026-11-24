import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { setSetting } from '../../../db/repositories/settings';
import { consistency, SPLIT_LABEL, type DayCell, type Split } from '../../../domain/dashboard';
import { fmtNumber } from '../../../domain/units';
import { Card } from '../../../components/ui';
import { SPLIT_COLOR, type DashboardData } from './useDashboardData';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WEEKDAYS = ['Mo', '', 'Mi', '', 'Fr', '', 'So'];
const DATE_FMT = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });

function cellStyle(c: DayCell): React.CSSProperties {
  const colors = c.splits.map((s) => SPLIT_COLOR[s]);
  if (colors.length === 1) return { background: colors[0] };
  if (colors.length > 1) return { background: `linear-gradient(135deg, ${colors[0]} 50%, ${colors[1]} 50%)` };
  return {};
}

export function ConsistencyCard({ data }: { data: DashboardData }) {
  const c = useMemo(() => consistency(data.sessions, data.cardio, data.goal), [data]);
  const [sel, setSel] = useState<DayCell | null>(null);
  const setGoal = (g: number) => setSetting('weeklyGoal', Math.min(7, Math.max(1, g)));
  const usedSplits = (Object.keys(SPLIT_COLOR) as Split[]).filter((s) => c.weeks.some((w) => w.days.some((d) => d.splits.includes(s))));

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Konsistenz</h2>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          Ziel
          <button type="button" className="h-7 w-7 rounded bg-slate-200 text-base dark:bg-slate-700" aria-label="Ziel verringern" onClick={() => setGoal(c.goal - 1)}>
            −
          </button>
          <span className="w-4 text-center text-sm font-semibold text-slate-900 dark:text-slate-100">{c.goal}</span>
          <button type="button" className="h-7 w-7 rounded bg-slate-200 text-base dark:bg-slate-700" aria-label="Ziel erhöhen" onClick={() => setGoal(c.goal + 1)}>
            +
          </button>
          / Woche
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-slate-200 py-2 dark:border-slate-700">
          <dd className={`text-xl font-bold tabular-nums ${c.thisWeek >= c.goal ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
            {c.thisWeek}/{c.goal}
          </dd>
          <dt className="text-[11px] text-slate-500">diese Woche</dt>
        </div>
        <div className="rounded-lg border border-slate-200 py-2 dark:border-slate-700">
          <dd className="text-xl font-bold tabular-nums">{c.streak}</dd>
          <dt className="text-[11px] text-slate-500">{c.streak === 1 ? 'Woche' : 'Wochen'} in Folge</dt>
        </div>
        <div className="rounded-lg border border-slate-200 py-2 dark:border-slate-700">
          <dd className="text-xl font-bold tabular-nums">{fmtNumber(c.avg12, 1)}</dd>
          <dt className="text-[11px] text-slate-500">Ø / Woche (12 W.)</dt>
        </div>
      </dl>

      {/* Kalender: Spalten = Wochen, Zeilen = Wochentage */}
      <div className="grid gap-[3px]" style={{ gridTemplateColumns: `1.4rem repeat(${c.weeks.length}, minmax(0, 1fr))` }}>
        <span />
        {c.weeks.map((w, i) => {
          const first = w.days.find((d) => d.ts && new Date(d.ts).getDate() === 1);
          const show = i === 0 || first;
          const m = new Date(first?.ts ?? w.start).getMonth();
          return (
            <span key={w.start} className="h-4 overflow-visible whitespace-nowrap text-[10px] leading-4 text-slate-500">
              {show ? MONTHS[m] : ''}
            </span>
          );
        })}
        {WEEKDAYS.map((label, d) => (
          <Row key={d} label={label}>
            {c.weeks.map((w) => {
              const cell = w.days[d];
              const trained = cell.splits.length > 0;
              const isSel = sel?.date === cell.date;
              return (
                <button
                  key={cell.date}
                  type="button"
                  disabled={cell.future}
                  onClick={() => setSel(isSel ? null : cell)}
                  aria-label={`${cell.date}${trained ? `: ${cell.splits.map((s) => SPLIT_LABEL[s]).join(', ')}` : ''}${cell.cardioMin ? `, Cardio ${cell.cardioMin} min` : ''}`}
                  className={`relative aspect-square w-full rounded-[3px] ${trained ? '' : cell.future ? 'bg-transparent' : 'bg-slate-500/15'} ${
                    !trained && cell.cardioMin ? 'ring-[1.5px] ring-inset ring-slate-400' : ''
                  } ${isSel ? 'outline outline-2 outline-offset-1 outline-slate-100' : ''}`}
                  style={cellStyle(cell)}
                >
                  {trained && cell.cardioMin > 0 && (
                    <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
                  )}
                </button>
              );
            })}
          </Row>
        ))}
        <span className="text-[10px] leading-5 text-slate-500" title="Trainings pro Woche">
          Σ
        </span>
        {c.weeks.map((w) => (
          <span
            key={w.start}
            className={`text-center text-[10px] leading-5 tabular-nums ${
              w.goalMet ? 'font-bold text-emerald-600 dark:text-emerald-400' : w.sessions ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            {w.sessions || '·'}
          </span>
        ))}
      </div>

      {sel ? (
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
      ) : (
        <p className="text-xs text-slate-500">Tag antippen für Details · Σ = Trainings pro Woche, grün = Ziel erreicht</p>
      )}

      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        {usedSplits.map((s) => (
          <li key={s} className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: SPLIT_COLOR[s] }} />
            {SPLIT_LABEL[s]}
          </li>
        ))}
        <li className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-[2px] ring-[1.5px] ring-inset ring-slate-400" />
          Cardio
        </li>
        <li className="flex items-center gap-1">
          <span className="relative h-2.5 w-2.5 rounded-[2px] bg-slate-500">
            <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90" />
          </span>
          Training + Cardio
        </li>
      </ul>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="flex items-center text-[10px] text-slate-500">{label}</span>
      {children}
    </>
  );
}
