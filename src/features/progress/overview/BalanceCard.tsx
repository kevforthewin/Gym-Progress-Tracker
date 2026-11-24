import { useMemo, useState } from 'react';
import { balanceWarnings, splitBalance, SPLIT_LABEL } from '../../../domain/dashboard';
import { Card, Tabs } from '../../../components/ui';
import { SPLIT_COLOR, type DashboardData } from './useDashboardData';

type Range = '4' | '12';

const since = (n: number | undefined) => (n === undefined ? 'noch nie' : n === 0 ? 'heute' : n === 1 ? 'gestern' : `vor ${n} T.`);

/** Verteilung der Arbeitssätze auf Push / Pull / Legs. */
export function BalanceCard({ data }: { data: DashboardData }) {
  const [range, setRange] = useState<Range>('4');
  const stats = useMemo(
    () => splitBalance(data.sessions, data.sets, Date.now() - Number(range) * 7 * 86400000),
    [data, range],
  );
  const warnings = balanceWarnings(stats);
  const shown = stats.filter((s) => s.split !== 'other' || s.sets > 0);
  const total = stats.reduce((a, s) => a + s.sets, 0);

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Push / Pull / Legs</h2>
        <span className="text-xs text-slate-500">Anteil der Arbeitssätze</span>
      </div>
      <Tabs
        value={range}
        onChange={setRange}
        options={[
          { value: '4', label: '4 Wochen' },
          { value: '12', label: '12 Wochen' },
        ]}
      />

      {total === 0 ? (
        <p className="text-sm text-slate-500">Keine Trainings in diesem Zeitraum.</p>
      ) : (
        <>
          {/* 100-%-Balken mit 2px Abstand zwischen den Segmenten */}
          <div className="flex h-4 w-full gap-0.5" role="img" aria-label={shown.map((s) => `${SPLIT_LABEL[s.split]} ${Math.round(s.share * 100)} %`).join(', ')}>
            {shown
              .filter((s) => s.sets > 0)
              .map((s) => (
                <div key={s.split} className="h-full first:rounded-l last:rounded-r" style={{ width: `${s.share * 100}%`, background: SPLIT_COLOR[s.split] }} />
              ))}
          </div>

          <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
            {shown.map((s) => (
              <li key={s.split} className="flex items-center gap-2 py-1.5">
                <span className="h-3 w-3 shrink-0 rounded-[3px]" style={{ background: SPLIT_COLOR[s.split] }} />
                <span className="w-12 font-medium">{SPLIT_LABEL[s.split]}</span>
                <span className="flex-1 text-xs text-slate-500">
                  {s.sessions} Trainings · {s.sets} Sätze
                </span>
                <span className="w-10 text-right font-semibold tabular-nums">{Math.round(s.share * 100)} %</span>
                <span className={`w-16 text-right text-xs ${s.daysSince !== undefined && s.daysSince >= 10 ? 'text-amber-600 dark:text-amber-300' : 'text-slate-500'}`}>
                  {since(s.daysSince)}
                </span>
              </li>
            ))}
          </ul>

          {warnings.length ? (
            <div className="space-y-0.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              {warnings.map((w) => (
                <p key={w}>⚠️ {w}</p>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">✓ Ausgewogen – jeder Trainingstag hat mindestens 20 % der Sätze.</p>
          )}
        </>
      )}
    </Card>
  );
}
