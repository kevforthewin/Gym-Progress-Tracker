import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { deleteSession, finishSession, setsForSession, updateSession } from '../../db/repositories/sessions';
import { createStation } from '../../db/repositories/stations';
import { bodyweightOn, isoDate, upsertBodyweight } from '../../db/repositories/body';
import type { PlanDayExercise, SetEntry, Station } from '../../db/types';
import type { Prescription } from '../../domain/progression';
import { fmtDate, parseNum } from '../../domain/units';
import { useLookup } from '../../hooks/useLookup';
import { Button, Card, EmptyState, Modal, PageHeader } from '../../components/ui';
import { ExerciseCard, type SwapOption, type UnitMember } from './ExerciseCard';
import { groupPlanUnits, groupStations } from './units';

export const DEFAULT_PRESCRIPTION: Prescription = { sets: 3, repMin: 8, repMax: 12 };

const prescriptionOf = (pde?: PlanDayExercise): Prescription =>
  pde
    ? { sets: pde.sets, repMin: pde.repMin, repMax: pde.repMax, targetDurationSec: pde.targetDurationSec, targetDistanceM: pde.targetDistanceM }
    : DEFAULT_PRESCRIPTION;

export function ActiveSessionPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const lookup = useLookup();
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);

  const data = useLiveQuery(async () => {
    const session = await db.sessions.get(id);
    if (!session) return { session: undefined };
    const [sets, pdes, gymStations, bodyweight] = await Promise.all([
      setsForSession(id),
      session.planDayId
        ? db.planDayExercises.where('planDayId').equals(session.planDayId).sortBy('order')
        : Promise.resolve([] as PlanDayExercise[]),
      db.stations.where('gymId').equals(session.gymId).toArray(),
      bodyweightOn(isoDate(session.startedAt)),
    ]);
    return { session, sets, pdes, gymStations, bodyweight };
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
  const { sets, pdes, gymStations, bodyweight } = data as {
    sets: SetEntry[];
    pdes: PlanDayExercise[];
    gymStations: Station[];
    bodyweight?: number;
  };
  const exercises = lookup.exercises;

  const setsByStation = new Map<string, SetEntry[]>();
  for (const s of sets) setsByStation.set(s.stationId, [...(setsByStation.get(s.stationId) ?? []), s]);

  const stationForExercise = (exerciseId: string) =>
    gymStations.filter((s) => s.exerciseId === exerciseId).sort((a, b) => b.createdAt - a.createdAt)[0];

  const memberOf = (station: Station, pde?: PlanDayExercise): UnitMember | null => {
    const exercise = exercises.get(station.exerciseId);
    return exercise ? { station, exercise, prescription: prescriptionOf(pde), sets: setsByStation.get(station.id) ?? [] } : null;
  };

  // ---- Plan-Einheiten (inkl. Tausch) ----
  const swaps = session.swaps ?? {};
  const units = groupPlanUnits(pdes, exercises).map((u) => {
    const swapIds = swaps[u.key];
    const stations = swapIds
      ? swapIds.map((sid) => lookup.stations.get(sid)).filter((s): s is Station => !!s)
      : u.pdes.map((p) => stationForExercise(p.exerciseId)).filter((s): s is Station => !!s);
    const members = stations.map((st, i) => memberOf(st, u.pdes[i] ?? u.pdes[0])).filter((m): m is UnitMember => !!m);
    const title = swapIds && members[0] ? groupStations(stations, exercises)[0]?.base ?? u.base : u.base;
    return { ...u, members, swapped: !!swapIds, title };
  });
  const shown = units.filter((u) => u.members.length > 0);
  const unmapped = units.filter((u) => u.members.length === 0);
  const usedStationIds = new Set(shown.flatMap((u) => u.members.map((m) => m.station.id)));

  // ---- Extras: Stationen mit Sätzen oder manuell hinzugefügt ----
  const extraStations = [...new Set([...setsByStation.keys(), ...extraIds])]
    .filter((sid) => !usedStationIds.has(sid))
    .map((sid) => lookup.stations.get(sid))
    .filter((s): s is Station => !!s);
  const extraGroups = groupStations(extraStations, exercises);

  const alternativesFor = (u: (typeof units)[number]): SwapOption[] => {
    const exIds = [...u.pdes.map((p) => p.exerciseId), ...u.members.map((m) => m.exercise.id)];
    const group = exIds.map((x) => exercises.get(x)?.alternativeGroup).find(Boolean);
    if (!group) return [];
    const candidates = gymStations.filter((st) => exercises.get(st.exerciseId)?.alternativeGroup === group);
    return groupStations(candidates, exercises)
      .filter((g) => g.base !== u.title && g.base !== u.base)
      .map((g) => ({ key: g.base, title: g.base, stationIds: g.stations.map((s) => s.id) }))
      .sort((a, b) => a.title.localeCompare(b.title));
  };

  const doSwap = (unitKey: string, opt: SwapOption | null) => {
    const next = { ...swaps };
    if (opt) next[unitKey] = opt.stationIds;
    else delete next[unitKey];
    return updateSession(session.id, { swaps: next });
  };

  const dayName = lookup.planDays.get(session.planDayId ?? '')?.name ?? 'Freies Training';
  const gym = lookup.gyms.get(session.gymId);

  const finish = async () => {
    await finishSession(session.id);
    nav(`/session/${session.id}/summary`, { replace: true });
  };

  // ---- Karten in Trainings-Reihenfolge (eigene Reihenfolge dieses Trainings hat Vorrang vor dem Plan) ----
  type CardItem = { key: string; title: string; members: UnitMember[]; plan?: (typeof shown)[number] };
  const natural: CardItem[] = [
    ...shown.map((u) => ({ key: u.key, title: u.title, members: u.members, plan: u })),
    ...extraGroups
      .map((g) => ({ key: `extra:${g.base}`, title: g.base, members: g.stations.map((st) => memberOf(st)).filter((m): m is UnitMember => !!m) }))
      .filter((c) => c.members.length),
  ];
  const savedOrder = session.order ?? [];
  const cards = [
    ...savedOrder.map((k) => natural.find((c) => c.key === k)).filter((c): c is CardItem => !!c),
    ...natural.filter((c) => !savedOrder.includes(c.key)),
  ];
  const isDone = (c: CardItem) =>
    c.members.reduce((a, m) => a + m.sets.filter((s) => !s.isWarmup).length, 0) >= c.members.reduce((a, m) => a + m.prescription.sets, 0);
  const reorder = (key: string, action: 'next' | 'up' | 'down') => {
    const keys = cards.map((c) => c.key);
    const i = keys.indexOf(key);
    if (i < 0) return;
    keys.splice(i, 1);
    if (action === 'up') keys.splice(Math.max(0, i - 1), 0, key);
    else if (action === 'down') keys.splice(Math.min(keys.length, i + 1), 0, key);
    else {
      // "Als Nächstes": vor die erste noch offene Übung
      const rest = cards.filter((c) => c.key !== key);
      const firstOpen = rest.findIndex((c) => !isDone(c));
      keys.splice(firstOpen < 0 ? keys.length : firstOpen, 0, key);
    }
    return updateSession(session.id, { order: keys });
  };
  const remove = async () => {
    if (!confirm('Training inkl. aller Sätze löschen?')) return;
    await deleteSession(session.id);
    nav('/', { replace: true });
  };

  const shownIds = new Set([...usedStationIds, ...extraStations.map((s) => s.id)]);
  const available = groupStations(
    gymStations.filter((s) => !shownIds.has(s.id)),
    exercises,
  ).sort((a, b) => a.base.localeCompare(b.base));

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
            <Button variant="secondary" onClick={() => nav(`/session/${session.id}/summary`)} className="min-h-9 px-3 py-1 text-sm">
              Zusammenfassung
            </Button>
          )
        }
      />
      <p className="-mt-2 mb-4 text-sm text-slate-500">
        {gym?.name} · {fmtDate(session.startedAt)}
      </p>

      <div className="space-y-3">
        {cards.map((c, i) => (
          <ExerciseCard
            key={c.key}
            sessionId={session.id}
            title={c.title}
            members={c.members}
            alternatives={c.plan ? alternativesFor(c.plan) : undefined}
            swapped={c.plan?.swapped}
            onSwap={c.plan ? (opt) => doSwap(c.plan!.key, opt) : undefined}
            onReorder={(a) => reorder(c.key, a)}
            canUp={i > 0}
            canDown={i < cards.length - 1}
          />
        ))}

        <Button variant="secondary" className="w-full" onClick={() => setAddOpen(true)}>
          + Übung hinzufügen
        </Button>

        {unmapped.length > 0 && (
          <details className="rounded-xl border border-dashed border-slate-300 px-4 py-2 text-sm text-slate-500 dark:border-slate-700">
            <summary className="cursor-pointer py-1">
              {unmapped.length} Plan-Übung(en) gibt es in {gym?.name} nicht
            </summary>
            <ul className="mt-1 divide-y divide-slate-200 dark:divide-slate-700">
              {unmapped.map((u) => (
                <li key={u.key} className="flex items-center justify-between py-1.5">
                  <span>{u.base}</span>
                  <Button
                    variant="ghost"
                    className="min-h-9 px-2 text-sm"
                    onClick={async () => {
                      for (const p of u.pdes) {
                        const ex = exercises.get(p.exerciseId);
                        if (ex)
                          await createStation({ gymId: session.gymId, exerciseId: ex.id, name: ex.name, weightIncrement: ex.type === 'time_distance' ? 0 : 2.5 });
                      }
                    }}
                  >
                    Hier anlegen
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}

        <Card className="space-y-3">
          <label className="block">
            <span className="label">Körpergewicht (kg, optional)</span>
            <input
              key={bodyweight ?? 'none'}
              className="input"
              inputMode="decimal"
              defaultValue={bodyweight ?? ''}
              onBlur={(e) => upsertBodyweight(isoDate(session.startedAt), parseNum(e.target.value))}
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
            {available.map((g) => (
              <li key={g.base}>
                <button
                  type="button"
                  className="w-full py-3 text-left"
                  onClick={() => {
                    setExtraIds((x) => [...x, ...g.stations.map((s) => s.id)]);
                    setAddOpen(false);
                  }}
                >
                  {g.base}
                  {g.stations.length === 2 && <span className="ml-1 text-xs text-slate-500">(L/R)</span>}
                  <span className="ml-2 text-xs text-slate-500">{exercises.get(g.stations[0].exerciseId)?.muscleGroup}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
