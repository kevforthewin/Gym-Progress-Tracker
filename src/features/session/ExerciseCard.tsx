import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, SetEntry, Station } from '../../db/types';
import { stationHistory } from '../../db/repositories/sessions';
import { addSet, deleteSet, updateSet } from '../../db/repositories/sets';
import { computeTarget, type Prescription, type WorkSet } from '../../domain/progression';
import { fmtDuration, parseDuration, parseNum } from '../../domain/units';
import { Button, Card, Stepper } from '../../components/ui';
import { fmtSet } from './format';

const REASON_STYLE = {
  first: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  increase: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  repeat: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  deload: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
} as const;
const REASON_LABEL = { first: 'Start', increase: 'Steigern', repeat: 'Halten', deload: 'Deload' } as const;

interface Props {
  sessionId: string;
  station: Station;
  exercise: Exercise;
  prescription: Prescription;
  sets: SetEntry[];
}

export function ExerciseCard({ sessionId, station, exercise, prescription, sets }: Props) {
  const history = useLiveQuery(() => stationHistory(station.id, sessionId), [station.id, sessionId]);
  const target = useMemo(
    () =>
      history &&
      computeTarget({
        type: exercise.type,
        prescription,
        increment: station.weightIncrement,
        startWeight: station.startWeight,
        history,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, exercise.type, JSON.stringify(prescription), station.weightIncrement, station.startWeight],
  );

  const workSets = sets.filter((s) => !s.isWarmup);
  const done = target ? workSets.length >= target.sets.length : false;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (done) setOpen(false);
  }, [done]);

  const last = history?.at(-1);
  const isEndurance = exercise.type === 'time_distance';

  // ---- Eingabe-Zustand ----
  const [editing, setEditing] = useState<SetEntry | null>(null);
  const [weight, setWeight] = useState<number | undefined>();
  const [reps, setReps] = useState<number | undefined>();
  const [duration, setDuration] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [warmup, setWarmup] = useState(false);

  const nextTarget: WorkSet | undefined = target?.sets[workSets.length] ?? target?.sets.at(-1);
  const lastLogged = workSets.at(-1);
  const targetKey = target ? JSON.stringify(target.sets) : '';

  useEffect(() => {
    if (editing || !target) return;
    setWeight(lastLogged?.weightKg ?? nextTarget?.weightKg);
    setReps(nextTarget?.reps);
    setDuration(nextTarget?.durationSec !== undefined ? fmtDuration(nextTarget.durationSec) : '');
    setDistanceKm(nextTarget?.distanceM ? String(nextTarget.distanceM / 1000) : '');
    setWarmup(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workSets.length, targetKey, editing]);

  const startEdit = (s: SetEntry) => {
    setEditing(s);
    setWeight(s.weightKg);
    setReps(s.reps);
    setDuration(s.durationSec !== undefined ? fmtDuration(s.durationSec) : '');
    setDistanceKm(s.distanceM ? String(s.distanceM / 1000) : '');
    setWarmup(s.isWarmup);
    setOpen(true);
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
    if (editing) {
      await updateSet(editing.id, { ...v, isWarmup: warmup });
      setEditing(null);
    } else {
      await addSet({ sessionId, stationId: station.id, exerciseId: exercise.id, isWarmup: warmup, ...v });
    }
  };

  return (
    <Card className={done ? 'opacity-90' : ''}>
      <button type="button" className="flex w-full items-start justify-between text-left" onClick={() => setOpen((o) => !o)}>
        <div>
          <h3 className="text-lg font-bold">
            {done && <span className="text-emerald-600 dark:text-emerald-400">✓ </span>}
            {exercise.name}
          </h3>
          <p className="text-xs text-slate-500">
            {station.name !== exercise.name && `${station.name} · `}
            {isEndurance ? `${prescription.sets} Satz/Sätze` : `${prescription.sets} × ${prescription.repMin}–${prescription.repMax}`}
            {station.settingsNote && ` · ${station.settingsNote}`}
          </p>
        </div>
        <span className="text-sm text-slate-500">
          {workSets.length}/{target?.sets.length ?? prescription.sets}
        </span>
      </button>

      {open && target && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
            <div className="mb-1 flex items-center gap-2">
              <span className={`chip ${REASON_STYLE[target.reason]}`}>{REASON_LABEL[target.reason]}</span>
              <span className="text-sm font-semibold">Ziel: {target.sets.map((s) => fmtSet(exercise.type, s)).join(', ')}</span>
            </div>
            <p className="text-xs text-slate-500">{target.message}</p>
            {last && (
              <p className="mt-1 text-xs text-slate-500">
                Letztes Mal: {last.sets.map((s) => fmtSet(exercise.type, s)).join(', ')}
              </p>
            )}
          </div>

          {sets.length > 0 && (
            <ol className="space-y-1">
              {sets.map((s) => {
                const idx = workSets.indexOf(s);
                const t = idx >= 0 ? target.sets[idx] : undefined;
                const hit = t && !isEndurance && (s.reps ?? 0) >= (t.reps ?? 0) && (s.weightKg ?? 0) >= (t.weightKg ?? 0);
                return (
                  <li key={s.id} className="flex items-center justify-between rounded-md bg-slate-100 px-3 py-1.5 text-sm dark:bg-slate-700/50">
                    <button type="button" className="flex-1 text-left" onClick={() => startEdit(s)}>
                      <span className="mr-2 text-slate-400">{s.isWarmup ? 'W' : idx + 1}.</span>
                      {fmtSet(exercise.type, s)}
                      {hit && <span className="ml-2 text-emerald-600 dark:text-emerald-400">✓</span>}
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
                />
                <Stepper label="Wdh." value={reps} onChange={(n) => setReps(n === undefined ? undefined : Math.round(n))} step={1} />
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={warmup} onChange={(e) => setWarmup(e.target.checked)} className="h-5 w-5" />
              Aufwärmsatz
            </label>
            <div className="flex-1" />
            {editing && (
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Abbrechen
              </Button>
            )}
            <Button disabled={!v} onClick={save}>
              {editing ? 'Aktualisieren' : 'Satz speichern'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
