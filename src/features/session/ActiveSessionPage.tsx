import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { deleteSession, finishSession, setsForSession, updateSession } from '../../db/repositories/sessions';
import { createStation } from '../../db/repositories/stations';
import type { PlanDayExercise, SetEntry, Station } from '../../db/types';
import type { Prescription } from '../../domain/progression';
import { fmtDate, parseNum } from '../../domain/units';
import { useLookup } from '../../hooks/useLookup';
import { Button, Card, EmptyState, Modal, PageHeader } from '../../components/ui';
import { ExerciseCard } from './ExerciseCard';

export const DEFAULT_PRESCRIPTION: Prescription = { sets: 3, repMin: 8, repMax: 12 };

export function ActiveSessionPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const lookup = useLookup();
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id);
    if (!session) return { session: undefined };
    const [sets, pdes, gymStations] = await Promise.all([
      setsForSession(id),
      session.planDayId
        ? db.planDayExercises.where('planDayId').equals(session.planDayId).sortBy('order')
        : Promise.resolve([] as PlanDayExercise[]),
      db.stations.where('gymId').equals(session.gymId).toArray(),
    ]);
    return { session, sets, pdes, gymStations };
  }, [id]);

  if (!data || !lookup) return null;
  const { session } = data;
  if (!session)
    return (
      <>
        <PageHeader title="Training" back={() => nav('/')} />
        <EmptyState title="Training nicht gefunden." />
      </>
    );
  const { sets, pdes, gymStations } = data as { sets: SetEntry[]; pdes: PlanDayExercise[]; gymStations: Station[] };

  const setsByStation = new Map<string, SetEntry[]>();
  for (const s of sets) setsByStation.set(s.stationId, [...(setsByStation.get(s.stationId) ?? []), s]);

  const stationForExercise = (exerciseId: string) =>
    gymStations.filter((s) => s.exerciseId === exerciseId).sort((a, b) => b.createdAt - a.createdAt)[0];

  const planItems = pdes.map((pde) => ({ pde, station: stationForExercise(pde.exerciseId) }));
  const plannedStationIds = new Set(planItems.map((i) => i.station?.id).filter(Boolean));
  const extraStations = [...new Set([...setsByStation.keys(), ...extraIds])]
    .filter((sid) => !plannedStationIds.has(sid))
    .map((sid) => lookup.stations.get(sid))
    .filter((s): s is Station => !!s);

  const dayName = lookup.planDays.get(session.planDayId ?? '')?.name ?? 'Freies Training';
  const gym = lookup.gyms.get(session.gymId);

  const finish = async () => {
    await finishSession(session.id);
    nav('/');
  };
  const remove = async () => {
    if (!confirm('Training inkl. aller Sätze löschen?')) return;
    await deleteSession(session.id);
    nav('/', { replace: true });
  };

  const prescriptionOf = (pde?: PlanDayExercise): Prescription =>
    pde
      ? { sets: pde.sets, repMin: pde.repMin, repMax: pde.repMax, targetDurationSec: pde.targetDurationSec, targetDistanceM: pde.targetDistanceM }
      : DEFAULT_PRESCRIPTION;

  const available = gymStations
    .filter((s) => !plannedStationIds.has(s.id) && !extraStations.some((e) => e.id === s.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        title={dayName}
        back={() => nav(-1)}
        right={
          !session.finishedAt ? (
            <Button onClick={finish} className="min-h-9 px-3 py-1 text-sm">
              Beenden
            </Button>
          ) : (
            <span className="chip bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">abgeschlossen</span>
          )
        }
      />
      <p className="-mt-2 mb-4 text-sm text-slate-500">
        {gym?.name} · {fmtDate(session.startedAt)}
      </p>

      <div className="space-y-3">
        {planItems.map(({ pde, station }) => {
          const ex = lookup.exercises.get(pde.exerciseId);
          if (!ex) return null;
          if (!station)
            return (
              <Card key={pde.id} className="flex items-center justify-between">
                <div>
                  <p className="font-bold">{ex.name}</p>
                  <p className="text-xs text-slate-500">Kein Gerät in {gym?.name}</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    createStation({ gymId: session.gymId, exerciseId: ex.id, name: ex.name, weightIncrement: ex.type === 'time_distance' ? 0 : 2.5 })
                  }
                >
                  Anlegen
                </Button>
              </Card>
            );
          return (
            <ExerciseCard
              key={pde.id}
              sessionId={session.id}
              station={station}
              exercise={ex}
              prescription={prescriptionOf(pde)}
              sets={setsByStation.get(station.id) ?? []}
            />
          );
        })}

        {extraStations.map((st) => {
          const ex = lookup.exercises.get(st.exerciseId);
          return ex ? (
            <ExerciseCard
              key={st.id}
              sessionId={session.id}
              station={st}
              exercise={ex}
              prescription={DEFAULT_PRESCRIPTION}
              sets={setsByStation.get(st.id) ?? []}
            />
          ) : null;
        })}

        <Button variant="secondary" className="w-full" onClick={() => setAddOpen(true)}>
          + Übung hinzufügen
        </Button>

        <Card className="space-y-3">
          <label className="block">
            <span className="label">Körpergewicht (kg, optional)</span>
            <input
              className="input"
              inputMode="decimal"
              defaultValue={session.bodyweightKg ?? ''}
              onBlur={(e) => updateSession(session.id, { bodyweightKg: parseNum(e.target.value) })}
            />
          </label>
          <label className="block">
            <span className="label">Notizen</span>
            <textarea
              className="input"
              rows={2}
              defaultValue={session.notes ?? ''}
              onBlur={(e) => updateSession(session.id, { notes: e.target.value || undefined })}
            />
          </label>
        </Card>

        <div className="flex gap-2">
          {!session.finishedAt && (
            <Button className="flex-1" onClick={finish}>
              Training beenden
            </Button>
          )}
          <Button variant="ghost" className="text-red-600 dark:text-red-400" onClick={remove}>
            Löschen
          </Button>
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title={`Gerät in ${gym?.name ?? ''}`}>
        {available.length === 0 ? (
          <EmptyState title="Keine weiteren Geräte in diesem Gym.">
            <Button variant="secondary" onClick={() => nav(`/manage/gym/${session.gymId}`)}>
              Geräte verwalten
            </Button>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-700">
            {available.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full py-3 text-left"
                  onClick={() => {
                    setExtraIds((x) => [...x, s.id]);
                    setAddOpen(false);
                  }}
                >
                  {s.name}
                  <span className="ml-2 text-xs text-slate-500">{lookup.exercises.get(s.exerciseId)?.muscleGroup}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
