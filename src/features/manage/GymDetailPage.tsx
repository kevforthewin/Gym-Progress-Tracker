import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../../db/schema';
import { deleteGym, updateGym } from '../../db/repositories/gyms';
import { createStation, deleteStation, updateStation } from '../../db/repositories/stations';
import { createExercise } from '../../db/repositories/exercises';
import type { Station } from '../../db/types';
import { fmtKg, parseNum } from '../../domain/units';
import { Button, Card, EmptyState, Field, Modal, PageHeader } from '../../components/ui';
import { ExerciseForm } from './ExerciseForm';

const NEW = '__new__';

export function GymDetailPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const data = useLiveQuery(async () => {
    const gym = await db.gyms.get(id);
    const stations = await db.stations.where('gymId').equals(id).toArray();
    const exercises = await db.exercises.orderBy('name').toArray();
    return { gym, stations, exercises };
  }, [id]);
  const [editing, setEditing] = useState<Station | 'new' | null>(null);

  if (!data) return null;
  const { gym, stations, exercises } = data;
  if (!gym) return <EmptyState title="Gym nicht gefunden." />;
  const exName = (eid: string) => exercises.find((e) => e.id === eid)?.name ?? '?';

  return (
    <>
      <PageHeader title={gym.name} back={() => nav('/manage?tab=gyms')} />
      <Card className="mb-4 space-y-3">
        <Field label="Name">
          <input className="input" defaultValue={gym.name} onBlur={(e) => e.target.value.trim() && updateGym(gym.id, { name: e.target.value.trim() })} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={gym.archived} onChange={(e) => updateGym(gym.id, { archived: e.target.checked })} />
          Archiviert (nicht mehr bei Trainingsstart anzeigen)
        </label>
      </Card>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-semibold">Geräte ({stations.length})</h2>
        <Button className="min-h-9 py-1 text-sm" onClick={() => setEditing('new')}>
          + Gerät
        </Button>
      </div>
      {stations.length === 0 ? (
        <EmptyState title="Noch keine Geräte in diesem Gym." />
      ) : (
        <Card className="divide-y divide-slate-200 p-0 dark:divide-slate-700">
          {[...stations].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
            <button key={s.id} type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => setEditing(s)}>
              <div>
                <p>{s.name}</p>
                <p className="text-xs text-slate-500">
                  {s.name !== exName(s.exerciseId) && `${exName(s.exerciseId)} · `}
                  {s.settingsNote}
                </p>
              </div>
              <span className="text-xs text-slate-500">{s.weightIncrement ? `±${fmtKg(s.weightIncrement)}` : ''}</span>
            </button>
          ))}
        </Card>
      )}

      <Button
        variant="ghost"
        className="mt-6 w-full text-red-600 dark:text-red-400"
        onClick={async () => {
          if (!confirm(`Gym „${gym.name}" inkl. aller Geräte, Trainings und Sätze endgültig löschen?`)) return;
          await deleteGym(gym.id);
          nav('/manage?tab=gyms', { replace: true });
        }}
      >
        Gym löschen
      </Button>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Neues Gerät' : 'Gerät bearbeiten'}>
        {editing && (
          <StationForm
            key={editing === 'new' ? 'new' : editing.id}
            gymId={gym.id}
            station={editing === 'new' ? undefined : editing}
            exercises={exercises}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
    </>
  );
}

function StationForm({
  gymId,
  station,
  exercises,
  onDone,
}: {
  gymId: string;
  station?: Station;
  exercises: { id: string; name: string; type: string }[];
  onDone: () => void;
}) {
  const [exerciseId, setExerciseId] = useState(station?.exerciseId ?? exercises[0]?.id ?? NEW);
  const [name, setName] = useState(station?.name ?? '');
  const [inc, setInc] = useState(String(station?.weightIncrement ?? 2.5));
  const [start, setStart] = useState(station?.startWeight !== undefined ? String(station.startWeight) : '');
  const [note, setNote] = useState(station?.settingsNote ?? '');
  const [notes, setNotes] = useState(station?.notes ?? '');

  if (exerciseId === NEW && !station) {
    return (
      <>
        <p className="mb-3 text-sm text-slate-500">Neue Übung anlegen, danach Gerät dazu konfigurieren.</p>
        <ExerciseForm
          submitLabel="Übung anlegen"
          onSubmit={async (v) => {
            const ex = await createExercise(v);
            setExerciseId(ex.id);
            setName(ex.name);
            if (ex.type === 'time_distance') setInc('0');
          }}
        />
        {exercises.length > 0 && (
          <Button variant="ghost" className="mt-2 w-full" onClick={() => setExerciseId(exercises[0].id)}>
            Bestehende Übung wählen
          </Button>
        )}
      </>
    );
  }

  const ex = exercises.find((e) => e.id === exerciseId);
  const endurance = ex?.type === 'time_distance';

  const save = async () => {
    const values = {
      exerciseId,
      name: name.trim() || ex?.name || 'Gerät',
      weightIncrement: parseNum(inc) ?? 0,
      startWeight: parseNum(start),
      settingsNote: note.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    if (station) await updateStation(station.id, values);
    else await createStation({ gymId, ...values });
    onDone();
  };

  return (
    <div className="space-y-3">
      <Field label="Übung">
        <select
          className="input"
          value={exerciseId}
          disabled={!!station}
          onChange={(e) => {
            setExerciseId(e.target.value);
            const n = exercises.find((x) => x.id === e.target.value)?.name;
            if (n && !name) setName(n);
          }}
        >
          {exercises.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
          {!station && <option value={NEW}>+ Neue Übung …</option>}
        </select>
      </Field>
      <Field label="Gerätename (z. B. Hersteller/Nummer)">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={ex?.name} />
      </Field>
      {!endurance && (
        <div className="flex gap-2">
          <Field label="Gewichtssprung (kg)">
            <input className="input" inputMode="decimal" value={inc} onChange={(e) => setInc(e.target.value)} />
          </Field>
          <Field label="Startgewicht (kg)">
            <input className="input" inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} placeholder="optional" />
          </Field>
        </div>
      )}
      <Field label="Einstellungen (Sitzhöhe, Polster …)">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Sitz 4, Lehne 2" />
      </Field>
      <Field label="Hinweise">
        <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="z. B. Technik, Alternativen, Historie" />
      </Field>
      <Button className="w-full" onClick={save}>
        Speichern
      </Button>
      {station && (
        <Button
          variant="ghost"
          className="w-full text-red-600 dark:text-red-400"
          onClick={async () => {
            if (!confirm('Gerät löschen?')) return;
            if (await deleteStation(station.id)) onDone();
            else alert('Dieses Gerät hat bereits Trainingsdaten und kann nicht gelöscht werden.');
          }}
        >
          Gerät löschen
        </Button>
      )}
    </div>
  );
}
