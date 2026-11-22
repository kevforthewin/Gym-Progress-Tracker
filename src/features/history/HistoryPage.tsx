import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../db/schema';
import { fmtDate } from '../../domain/units';
import { useLookup } from '../../hooks/useLookup';
import { Card, EmptyState, PageHeader } from '../../components/ui';

export function HistoryPage() {
  const lookup = useLookup();
  const [gymId, setGymId] = useState('');
  const sessions = useLiveQuery(async () => {
    const all = await db.sessions.orderBy('startedAt').reverse().toArray();
    const filtered = gymId ? all.filter((s) => s.gymId === gymId) : all;
    const counts = await Promise.all(
      filtered.map(async (s) => {
        const sets = await db.sets.where('sessionId').equals(s.id).toArray();
        return { work: sets.filter((x) => !x.isWarmup).length, stations: new Set(sets.map((x) => x.stationId)).size };
      }),
    );
    return filtered.map((s, i) => ({ ...s, ...counts[i] }));
  }, [gymId]);

  if (!lookup || !sessions) return null;

  // Nach Monat gruppieren
  const groups = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = new Date(s.startedAt).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  return (
    <>
      <PageHeader title="Historie" />
      {lookup.gyms.size > 1 && (
        <select className="input mb-4" value={gymId} onChange={(e) => setGymId(e.target.value)} aria-label="Gym filtern">
          <option value="">Alle Gyms</option>
          {[...lookup.gyms.values()].map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}
      {sessions.length === 0 ? (
        <EmptyState title="Noch keine Trainings." />
      ) : (
        <div className="space-y-5">
          {[...groups].map(([month, list]) => (
            <section key={month}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                {month} · {list.length}×
              </h2>
              <ul className="space-y-2">
                {list.map((s) => (
                  <li key={s.id}>
                    <Link to={`/session/${s.id}`}>
                      <Card className="flex items-center justify-between py-3">
                        <div>
                          <p className="font-medium">{lookup.planDays.get(s.planDayId ?? '')?.name ?? 'Freies Training'}</p>
                          <p className="text-sm text-slate-500">
                            {fmtDate(s.startedAt)} · {lookup.gyms.get(s.gymId)?.name}
                          </p>
                        </div>
                        <div className="text-right text-sm text-slate-500">
                          {s.stations} Übungen
                          <br />
                          {s.work} Sätze
                        </div>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
