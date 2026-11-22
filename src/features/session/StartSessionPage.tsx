import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { listGyms } from '../../db/repositories/gyms';
import { createStation } from '../../db/repositories/stations';
import { startSession } from '../../db/repositories/sessions';
import { Button, Card, EmptyState, Field, PageHeader } from '../../components/ui';
import { useLookup } from '../../hooks/useLookup';

const FREE = '__free__';

export function StartSessionPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const lookup = useLookup();
  const gyms = useLiveQuery(() => listGyms());
  const [gymId, setGymId] = useState(params.get('gym') ?? '');
  const [dayId, setDayId] = useState(params.get('day') ?? '');

  useEffect(() => {
    if (!gymId && gyms?.length) setGymId(gyms[0].id);
  }, [gyms, gymId]);

  const mapping = useLiveQuery(async () => {
    if (!gymId || !dayId || dayId === FREE) return [];
    const pdes = (await db.planDayExercises.where('planDayId').equals(dayId).toArray()).sort((a, b) => a.order - b.order);
    return Promise.all(
      pdes.map(async (pde) => ({
        pde,
        station: await db.stations.where('[gymId+exerciseId]').equals([gymId, pde.exerciseId]).first(),
      })),
    );
  }, [gymId, dayId]);

  if (!lookup || !gyms) return null;
  if (!gyms.length)
    return (
      <>
        <PageHeader title="Training starten" back={() => nav(-1)} />
        <EmptyState title="Lege zuerst ein Gym an.">
          <Button onClick={() => nav('/manage')}>Zur Verwaltung</Button>
        </EmptyState>
      </>
    );

  const missing = mapping?.filter((m) => !m.station) ?? [];

  const createMissing = async () => {
    for (const m of missing) {
      const ex = lookup.exercises.get(m.pde.exerciseId);
      if (!ex) continue;
      await createStation({
        gymId,
        exerciseId: ex.id,
        name: ex.name,
        weightIncrement: ex.type === 'time_distance' ? 0 : 2.5,
      });
    }
  };

  const start = async () => {
    const s = await startSession(gymId, dayId && dayId !== FREE ? dayId : undefined);
    nav(`/session/${s.id}`, { replace: true });
  };

  return (
    <>
      <PageHeader title="Training starten" back={() => nav(-1)} />
      <div className="space-y-4">
        <Field label="Gym">
          <select className="input" value={gymId} onChange={(e) => setGymId(e.target.value)}>
            {gyms.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Trainingstag">
          <select className="input" value={dayId} onChange={(e) => setDayId(e.target.value)}>
            <option value="">– wählen –</option>
            {lookup.plans.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {[...lookup.planDays.values()]
                  .filter((d) => d.planId === p.id)
                  .sort((a, b) => a.order - b.order)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </optgroup>
            ))}
            <option value={FREE}>Freies Training (ohne Plan)</option>
          </select>
        </Field>

        {mapping && mapping.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Geräte in {lookup.gyms.get(gymId)?.name}</h2>
            {mapping.length === missing.length && (
              <p className="text-sm text-amber-700 dark:text-amber-300">Für diesen Tag gibt es in diesem Gym noch keine Geräte.</p>
            )}
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {mapping
                .filter((m) => m.station)
                .map(({ pde, station }) => (
                  <li key={pde.id} className="py-2 text-sm">
                    {station!.name}
                  </li>
                ))}
            </ul>
            {missing.length > 0 && (
              <details className="mt-3 text-sm text-slate-500">
                <summary className="cursor-pointer">
                  {missing.length} Plan-Übung(en) gibt es hier nicht – werden ausgeblendet
                </summary>
                <p className="mt-2">{missing.map((m) => lookup.exercises.get(m.pde.exerciseId)?.name).join(', ')}</p>
                <Button variant="secondary" className="mt-2 w-full" onClick={createMissing}>
                  Trotzdem in diesem Gym anlegen
                </Button>
              </details>
            )}
          </Card>
        )}

        <Button className="w-full" disabled={!gymId || !dayId} onClick={start}>
          Los geht&apos;s
        </Button>
      </div>
    </>
  );
}
