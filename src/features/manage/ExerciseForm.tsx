import { useState } from 'react';
import type { Exercise, ExerciseType } from '../../db/types';
import { EXERCISE_TYPE_LABEL } from '../../domain/labels';
import { Button, Field } from '../../components/ui';

export type ExerciseInput = Pick<Exercise, 'name' | 'type' | 'muscleGroup' | 'notes'>;

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
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit({ name: name.trim(), type, muscleGroup: muscleGroup.trim() || undefined, notes: notes.trim() || undefined });
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
        <input className="input" value={muscleGroup} onChange={(e) => setMuscle(e.target.value)} placeholder="z. B. Brust" />
      </Field>
      <Field label="Notiz (optional)">
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" disabled={!name.trim()}>
        {submitLabel}
      </Button>
    </form>
  );
}
