import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { guessSharedAcrossGyms } from '../../domain/exerciseDefaults';
import type { Exercise, ExerciseType } from '../../db/types';
import { EXERCISE_TYPE_LABEL } from '../../domain/labels';
import { Button, Field } from '../../components/ui';

export type ExerciseInput = Pick<Exercise, 'name' | 'type' | 'muscleGroup' | 'notes' | 'alternativeGroup' | 'sharedAcrossGyms'>;

export function ExerciseForm({
  initial,
  onSubmit,
  submitLabel = 'Speichern',
}: {
  initial?: Partial<ExerciseInput>;
  onSubmit: (v: ExerciseInput) => void | Promise<void>;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<ExerciseType>(initial?.type ?? 'weight_reps');
  const [muscleGroup, setMuscle] = useState(initial?.muscleGroup ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [alt, setAlt] = useState(initial?.alternativeGroup ?? '');
  // Neue Übung: Vorschlag nach Name, bis der Nutzer selbst entscheidet
  const [shared, setShared] = useState<boolean | null>(initial?.sharedAcrossGyms ?? null);
  const sharedValue = shared ?? guessSharedAcrossGyms(name);
  const options = useLiveQuery(async () => {
    const all = await db.exercises.toArray();
    const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
    return {
      muscles: uniq(all.map((e) => e.muscleGroup)),
      groups: uniq(all.map((e) => e.alternativeGroup)),
      members: all.filter((e) => e.alternativeGroup && e.name !== initial?.name),
    };
  }, [initial?.name]);
  const groupMembers = alt.trim() ? options?.members.filter((e) => e.alternativeGroup === alt.trim()).map((e) => e.name) ?? [] : [];
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim())
          onSubmit({
            name: name.trim(),
            type,
            // '' = bewusst leer (wird nicht automatisch neu vorbelegt)
            muscleGroup: muscleGroup.trim() || (initial ? '' : undefined),
            alternativeGroup: alt.trim() || (initial ? '' : undefined),
            sharedAcrossGyms: sharedValue,
            notes: notes.trim() || undefined,
          });
      }}
    >
      <Field label="Name">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Brustpresse" autoFocus />
      </Field>
      <Field label="Typ">
        <select className="input" value={type} onChange={(e) => setType(e.target.value as ExerciseType)}>
          {Object.entries(EXERCISE_TYPE_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Muskelgruppe (optional)">
        <input className="input" list="muscle-options" value={muscleGroup} onChange={(e) => setMuscle(e.target.value)} placeholder="z. B. Brust" />
        <datalist id="muscle-options">
          {options?.muscles.map((m) => <option key={m} value={m} />)}
        </datalist>
      </Field>
      <div>
        <Field label="Alternativ-Gruppe (optional)">
          <input className="input" list="group-options" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="z. B. Hintere Schulter" />
          <datalist id="group-options">
            {options?.groups.map((g) => <option key={g} value={g} />)}
          </datalist>
        </Field>
        <p className="mt-1 text-xs text-slate-500">
          {groupMembers.length
            ? `Tauschbar mit: ${groupMembers.join(', ')}`
            : 'Übungen mit gleicher Gruppe kannst du im Training gegeneinander tauschen.'}
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5" checked={sharedValue} onChange={(e) => setShared(e.target.checked)} />
        <span>
          🌐 Gym-übergreifend (Freihantel)
          <span className="block text-xs text-slate-500">
            Historie und Ziel über alle Gyms gemeinsam – sinnvoll bei Lang-/Kurzhanteln und Körpergewicht, nicht bei Maschinen.
          </span>
        </span>
      </label>
      <Field label="Notiz (optional)">
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" disabled={!name.trim()}>
        {submitLabel}
      </Button>
    </form>
  );
}
