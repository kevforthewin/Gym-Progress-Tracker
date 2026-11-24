import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { progressRate, targetAdherence, type ProgressItem } from '../../../domain/dashboard';
import { isoWeek } from '../../../domain/insights';
import { fmtNumber } from '../../../domain/units';
import { Card } from '../../../components/ui';
import { STATUS, type DashboardData } from './useDashboardData';

const pct = (n: number) => `${Math.round(n * 100)} %`;
const gymShort = (data: DashboardData, stationId: string) => {
  const gymId = data.stations.find((s) => s.id === stationId)?.gymId;
  return data.gyms.find((g) => g.id === gymId)?.name.split(/\s+/)[0] ?? '';
};

/** Wie oft wurde das Ziel der App erreicht? (nachgerechnet wie damals vorgeschlagen) */
export function AdherenceCard({ data }: { data: DashboardData }) {
  // Nur Plan-Übungen: nur dort gibt es eine echte Vorgabe (Sätze, Wdh.-Bereich)
  const a = useMemo(
    () => targetAdherence(data.sessions, data.sets, data.stations.filter((s) => data.inPlan.has(s.exerciseId)), data.exercises, data.rxFor),
    [data],
  );
  const last4 = a.weeks.slice(-4).reduce((s, w) => ({ hit: s.hit + w.hit, near: s.near + w.near, miss: s.miss + w.miss }), { hit: 0, near: 0, miss: 0 });
  const total4 = last4.hit + last4.near + last4.miss;
  const [sel, setSel] = useState<number | null>(null);
  const w = sel !== null ? a.weeks[sel] : null;

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Ziel-Erfüllung</h2>
        <span className="text-xs text-slate-500">letzte 4 Wochen</span>
      </div>
      {total4 === 0 ? (
        <p className="text-sm text-slate-500">Noch keine Trainings mit Ziel in den letzten 4 Wochen.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-3xl font-bold tabular-nums">{pct(last4.hit / total4)}</p>
              <p className="text-xs text-slate-500">
                {last4.hit} von {total4} Zielsätzen erreicht
              </p>
            </div>
            <ul className="space-y-0.5 text-right text-xs">
              <Legend color={STATUS.hit} label="erreicht" value={last4.hit} />
              <Legend color={STATUS.near} label="knapp (−1 Wdh.)" value={last4.near} />
              <Legend color={STATUS.miss} label="verfehlt" value={last4.miss} />
            </ul>
          </div>
          <div className="flex h-3 w-full gap-0.5" role="img" aria-label={`erreicht ${last4.hit}, knapp ${last4.near}, verfehlt ${last4.miss}`}>
            {(['hit', 'near', 'miss'] as const)
              .filter((k) => last4[k] > 0)
              .map((k) => (
                <div key={k} className="h-full first:rounded-l last:rounded-r" style={{ width: `${(last4[k] / total4) * 100}%`, background: STATUS[k] }} />
              ))}
          </div>

          {/* 8 Wochen: 100-%-Säulen, oben Anteil erreicht */}
          <div>
            <div className="flex h-24 items-end gap-1.5">
              {a.weeks.map((wk, i) => {
                const t = wk.hit + wk.near + wk.miss;
                return (
                  <button
                    key={wk.start}
                    type="button"
                    onClick={() => setSel(sel === i ? null : i)}
                    className={`flex h-full flex-1 flex-col justify-end rounded ${sel === i ? 'bg-slate-500/15' : ''}`}
                    aria-label={`KW ${isoWeek(wk.start)}: ${t ? pct(wk.hit / t) : 'keine Daten'}`}
                  >
                    <span className="mb-0.5 text-center text-[10px] tabular-nums text-slate-500">{t ? pct(wk.hit / t).replace(' ', '') : ''}</span>
                    {/* 100-%-Säule: Anteile je Woche direkt vergleichbar */}
                    <span className={`flex flex-col-reverse gap-px overflow-hidden rounded ${t ? '' : 'bg-slate-500/15'}`} style={{ height: '78%' }}>
                      {(['hit', 'near', 'miss'] as const).map((k) =>
                        wk[k] ? <span key={k} style={{ height: `${(wk[k] / t) * 100}%`, background: STATUS[k] }} /> : null,
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-1 flex gap-1.5 text-center text-[10px] text-slate-500">
              {a.weeks.map((wk) => (
                <span key={wk.start} className="flex-1">
                  KW{isoWeek(wk.start)}
                </span>
              ))}
            </div>
            {w && (
              <p className="mt-1 text-xs text-slate-500">
                KW {isoWeek(w.start)}: {w.hit} erreicht · {w.near} knapp · {w.miss} verfehlt
              </p>
            )}
          </div>

          {a.worst.length > 0 && a.worst[0].rate < 0.7 && (
            <div className="text-xs">
              <p className="mb-0.5 text-slate-500">Am häufigsten verfehlt (8 Wochen):</p>
              {a.worst
                .filter((x) => x.rate < 0.7)
                .map((x) => (
                  <p key={x.stationId}>
                    {x.label}
                    {data.gyms.length > 1 && <span className="text-slate-500"> · {gymShort(data, x.stationId)}</span>}{' '}
                    <span className="text-slate-500">– {pct(x.rate)} von {x.total} Sätzen erreicht</span>
                  </p>
                ))}
            </div>
          )}
          <p className="text-[11px] text-slate-500">
            Verglichen wird mit dem Ziel, das die App vor dem jeweiligen Training vorgeschlagen hat (nur Übungen im Plan). Sätze mit „zählt nicht“ werden ignoriert.
          </p>
        </>
      )}
    </Card>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <li className="flex items-center justify-end gap-1.5">
      <span className="text-slate-500">{label}</span>
      <span className="w-6 font-semibold tabular-nums">{value}</span>
      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} />
    </li>
  );
}

type Bucket = 'up' | 'flat' | 'down';

/** Welche Übungen sind in den letzten 4 Wochen stärker geworden? */
export function ProgressRateCard({ data }: { data: DashboardData }) {
  const nav = useNavigate();
  const r = useMemo(() => progressRate(data.sessions, data.sets, data.stations, data.exercises, () => true), [data]);
  const [open, setOpen] = useState<Bucket | null>(null);
  const total = r.up.length + r.flat.length + r.down.length;
  const tiles: { key: Bucket; label: string; icon: string; color: string; list: ProgressItem[] }[] = [
    { key: 'up', label: 'gesteigert', icon: '▲', color: STATUS.hit, list: r.up },
    { key: 'flat', label: 'gehalten', icon: '▶', color: '#94a3b8', list: r.flat },
    { key: 'down', label: 'gesunken', icon: '▼', color: STATUS.miss, list: r.down },
  ];
  const gymOf = new Map(data.stations.map((s) => [s.id, s.gymId]));
  const gymName = new Map(data.gyms.map((g) => [g.id, g.name.split(/\s+/)[0]]));

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
                <div className="text-[11px] text-slate-500">{t.label}</div>
              </button>
            ))}
          </div>
          {/* Anteil als Balken */}
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
                .list.map((it) => (
                  <li key={it.stationId}>
                    <button
                      type="button"
                      className="flex w-full items-baseline justify-between gap-2 py-1.5 text-left"
                      onClick={() => nav(`/progress?tab=exercises&gym=${gymOf.get(it.stationId)}&station=${it.stationId}`)}
                    >
                      <span>
                        {it.label}
                        {data.gyms.length > 1 && <span className="text-xs text-slate-500"> · {gymName.get(gymOf.get(it.stationId) ?? '')}</span>}
                      </span>
                      <span className="shrink-0 text-right text-xs text-slate-500">
                        {fmtNumber(it.before, it.unit === 'kg' ? 1 : 0)} → <strong className="text-slate-900 dark:text-slate-100">{fmtNumber(it.now, it.unit === 'kg' ? 1 : 0)}</strong>{' '}
                        {it.unit === 'kg' ? 'kg e1RM' : 'Wdh.'} ({it.pct >= 0 ? '+' : ''}
                        {fmtNumber(it.pct * 100, 1)} %)
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <p className="text-[11px] text-slate-500">Je Gerät das beste geschätzte 1RM (bei Körpergewicht: max. Wdh.). Kachel antippen für die Liste.</p>
        </>
      )}
    </Card>
  );
}
