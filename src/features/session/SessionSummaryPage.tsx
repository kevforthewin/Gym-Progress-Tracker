import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { stationSessions } from '../../db/repositories/sessions';
import type { SetEntry } from '../../db/types';
import { sessionMinutes, summarizeSession, type ExerciseSummary, type SessionSummary } from '../../domain/summary';
import { fmtDate, fmtNumber } from '../../domain/units';
import { Button, Card, EmptyState, PageHeader } from '../../components/ui';

const counted = (s: SetEntry) => !s.isWarmup && !s.excluded;
const toWork = ({ weightKg, reps, durationSec, distanceM }: SetEntry) => ({ weightKg, reps, durationSec, distanceM });

export function SessionSummaryPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id);
    if (!session) return null;
    const [sets, gym, day] = await Promise.all([
      db.sets.where('sessionId').equals(id).toArray(),
      db.gyms.get(session.gymId),
      session.planDayId ? db.planDays.get(session.planDayId) : undefined,
    ]);
    const byStation = new Map<string, SetEntry[]>();
    for (const s of sets.filter(counted).sort((a, b) => a.createdAt - b.createdAt))
      byStation.set(s.stationId, [...(byStation.get(s.stationId) ?? []), s]);

    const items = await Promise.all(
      [...byStation].map(async ([stationId, list]) => {
        const station = await db.stations.get(stationId);
        const exercise = station && (await db.exercises.get(station.exerciseId));
        const hist = (await stationSessions(stationId)).filter((h) => h.session.startedAt < session.startedAt);
        return {
          stationId,
          label: station?.name ?? '?',
          type: exercise?.type ?? 'weight_reps',
          sets: list.sort((a, b) => a.setIndex - b.setIndex).map(toWork),
          history: hist.map((h) => h.sets.map(toWork)),
        } as const;
      }),
    );
    const summary = summarizeSession(items);

    // Letzter gleicher Trainingstag (egal welches Gym)
    let previous: { date: number; workSets: number; volume: number; minutes: number | null } | null = null;
    if (session.planDayId) {
      const prev = (await db.sessions.where('planDayId').equals(session.planDayId).toArray())
        .filter((s) => s.startedAt < session.startedAt)
        .sort((a, b) => b.startedAt - a.startedAt)[0];
      if (prev) {
        const ps = (await db.sets.where('sessionId').equals(prev.id).toArray()).filter(counted);
        previous = {
          date: prev.startedAt,
          workSets: ps.length,
          volume: Math.round(ps.reduce((a, s) => a + (s.weightKg ?? 0) * (s.reps ?? 0), 0)),
          minutes: sessionMinutes(prev.startedAt, prev.finishedAt),
        };
      }
    }
    return { session, gymName: gym?.name ?? '', dayName: day?.name ?? 'Freies Training', summary, previous };
  }, [id]);

  if (data === undefined) return null;
  if (data === null)
    return (
      <>
        <PageHeader title="Zusammenfassung" back={() => nav('/')} />
        <EmptyState title="Training nicht gefunden." />
      </>
    );

  const { session, summary: s, previous } = data;
  const minutes = sessionMinutes(session.startedAt, session.finishedAt);

  return (
    <>
      <PageHeader title={s.prs.length ? 'Starkes Training 🏆' : 'Geschafft 💪'} back={() => nav('/')} />
      <p className="-mt-2 mb-4 text-sm text-slate-500">
        {data.dayName} · {data.gymName} · {fmtDate(session.startedAt)}
      </p>

      <div className="space-y-4">
        <dl className="grid grid-cols-4 gap-2 text-center">
          <Tile label="Dauer" value={minutes ? `${minutes}′` : '–'} />
          <Tile label="Übungen" value={String(s.exercises)} />
          <Tile label="Sätze" value={String(s.workSets)} />
          <Tile label="Volumen" value={s.volumeKg >= 10000 ? `${fmtNumber(s.volumeKg / 1000, 1)} t` : `${fmtNumber(s.volumeKg, 0)} kg`} />
        </dl>

        {previous && <Comparison summary={s} minutes={minutes} previous={previous} dayName={data.dayName} />}

        {s.exercises === 0 ? (
          <EmptyState title="Keine gewerteten Sätze in diesem Training." />
        ) : (
          <>
            <Group title="🏆 Neue Bestwerte" items={s.prs} accent="text-amber-600 dark:text-amber-300" />
            <Group title="▲ Gesteigert" items={s.up} accent="text-emerald-600 dark:text-emerald-400" />
            <Group title="▶ Wie letztes Mal" items={s.same} accent="text-slate-500" />
            <Group title="▼ Weniger als letztes Mal" items={s.down} accent="text-red-600 dark:text-red-400" />
            <Group title="✨ Zum ersten Mal" items={s.first} accent="text-sky-600 dark:text-sky-300" />
            <p className="text-[11px] text-slate-500">
              Verglichen mit dem letzten Training am selben Gerät (Freihantel: über alle Gyms). Bestwert = bestes geschätztes 1RM bisher. Aufwärm- und
              „zählt nicht“-Sätze sind nicht enthalten.
            </p>
          </>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => nav(`/session/${session.id}`)}>
            Training ansehen
          </Button>
          <Button className="flex-1" onClick={() => nav('/', { replace: true })}>
            Fertig
          </Button>
        </div>
      </div>
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 py-2 dark:border-slate-700">
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
      <dt className="text-[11px] text-slate-500">{label}</dt>
    </div>
  );
}

