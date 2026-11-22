import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type DotProps } from 'recharts';
import { fmtNumber, fmtShortDate } from '../../domain/units';

export interface Point {
  date: number;
  value: number;
  pr: boolean;
}

const LINE = '#34d399'; // emerald-400 (auf dunklem Grund)

function Dot(props: DotProps & { payload?: Point }) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined) return null;
  return payload?.pr ? (
    <circle cx={cx} cy={cy} r={6} fill="#f59e0b" stroke="var(--surface)" strokeWidth={2} />
  ) : (
    <circle cx={cx} cy={cy} r={4} fill={LINE} stroke="var(--surface)" strokeWidth={2} />
  );
}

export function ProgressChart({
  data,
  format,
  axisFormat,
}: {
  data: Point[];
  format: (v: number) => string;
  /** Achsenbeschriftung ohne Einheit (Einheit steht im Titel). */
  axisFormat?: (v: number) => string;
}) {
  return (
    <div className="h-64 w-full [--surface:#fff] dark:[--surface:#1e293b]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="currentColor" strokeOpacity={0.1} vertical={false} />
          <XAxis
            dataKey="date"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={fmtShortDate}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }}
            stroke="currentColor"
            strokeOpacity={0.2}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => (axisFormat ? axisFormat(v) : fmtNumber(v, 1))}
            tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }}
            stroke="currentColor"
            strokeOpacity={0.2}
            width={48}
            domain={['auto', 'auto']}
          />
          <Tooltip
            cursor={{ stroke: 'currentColor', strokeOpacity: 0.3 }}
            labelFormatter={(d: number) => new Date(d).toLocaleDateString('de-DE')}
            formatter={(v: number, _n, item) => [format(v) + ((item.payload as Point).pr ? ' 🏆 PR' : ''), '']}
            separator=""
            contentStyle={{ borderRadius: 8, fontSize: 13, color: '#f1f5f9', background: '#0f172a', border: '1px solid #334155' }}
            itemStyle={{ color: '#f1f5f9' }}
          />
          <Line type="monotone" dataKey="value" stroke={LINE} strokeWidth={2} dot={<Dot />} activeDot={{ r: 7 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
