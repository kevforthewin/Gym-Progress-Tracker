import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/schema';
import {
  addPlanDayExercise,
  createPlanDay,
  deletePlan,
  deletePlanDay,
  deletePlanDayExercise,
  moveItem,
  updatePlan,
  updatePlanDay,
  updatePlanDayExercise,
} from '../../db/repositories/plans';
import type { Exercise, PlanDay, PlanDayExercise } from '../../db/types';
import { fmtDistance, fmtDuration, parseDuration, parseNum } from '../../domain/units';
import { Button, Card, EmptyState, Field, Modal, PageHeader } from '../../components/ui';

export function PlanDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const data = useLiveQuery(async () => {
    const plan = await db.plans.get(id);
    const days = (await db.planDays.where('planId').equals(id).toArray()).sort((a, b) => a.order - b.order);
    const pdes = await db.planDayExercises.where('planDayId').anyOf(days.map((d) => d.id)).toArray();
    const exercises = await db.exercises.orderBy('name').toArray();
    return { plan, days, pdes, exercises };
  }, [id]);
  const [dayName, setDayName] = useState('');
  const [editing, setEditing] = useState<{ day: PlanDay; pde?: PlanDayExercise } | null>(null);

  if (!data) return null;
  const { plan, days, pdes, exercises } = data;
  if (!plan) return <EmptyState title="Plan nicht gefunden." />;
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  return (
    <>
      <PageHeader title={plan.name} back={() => nav('/manage?tab=plans')} />
      <Card className="mb-4">
        <Field label="Planname">
          <input className="input" defaultValue={plan.name} onBlur={(e) => e.target.value.trim() && updatePlan(plan.id, { name: e.target.value.trim() })} />
        </Field>
      </Card>

      <div className="space-y-4">
        {days.map((day, di) => {
          const list = pdes.filter((p) => p.planDayId === day.id).sort((a, b) => a.order - b.order);
          return (
            <Card key={day.id}>
              <div className="mb-2 flex items-center gap-2">
                <input
                  className="input flex-1 font-semibold"
                  defaultValue={day.name}
                  aria-label="Name des Trainingstags"
                  onBlur={(e) => e.target.value.trim() && updatePlanDay(day.id, { name: e.target.value.trim() })}
                />
                <Button variant="ghost" className="px-2" disabled={di === 0} onClick={() => moveItem('planDays', days, day.id, -1)} aria-label="Tag nach oben">
                  ↑
                </Button>
                <Button variant="ghost" className="px-2" disabled={di === days.length - 1} onClick={() => moveItem('planDays', days, day.id, 1)} aria-label="Tag nach unten">
                  ↓
                </Button>
              </div>
              {list.length === 0 && <p className="py-2 text-sm text-slate-500">Noch keine Übungen.</p>}
              <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                {list.map((p, i) => {
                  const ex = exMap.get(p.exerciseId);
                  return (
                    <li key={p.id} className="flex items-center gap-1 py-2">
                      <button type="button" className="flex-1 text-left" onClick={() => setEditing({ day, pde: p })}>
                        <p>{ex?.name ?? '?'}</p>
                        <p className="text-xs text-slate-500">{describe(p, ex)}</p>
                      </button>
                      <Button variant="ghost" className="min-h-9 px-2" disabled={i === 0} onClick={() => moveItem('planDayExercises', list, p.id, -1)} aria-label="nach oben">
                        ↑
                      </Button>
                      <Button variant="ghost" className="min-h-9 px-2" disabled={i === list.length - 1} onClick={() => moveItem('planDayExercises', list, p.id, 1)} aria-label="nach unten">
                        ↓
                      </Button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setEditing({ day })} disabled={!exercises.length}>
                  + Übung
                </Button>
                <Button
                  variant="ghost"
                  className="text-red-600"
                  onClick={() => confirm(`Tag „${day.name}" löschen? (Trainings bleiben erhalten)`) && deletePlanDay(day.id)}
                >
                  Tag löschen
                </Button>
              </div>
            </Card>
          );
        })}

        {!exercises.length && <p className="text-sm text-amber-700">Lege zuerst Übungen unter Verwalten → Übungen an.</p>}

        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!dayName.trim()) return;
            await createPlanDay(plan.id, dayName);
            setDayName('');
          }}
        >
          <input className="input" value={dayName} onChange={(e) => setDayName(e.target.value)} placeholder="Neuer Tag, z. B. Push" />
          <Button type="submit" disabled={!dayName.trim()}>
            + Tag
          </Button>
        </form>

        <Button
          variant="ghost"
          className="w-full text-red-600"
          onClick={async () => {
            if (!confirm(`Plan „${plan.name}" löschen? Trainings bleiben erhalten.`)) return;
            await deletePlan(plan.id);
            nav('/manage?tab=plans', { replace: true });
          }}
        >
          Plan löschen
        </Button>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.pde ? 'Übung im Plan' : `Übung zu ${editing?.day.name ?? ''}`}>
        {editing && (
          <PdeForm key={editing.pde?.id ?? 'new'} day={editing.day} pde={editing.pde} exercises={exercises} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </>
  );
}

