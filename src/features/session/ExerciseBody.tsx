import { useEffect, useMemo, useState } from 'react';
import type { ExcludeReason, Exercise, SetEntry, Station } from '../../db/types';
import { addSet, deleteSet, updateSet } from '../../db/repositories/sets';
import { computeTarget, type Prescription, type SessionHistory, type WorkSet } from '../../domain/progression';
import { fmtDuration, parseDuration, parseNum } from '../../domain/units';
import { Button, Stepper } from '../../components/ui';
import { fmtSet } from './format';

export const REASON_STYLE = {
  first: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  increase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  repeat: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  deload: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
} as const;
export const REASON_LABEL = { first: 'Start', increase: 'Steigern', repeat: 'Halten', deload: 'Deload' } as const;
export const EXCLUDE_LABEL: Record<ExcludeReason, string> = { unsauber: 'unsauber', ersatz: 'Ersatz', sonstiges: 'zählt nicht' };

type Rating = 'ok' | ExcludeReason;

export function useTarget(
  station: Station,
  exercise: Exercise,
  prescription: Prescription,
  history: SessionHistory[] | undefined,
) {
  return useMemo(
    () =>
      history &&
      computeTarget({
        type: exercise.type,
        prescription,
        increment: station.weightIncrement,
        steps: station.weightSteps,
        startWeight: station.startWeight,
        history,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, exercise.type, JSON.stringify(prescription), station.weightIncrement, station.startWeight, JSON.stringify(station.weightSteps)],
  );
}

interface Props {
  sessionId: string;
  station: Station;
  exercise: Exercise;
  prescription: Prescription;
  sets: SetEntry[];
  history: SessionHistory[] | undefined;
  /** Überschrift innerhalb einer Paar-Karte ("Links"/"Rechts"). */
  subtitle?: string;
}

/** Ziel, geloggte Sätze und Eingabe für EINE Station. */
export function ExerciseBody({ sessionId, station, exercise, prescription, sets, history, subtitle }: Props) {
  const target = useTarget(station, exercise, prescription, history);
  const workSets = sets.filter((s) => !s.isWarmup);
  const last = history?.at(-1);
  const isEndurance = exercise.type === 'time_distance';

  const [editing, setEditing] = useState<SetEntry | null>(null);
  const [weight, setWeight] = useState<number | undefined>();
  const [reps, setReps] = useState<number | undefined>();
  const [duration, setDuration] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [warmup, setWarmup] = useState(false);
  const [rating, setRating] = useState<Rating>('ok');

  const nextTarget: WorkSet | undefined = target?.sets[workSets.length] ?? target?.sets.at(-1);
  const lastLogged = workSets.at(-1);
  /** Alle geplanten Sätze geschafft -> weitere Sätze sind Zusatzsätze. */
  const extra = !!target && workSets.length >= target.sets.length;
  const targetKey = target ? JSON.stringify(target.sets) : '';

  useEffect(() => {
    if (editing || !target) return;
    setWeight(lastLogged?.weightKg ?? nextTarget?.weightKg);
    // Zusatzsatz: mit dem letzten Satz vorbelegen
    setReps(extra && lastLogged?.reps ? lastLogged.reps : nextTarget?.reps);
    setDuration(nextTarget?.durationSec !== undefined ? fmtDuration(nextTarget.durationSec) : '');
    setDistanceKm(nextTarget?.distanceM ? String(nextTarget.distanceM / 1000) : '');
    setWarmup(false);
    setRating('ok');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workSets.length, targetKey, editing]);

  const startEdit = (s: SetEntry) => {
    setEditing(s);
    setWeight(s.weightKg);
    setReps(s.reps);
    setDuration(s.durationSec !== undefined ? fmtDuration(s.durationSec) : '');
    setDistanceKm(s.distanceM ? String(s.distanceM / 1000) : '');
    setWarmup(s.isWarmup);
    setRating(s.excluded ? (s.excludeReason ?? 'sonstiges') : 'ok');
  };

  const values = (): Partial<SetEntry> | null => {
    if (isEndurance) {
      const durationSec = parseDuration(duration);
      const km = parseNum(distanceKm);
      if (durationSec === undefined && km === undefined) return null;
      return { durationSec, distanceM: km !== undefined ? Math.round(km * 1000) : undefined };
    }
    if (!reps) return null;
    if (exercise.type === 'weight_reps' && weight === undefined) return null;
    return { weightKg: weight ?? 0, reps };
  };
  const v = values();

  const save = async () => {
    if (!v) return;
    const flags = rating === 'ok' ? { excluded: false, excludeReason: undefined } : { excluded: true, excludeReason: rating };
    if (editing) {
      await updateSet(editing.id, { ...v, isWarmup: warmup, ...flags });
      setEditing(null);
    } else {
      await addSet({ sessionId, stationId: station.id, exerciseId: exercise.id, isWarmup: warmup, ...v, ...flags });
    }
  };

  if (!target) return null;

  return (
    <div className="space-y-3">
      {subtitle && (
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">{subtitle}</h4>
          <span className="text-xs text-slate-500">
            {workSets.length}/{target.sets.length}
          </span>
        </div>
      )}
      <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
        <div className="mb-1 flex items-center gap-2">
          <span className={`chip ${REASON_STYLE[target.reason]}`}>{REASON_LABEL[target.reason]}</span>
          <span className="text-sm font-semibold">Ziel: {target.sets.map((s) => fmtSet(exercise.type, s)).join(', ')}</span>
        </div>
        <p className="text-xs text-slate-500">{target.message}</p>
        {station.notes && <p className="mt-1 text-xs italic text-slate-500">📝 {station.notes}</p>}
        {last && <p className="mt-1 text-xs text-slate-500">Letztes Mal: {last.sets.map((s) => fmtSet(exercise.type, s)).join(', ')}</p>}
      </div>

      {sets.length > 0 && (
        <ol className="space-y-1">
          {sets.map((s) => {
            const idx = workSets.indexOf(s);
            const t = idx >= 0 ? target.sets[idx] : undefined;
            const hit = !s.excluded && t && !isEndurance && (s.reps ?? 0) >= (t.reps ?? 0) && (s.weightKg ?? 0) >= (t.weightKg ?? 0);
            return (
              <li
                key={s.id}
                className={`flex items-center justify-between rounded-md px-3 py-1.5 text-sm ${
                  editing?.id === s.id ? 'ring-2 ring-emerald-500' : ''
                } ${s.excluded ? 'bg-slate-100/50 text-slate-500 dark:bg-slate-800/60' : 'bg-slate-100 dark:bg-slate-700/50'}`}
              >
                <button type="button" className="flex-1 text-left" onClick={() => startEdit(s)}>
                  <span className="mr-2 text-slate-400">{s.isWarmup ? 'W' : idx + 1}.</span>
                  <span className={s.excluded ? 'line-through decoration-slate-400' : ''}>{fmtSet(exercise.type, s)}</span>
                  {hit && <span className="ml-2 text-emerald-600 dark:text-emerald-400">✓</span>}
                  {s.excluded && (
                    <span className="chip ml-2 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                      {EXCLUDE_LABEL[s.excludeReason ?? 'sonstiges']}
                    </span>
                  )}
                </button>
                <button type="button" className="px-2 text-slate-400" aria-label="Satz löschen" onClick={() => deleteSet(s.id)}>
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
      )}

      <div className="flex gap-2">
        {isEndurance ? (
          <>
            <label className="flex-1">
              <span className="label">Dauer (mm:ss)</span>
              <input className="input text-center" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="20:00" />
            </label>
            <label className="flex-1">
              <span className="label">Distanz (km)</span>
              <input className="input text-center" inputMode="decimal" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} placeholder="optional" />
            </label>
          </>
        ) : (
          <>
            <Stepper
              label={exercise.type === 'bodyweight' ? 'Zusatz' : 'Gewicht'}
              suffix="kg"
              value={weight}
              onChange={setWeight}
              step={station.weightIncrement || 1}
              steps={station.weightSteps}
            />
            <Stepper label="Wdh." value={reps} onChange={(n) => setReps(n === undefined ? undefined : Math.round(n * 2) / 2)} step={1} />
          </>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} className="h-5 w-5" />
          Aufwärmen
        </label>
        <select
          className={`input w-auto px-2 py-1.5 text-sm ${rating !== 'ok' ? 'border-amber-500 text-amber-700 dark:text-amber-300' : ''}`}
          value={rating}
          onChange={(e) => setRating(e.target.value as Rating)}
          aria-label="Wertung"
        >
          <option value="ok">✓ zählt</option>
          <option value="unsauber">unsauber</option>
          <option value="ersatz">Ersatz</option>
          <option value="sonstiges">zählt nicht</option>
        </select>
      </div>
      <div className="flex gap-2">
        {editing && (
          <Button variant="ghost" onClick={() => setEditing(null)}>
            Abbrechen
          </Button>
        )}
        <Button className="flex-1" disabled={!v} onClick={save}>
          {editing ? 'Satz aktualisieren' : extra ? `${workSets.length + 1}. Satz speichern (zusätzlich)` : 'Satz speichern'}
        </Button>
      </div>
      {extra && !editing && (
        <p className="-mt-1 text-center text-xs text-slate-500">
          Geplante Sätze geschafft. Zusatzsätze zählen fürs Volumen, das Ziel bewertet die ersten {target.sets.length}.
        </p>
      )}
    </div>
  );
}