function Delta({ label, now, before, unit = '', pct = false }: { label: string; now: number; before: number; unit?: string; pct?: boolean }) {
  const diff = now - before;
  const text = pct && before ? `${diff >= 0 ? '+' : '−'}${fmtNumber(Math.abs((diff / before) * 100), 0)} %` : `${diff >= 0 ? '+' : '−'}${fmtNumber(Math.abs(diff), 0)}${unit}`;
  return (
    <li className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums">
        {fmtNumber(before, 0)}
        {unit} → <strong>{fmtNumber(now, 0)}{unit}</strong>{' '}
        <span className={diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : diff < 0 ? 'text-slate-500' : 'text-slate-500'}>({text})</span>
      </span>
    </li>
  );
}

function Comparison({
  summary,
  minutes,
  previous,
  dayName,
}: {
  summary: SessionSummary;
  minutes: number | null;
  previous: { date: number; workSets: number; volume: number; minutes: number | null };
  dayName: string;
}) {
  return (
    <Card className="space-y-1.5 text-sm">
      <h2 className="font-semibold">
        vs. letztes {dayName} <span className="font-normal text-slate-500">({fmtDate(previous.date)})</span>
      </h2>
      <ul className="space-y-1">
        <Delta label="Sätze" now={summary.workSets} before={previous.workSets} />
        <Delta label="Volumen" now={summary.volumeKg} before={previous.volume} unit=" kg" pct />
        {minutes && previous.minutes && <Delta label="Dauer" now={minutes} before={previous.minutes} unit=" min" />}
      </ul>
    </Card>
  );
}

function Group({ title, items, accent }: { title: string; items: ExerciseSummary[]; accent: string }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-1.5 text-sm font-semibold">
        {title} <span className="font-normal text-slate-500">· {items.length}</span>
      </h2>
      <Card className="divide-y divide-slate-200 p-0 dark:divide-slate-700">
        {items.map((it) => (
          <div key={it.stationId} className="flex items-baseline justify-between gap-2 px-4 py-2 text-sm">
            <span>{it.label}</span>
            <span className="shrink-0 text-right">
              <span className="tabular-nums">{it.best}</span>
              <span className={`ml-2 text-xs ${accent}`}>{it.detail}</span>
            </span>
          </div>
        ))}
      </Card>
    </section>
  );
}