function describe(p: PlanDayExercise, ex?: Exercise) {
  if (ex?.type === 'time_distance') {
    const parts = [`${p.sets}×`];
    if (p.targetDurationSec) parts.push(fmtDuration(p.targetDurationSec));
    if (p.targetDistanceM) parts.push(fmtDistance(p.targetDistanceM));
    return parts.join(' ');
  }
  return `${p.sets} × ${p.repMin}–${p.repMax} Wdh.`;
}

function PdeForm({
  day,
  pde,
  exercises,
  onDone,
}: {
  day: PlanDay;
  pde?: PlanDayExercise;
  exercises: Exercise[];
  onDone: () => void;
}) {
  const [exerciseId, setExerciseId] = useState(pde?.exerciseId ?? exercises[0]?.id ?? '');
  const [sets, setSets] = useState(String(pde?.sets ?? 3));
  const [repMin, setRepMin] = useState(String(pde?.repMin ?? 8));
  const [repMax, setRepMax] = useState(String(pde?.repMax ?? 12));
  const [dur, setDur] = useState(pde?.targetDurationSec ? fmtDuration(pde.targetDurationSec) : '');
  const [dist, setDist] = useState(pde?.targetDistanceM ? String(pde.targetDistanceM / 1000) : '');
  const ex = exercises.find((e) => e.id === exerciseId);
  const endurance = ex?.type === 'time_distance';

  const min = parseNum(repMin) ?? 0;
  const max = parseNum(repMax) ?? 0;
  const valid = !!exerciseId && (parseNum(sets) ?? 0) >= 1 && (endurance || (min >= 1 && max >= min));

  const save = async () => {
    const km = parseNum(dist);
    const values = {
      exerciseId,
      sets: Math.round(parseNum(sets) ?? 1),
      repMin: endurance ? 0 : Math.round(min),
      repMax: endurance ? 0 : Math.round(max),
      targetDurationSec: endurance ? parseDuration(dur) : undefined,
      targetDistanceM: endurance && km !== undefined ? Math.round(km * 1000) : undefined,
    };
    if (pde) await updatePlanDayExercise(pde.id, values);
    else await addPlanDayExercise({ planDayId: day.id, ...values });
    onDone();
  };

  return (
    <div className="space-y-3">
      <Field label="Übung">
        <select className="input" value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Sätze">
          <input className="input" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} />
        </Field>
        {!endurance && (
          <>
            <Field label="Wdh. min">
              <input className="input" inputMode="numeric" value={repMin} onChange={(e) => setRepMin(e.target.value)} />
            </Field>
            <Field label="Wdh. max">
              <input className="input" inputMode="numeric" value={repMax} onChange={(e) => setRepMax(e.target.value)} />
            </Field>
          </>
        )}
      </div>
      {endurance && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ziel-Dauer (mm:ss)">
            <input className="input" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="optional" />
          </Field>
          <Field label="Ziel-Distanz (km)">
            <input className="input" inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} placeholder="optional" />
          </Field>
        </div>
      )}
      {!endurance && (
        <p className="text-xs text-slate-500">
          Doppelte Progression: Wdh. steigern bis alle Sätze {max || 'max'} erreichen, dann Gewicht um das Geräte-Inkrement erhöhen.
        </p>
      )}
      <Button className="w-full" disabled={!valid} onClick={save}>
        Speichern
      </Button>
      {pde && (
        <Button
          variant="ghost"
          className="w-full text-red-600"
          onClick={async () => {
            await deletePlanDayExercise(pde.id);
            onDone();
          }}
        >
          Aus Plan entfernen
        </Button>
      )}
    </div>
  );
}
