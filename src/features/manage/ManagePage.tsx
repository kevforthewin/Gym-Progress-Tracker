import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { createGym } from '../../db/repositories/gyms';
import { createExercise, deleteExercise, updateExercise } from '../../db/repositories/exercises';
import { createPlan } from '../../db/repositories/plans';
import { getSetting, setSetting } from '../../db/repositories/settings';
import type { Exercise } from '../../db/types';
import { EXERCISE_TYPE_LABEL } from '../../domain/labels';
import { Button, Card, EmptyState, Modal, PageHeader, Tabs } from '../../components/ui';
import { ExerciseForm } from './ExerciseForm';

type Tab = 'gyms' | 'exercises' | 'plans';

export function ManagePage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'gyms';
  const nav = useNavigate();
  const title = { gyms: 'Gyms & Geräte', exercises: 'Übungen', plans: 'Trainingspläne' }[tab];
  return (
    <>
      <PageHeader title={title} back={() => nav('/settings')} />
      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        options={[
          { value: 'gyms', label: 'Gyms' },
          { value: 'exercises', label: 'Übungen' },
          { value: 'plans', label: 'Pläne' },
        ]}
      />
      {tab === 'gyms' && <GymsTab />}
      {tab === 'exercises' && <ExercisesTab />}
      {tab === 'plans' && <PlansTab />}
    </>
  );
}

function QuickAdd({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => void | Promise<void> }) {
  const [name, setName] = useState('');
  return (
    <form
      className="mb-4 flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        await onAdd(name.trim());
        setName('');
      }}
    >
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} />
      <Button type="submit" disabled={!name.trim()}>
        +
      </Button>
    </form>
  );
}

function GymsTab() {
  const gyms = useLiveQuery(async () => {
    const list = await db.gyms.orderBy('name').toArray();
    return Promise.all(list.map(async (g) => ({ ...g, stations: await db.stations.where('gymId').equals(g.id).count() })));
  });
  if (!gyms) return null;
  return (
    <>
      <QuickAdd placeholder="Neues Gym, z. B. McFit Innenstadt" onAdd={async (n) => { await createGym(n); }} />
      {gyms.length === 0 ? (
        <EmptyState title="Noch kein Gym angelegt." />
      ) : (
        <ul className="space-y-2">
          {gyms.map((g) => (
            <li key={g.id}>
              <Link to={`/manage/gym/${g.id}`}>
                <Card className="flex items-center justify-between py-3">
                  <span className="font-medium">
                    {g.name} {g.archived && <span className="chip bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">archiviert</span>}
                  </span>
                  <span className="text-sm text-slate-500">{g.stations} Geräte ›</span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ExercisesTab() {
  const exercises = useLiveQuery(() => db.exercises.orderBy('name').toArray());
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);
  if (!exercises) return null;

  const groups = new Map<string, Exercise[]>();
  for (const e of exercises) {
    const k = e.muscleGroup || 'Sonstige';
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  return (
    <>
      <Button className="mb-4 w-full" onClick={() => setEditing('new')}>
        + Neue Übung
      </Button>
      <p className="mb-3 text-xs text-slate-500">
        Übungen sind gym-übergreifend. Das konkrete Gerät (inkl. Gewichtssprung) legst du je Gym an – die Historie wird je Gerät geführt.
      </p>
      {exercises.length === 0 && <EmptyState title="Noch keine Übungen." />}
      <div className="space-y-4">
        {[...groups].sort(([a], [b]) => a.localeCompare(b)).map(([group, list]) => (
          <section key={group}>
            <h2 className="mb-1 text-sm font-semibold text-slate-500">{group}</h2>
            <Card className="divide-y divide-slate-200 p-0 dark:divide-slate-700">
              {list.map((e) => (
                <button key={e.id} type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setEditing(e)}>
                  <span>{e.name}</span>
                  <span className="text-right text-xs text-slate-500">
                    {e.alternativeGroup ? `⇄ ${e.alternativeGroup}` : EXERCISE_TYPE_LABEL[e.type]}
                  </span>
                </button>
              ))}
            </Card>
          </section>
        ))}
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Neue Übung' : 'Übung bearbeiten'}>
        {editing && (
          <>
            <ExerciseForm
              key={editing === 'new' ? 'new' : editing.id}
              initial={editing === 'new' ? undefined : editing}
              onSubmit={async (v) => {
                if (editing === 'new') await createExercise(v);
                else await updateExercise(editing.id, v);
                setEditing(null);
              }}
            />
            {editing !== 'new' && (
              <Button
                variant="ghost"
                className="mt-2 w-full text-red-600 dark:text-red-400"
                onClick={async () => {
                  if (!confirm(`„${editing.name}" löschen?`)) return;
                  if (await deleteExercise(editing.id)) setEditing(null);
                  else alert('Diese Übung hat bereits Trainingsdaten und kann nicht gelöscht werden.');
                }}
              >
                Übung löschen
              </Button>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

function PlansTab() {
  const data = useLiveQuery(async () => {
    const plans = await db.plans.orderBy('order').toArray();
    const active = await getSetting('activePlanId');
    const withDays = await Promise.all(plans.map(async (p) => ({ ...p, days: await db.planDays.where('planId').equals(p.id).count() })));
    return { plans: withDays, active: active ?? plans[0]?.id };
  });
  if (!data) return null;
  return (
    <>
      <QuickAdd
        placeholder="Neuer Plan, z. B. Ganzkörper A/B"
        onAdd={async (n) => {
          const p = await createPlan(n);
          if (!data.active) await setSetting('activePlanId', p.id);
        }}
      />
      {data.plans.length === 0 ? (
        <EmptyState title="Noch kein Plan." />
      ) : (
        <ul className="space-y-2">
          {data.plans.map((p) => (
            <li key={p.id}>
              <Card className="flex items-center gap-3 py-3">
                <input
                  type="radio"
                  name="activePlan"
                  className="h-5 w-5"
                  checked={data.active === p.id}
                  onChange={() => setSetting('activePlanId', p.id)}
                  aria-label={`${p.name} als aktiven Plan wählen`}
                />
                <Link to={`/manage/plan/${p.id}`} className="flex flex-1 items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-slate-500">{p.days} Tage ›</span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate-500">Der markierte Plan bestimmt das „Nächste Training" auf der Startseite.</p>
    </>
  );
}

