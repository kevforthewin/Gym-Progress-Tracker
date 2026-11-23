import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { isoToTs } from '../../db/addSessions';
import { addWeeks, isoWeek, weekStart } from '../../domain/insights';
import { fmtNumber } from '../../domain/units';
import { Tabs } from '../../components/ui';

type Range = 'days' | 'weeks' | 'months';
interface Point {
  key: string;
  label: string; // Achse
  title: string; // Anzeige oben
  value: number;
  avg: boolean; // Durchschnitt pro Tag?
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const DAY = 86400000;

function build(data: { date: string; value: number }[], range: Range): Point[] {
  const today = new Date();
  if (range === 'days') {
    const byDate = new Map(data.map((d) => [d.date, d.value]));
    return Array.from({ length: 30 }, (_, i) => {
      const t = today.getTime() - (29 - i) * DAY;
      const d = new Date(t);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { key, label: `${d.getDate()}.${d.getMonth() + 1}.`, title: WEEKDAY.format(d), value: byDate.get(key) ?? 0, avg: false };
    });
  }
  const groups = new Map<string, number[]>();
  const keyOf = (date: string) => {
    const t = isoToTs(date);
    if (range === 'weeks') return String(weekStart(t));
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  for (const d of data) groups.set(keyOf(d.date), [...(groups.get(keyOf(d.date)) ?? []), d.value]);
  const mean = (xs?: number[]) => (xs?.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  if (range === 'weeks') {
    const cur = weekStart(today.getTime());
    return Array.from({ length: 12 }, (_, i) => {
      const w = addWeeks(cur, -(11 - i));
      const end = new Date(addWeeks(w, 1) - DAY);
      const start = new Date(w);
      return {
        key: String(w),
        label: `KW${isoWeek(w)}`,
        title: `KW ${isoWeek(w)} (${start.getDate()}.${start.getMonth() + 1}.–${end.getDate()}.${end.getMonth() + 1}.)`,
        value: mean(groups.get(String(w))),
        avg: true,
      };
    });
  }
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - (11 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { key, label: MONTHS[d.getMonth()], title: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, value: mean(groups.get(key)), avg: true };
  });
}

/** Tippbares Balkendiagramm für Tageswerte (Schritte, kcal) mit Zeitraum-Umschalter. */
export function HealthBars({ data, unit, label }: { data: { date: string; value: number }[]; unit: string; label: string }) {
  const [range, setRange] = useState<Range>('days');
  const points = useMemo(() => build(data, range), [data, range]);
  // Vorauswahl: letzter Balken mit Wert (heute hat oft noch keine Daten)
  const lastWithValue = useMemo(() => {
    for (let i = points.length - 1; i >= 0; i--) if (points[i].value > 0) return i;
    return points.length - 1;
  }, [points]);
  const [sel, setSel] = useState(lastWithValue);
  useEffect(() => setSel(lastWithValue), [range, lastWithValue]);

  const withData = points.filter((p) => p.value > 0);
  const average = withData.length ? withData.reduce((a, p) => a + p.value, 0) / withData.length : 0;
  const cur = points[sel] ?? points.at(-1);
  const diff = cur && average ? Math.round(((cur.value - average) / average) * 100) : 0;
  const tickEvery = range === 'days' ? 7 : 3;

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-slate-500">{cur?.title}</p>
          <p className="text-2xl font-bold tabular-nums">
            {cur && cur.value > 0 ? fmtNumber(cur.value, 0) : '–'}
            <span className="ml-1 text-sm font-normal text-slate-500">
              {cur?.avg ? `Ø ${unit || label}/Tag` : unit || label}
            </span>
          </p>
        </div>
        {cur && cur.value > 0 && average > 0 && (
          <p className={`text-right text-xs ${diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}>
            {diff >= 0 ? '+' : ''}
            {diff} % ggü. Ø
            <br />
            <span className="text-slate-500">Ø {fmtNumber(average, 0)}</span>
          </p>
        )}
      </div>

      <div className="h-40 w-full select-none">
        <ResponsiveContainer>
          <BarChart
            data={points}
            margin={{ top: 4, right: 12, bottom: 0, left: 12 }}
            barCategoryGap={range === 'days' ? 2 : 4}
            onClick={(s) => {
              if (typeof s?.activeTooltipIndex === 'number') setSel(s.activeTooltipIndex);
            }}
            onMouseMove={(s) => {
              if (typeof s?.activeTooltipIndex === 'number') setSel(s.activeTooltipIndex);
            }}
          >
            <XAxis
              dataKey="label"
              interval={0}
              tickFormatter={(v: string, i: number) => ((points.length - 1 - i) % tickEvery === 0 ? v : '')}
              tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.6 }}
              tickLine={false}
              axisLine={{ stroke: 'currentColor', strokeOpacity: 0.2 }}
            />
            <YAxis hide domain={[0, 'auto']} />
            {average > 0 && (
              <ReferenceLine y={average} stroke="currentColor" strokeOpacity={0.45} strokeDasharray="4 4" ifOverflow="extendDomain" />
            )}
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false} minPointSize={2}>
              {points.map((p, i) => (
                <Cell key={p.key} fill={i === sel ? '#10b981' : p.value > 0 ? 'rgba(16,185,129,0.45)' : 'rgba(148,163,184,0.25)'} cursor="pointer" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Balken antippen für den Wert · gestrichelt: Durchschnitt</p>

      <div className="mt-2">
        <Tabs
          value={range}
          onChange={setRange}
          options={[
            { value: 'days', label: '30 Tage' },
            { value: 'weeks', label: '12 Wochen' },
            { value: 'months', label: '12 Monate' },
          ]}
        />
      </div>
    </div>
  );
}
