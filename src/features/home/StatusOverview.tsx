import { useState } from 'react';
import { useInsights } from '../../hooks/useInsights';
import type { StatusItem } from '../../domain/insights';
import { fmtShortDate } from '../../domain/units';
import { Card } from '../../components/ui';

type Key = 'ready' | 'prs' | 'stalled' | 'deload' | 'sides';

const TILES: { key: Key; label: string; icon: string; tone: string }[] = [
  { key: 'ready', label: 'Steigern', icon: '⬆️', tone: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'prs', label: 'Bestwerte 7 T.', icon: '🏆', tone: 'text-amber-600 dark:text-amber-300' },
  { key: 'stalled', label: 'Stagniert', icon: '⏸️', tone: 'text-slate-600 dark:text-slate-300' },
  { key: 'deload', label: 'Deload', icon: '⬇️', tone: 'text-red-600 dark:text-red-400' },
];

export function StatusOverview() {
  const data = useInsights();
  const [open, setOpen] = useState<Key | null>(null);
  if (!data) return null;
  const { status, sides } = data;
  const total = status.ready.length + status.prs.length + status.stalled.length + status.deload.length;
  if (total === 0 && sides.length === 0) return null;

  const list: StatusItem[] =
    open === 'sides'
      ? sides.map((s) => ({
          stationId: s.base,
          label: `${s.base}${s.gymName ? ` · ${s.gymName}` : ''}`,
          detail: `${s.weaker === 'links' ? 'Links' : 'Rechts'} ${s.diffPct} % schwächer`,
        }))
      : open
        ? status[open]
        : [];

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Status</h2>
      <div className="grid grid-cols-4 gap-2">
        {TILES.map((t) => {
          const n = status[t.key as Exclude<Key, 'sides'>].length;
          return (
            <button
              key={t.key}
              type="button"
              disabled={n === 0}
              onClick={() => setOpen(open === t.key ? null : t.key)}
              className={`rounded-lg border px-1 py-2 text-center transition disabled:opacity-40 ${
                open === t.key ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className={`text-xl font-bold ${t.tone}`}>{n}</div>
              <div className="text-[11px] leading-tight text-slate-500">
                <span aria-hidden>{t.icon}</span> {t.label}
              </div>
            </button>
          );
        })}
      </div>
      {sides.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(open === 'sides' ? null : 'sides')}
          className="w-full rounded-lg bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          ⚖️ {sides.length} Übung(en) mit Seitenunterschied ≥ 10 % – z. B. {sides[0].base} ({sides[0].weaker} {sides[0].diffPct} % schwächer)
        </button>
      )}
      {open && (
        <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
          {list.map((it) => (
            <li key={it.stationId + it.label} className="flex items-baseline justify-between gap-2 py-1.5">
              <span>{it.label}</span>
              <span className="shrink-0 text-right text-xs text-slate-500">
                {it.detail}
                {it.date && open === 'prs' && ` · ${fmtShortDate(it.date)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
