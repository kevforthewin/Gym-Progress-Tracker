import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useSearchParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { deleteCardio } from '../../db/repositories/body';
import { isoToTs } from '../../db/addSessions';
import type { CardioEntry } from '../../db/types';
import { fmtDate, fmtNumber } from '../../domain/units';
import { useLookup } from '../../hooks/useLookup';
import { Button, Card, EmptyState, Modal, PageHeader, Tabs } from '../../components/ui';

type Filter = 'all' | 'training' | 'cardio';
type Item =
  | { kind: 'training'; ts: number; id: string; gymId: string; planDayId?: string; work: number; stations: number; running: boolean }
  | { kind: 'cardio'; ts: number; entry: CardioEntry };

export function HistoryPage() {
  const lookup = useLookup();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('type') as Filter) || 'all';
  const [gymId, setGymId] = useState('');
  const [cardio, setCardio] = useState<CardioEntry | null>(null);

  const items = useLiveQuery(async () => {
    const [sessions, sets, cardioEntries] = await Promise.all([db.sessions.toArray(), db.sets.toArray(), db.cardio.toArray()]);
    const bySession = new Map<string, { work: number; stations: Set<string> }>();
    for (const s of sets) {
      const e = bySession.get(s.sessionId) ?? { work: 0, stations: new Set<string>() };
      if (!s.isWarmup) e.work++;
      e.stations.add(s.stationId);
      bySession.set(s.sessionId, e);
    }
    const list: Item[] = [
      ...sessions.map((s) => ({
        kind: 'training' as const,
        ts: s.startedAt,
        id: s.id,
        gymId: s.gymId,
        planDayId: s.planDayId,
        work: bySession.get(s.id)?.work ?? 0,
        stations: bySession.get(s.id)?.stations.size ?? 0,
        running: !s.finishedAt,
      })),
      // Cardio am Tagesende einsortieren, damit es nach dem Training desselben Tages steht
      ...cardioEntries.map((c) => ({ kind: 'cardio' as const, ts: isoToTs(c.date) + 5 * 3600_000, entry: c })),
    ];
    return list.sort((a, b) => b.ts - a.ts);
  });

  if (!lookup || !items) return null;

  // Filter nur mit Gyms, in denen es Einträge gibt (z. B. kein leeres Beispiel-Gym)
  const usedGymIds = new Set(items.flatMap((it) => (it.kind === 'training' ? [it.gymId] : it.entry.gymId ? [it.entry.gymId] : [])));
  const filterGyms = [...lookup.gyms.values()].filter((g) => usedGymIds.has(g.id));

  const shown = items.filter(
    (it) =>
      (filter === 'all' || it.kind === filter) && (!gymId || (it.kind === 'training' ? it.gymId === gymId : it.entry.gymId === gymId)),
  );
  const groups = new Map<string, Item[]>();
  for (const it of shown) {
    const key = new Date(it.ts).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    groups.set(key, [...(groups.get(key) ?? []), it]);
  }

  return (
    <>
      <PageHeader title="Verlauf" />
      <Tabs
        value={filter}
        onChange={(t) => setParams(t === 'all' ? {} : { type: t }, { replace: true })}
        options={[
          { value: 'all', label: 'Alle' },
          { value: 'training', label: 'Training' },
          { value: 'cardio', label: 'Cardio' },
        ]}
      />
      {filterGyms.length > 1 && filter !== 'cardio' && (
        <select className="input mb-4" value={gymId} onChange={(e) => setGymId(e.target.value)} aria-label="Gym filtern">
          <option value="">Alle Gyms</option>
          {filterGyms.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      )}
      {shown.length === 0 ? (
        <EmptyState title="Noch keine Einträge." />
      ) : (
        <div className="space-y-5">
          {[...groups].map(([month, list]) => {
            const t = list.filter((x) => x.kind === 'training').length;
            const c = list.filter((x) => x.kind === 'cardio');
            const cMin = c.reduce((a, x) => a + (x.kind === 'cardio' ? x.entry.durationMin : 0), 0);
            return (
              <section key={month}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {month} · {t ? `${t} Trainings` : ''}
                  {t > 0 && c.length > 0 ? ' · ' : ''}
                  {c.length ? `${fmtNumber(cMin, 0)} min Cardio` : ''}
                </h2>
                <ul className="space-y-2">
                  {list.map((it) =>
                    it.kind === 'training' ? (
                      <li key={it.id}>
                        <Link to={`/session/${it.id}`}>
                          <Card className="flex items-center justify-between py-3">
                            <div>
                              <p className="font-medium">
                                🏋️ {lookup.planDays.get(it.planDayId ?? '')?.name ?? 'Freies Training'}
                                {it.running && <span className="chip ml-2 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">läuft</span>}
                              </p>
                              <p className="text-sm text-slate-500">
                                {fmtDate(it.ts)} · {lookup.gyms.get(it.gymId)?.name}
                              </p>
                            </div>
                            <div className="text-right text-sm text-slate-500">
                              {it.stations} Übungen
                              <br />
                              {it.work} Sätze
                            </div>
                          </Card>
                        </Link>
                      </li>
                    ) : (
                      <li key={it.entry.id}>
                        <button type="button" className="w-full text-left" onClick={() => setCardio(it.entry)}>
                          <Card className="flex items-center justify-between py-3">
                            <div>
                              <p className="font-medium">
                                🏃 {it.entry.kind}
                                {it.entry.source === 'health' && <span className="ml-1 text-xs text-slate-500">⌚</span>}
                              </p>
                              <p className="text-sm text-slate-500">{fmtDate(isoToTs(it.entry.date))}</p>
                            </div>
                            <div className="text-right text-sm text-slate-500">
                              {fmtNumber(it.entry.durationMin, 0)} min
                              {it.entry.distanceKm ? (
                                <>
                                  <br />
                                  {fmtNumber(it.entry.distanceKm, 2)} km
                                </>
                              ) : null}
                            </div>
                          </Card>
                        </button>
                      </li>
                    ),
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Modal open={!!cardio} onClose={() => setCardio(null)} title={cardio ? `🏃 ${cardio.kind}` : ''}>
        {cardio && (
          <div className="space-y-3 text-sm">
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-slate-500">Datum</dt>
              <dd>{fmtDate(isoToTs(cardio.date))}</dd>
              <dt className="text-slate-500">Dauer</dt>
              <dd>{fmtNumber(cardio.durationMin, 0)} min</dd>
              {cardio.distanceKm ? (
                <>
                  <dt className="text-slate-500">Distanz</dt>
                  <dd>{fmtNumber(cardio.distanceKm, 2)} km</dd>
                </>
              ) : null}
              {cardio.avgHr ? (
                <>
                  <dt className="text-slate-500">Ø Puls</dt>
                  <dd>{cardio.avgHr} bpm</dd>
                </>
              ) : null}
              {cardio.kcal ? (
                <>
                  <dt className="text-slate-500">Energie</dt>
                  <dd>{cardio.kcal} kcal</dd>
                </>
              ) : null}
              <dt className="text-slate-500">Quelle</dt>
              <dd>{cardio.source === 'health' ? 'Apple Health ⌚' : 'manuell'}</dd>
            </dl>
            <Button
              variant="ghost"
              className="w-full text-red-600 dark:text-red-400"
              onClick={async () => {
                if (!confirm('Cardio-Eintrag löschen?')) return;
                await deleteCardio(cardio.id);
                setCardio(null);
              }}
            >
              Eintrag löschen
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
