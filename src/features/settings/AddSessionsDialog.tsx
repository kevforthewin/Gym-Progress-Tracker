import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import {
  analyzeImport,
  applyImport,
  exKey,
  isoToTs,
  norm,
  type ExerciseChoice,
  type ImportAnalysis,
  type ImportDecisions,
  type ImportSession,
} from '../../db/addSessions';
import { fmtDate } from '../../domain/units';
import { Button, Modal } from '../../components/ui';

interface Props {
  sessions: ImportSession[] | null;
  onClose: () => void;
  onDone: (msg: string) => void;
}

const encode = (c: ExerciseChoice) => (c.kind === 'station' ? `st:${c.stationId}` : c.kind);
const decode = (v: string): ExerciseChoice =>
  v.startsWith('st:') ? { kind: 'station', stationId: v.slice(3) } : v === 'skip' ? { kind: 'skip' } : { kind: 'new' };

export function AddSessionsDialog({ sessions, onClose, onDone }: Props) {
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [dec, setDec] = useState<ImportDecisions>({ gyms: {}, exercises: {}, sessions: {} });
  const [busy, setBusy] = useState(false);
  const lookup = useLiveQuery(async () => ({
    gyms: await db.gyms.orderBy('name').toArray(),
    stations: await db.stations.toArray(),
    days: await db.planDays.toArray(),
  }));

  useEffect(() => {
    if (!sessions) return;
    analyzeImport(sessions).then((a) => {
      setAnalysis(a);
      setDec({
        gyms: Object.fromEntries(a.gyms.map((g) => [norm(g.name), g.gymId ?? 'new'])),
        exercises: Object.fromEntries(
          a.exercises.map((e) => [
            exKey(e.gymName, e.label),
            e.stationId ? { kind: 'station', stationId: e.stationId } : ({ kind: 'new' } as ExerciseChoice),
          ]),
        ),
        sessions: Object.fromEntries(a.sessions.map((s) => [s.key, { include: !s.duplicate, date: s.date, planDayId: s.planDayId }])),
        // Neue Übungen standardmäßig in den Plan aufnehmen
        addToPlan: Object.fromEntries(
          a.exercises.filter((e) => !e.inPlan && e.planDayIds.length && !e.stationId).map((e) => [exKey(e.gymName, e.label), true]),
        ),
      });
    });
  }, [sessions]);

  const unknownExercises = useMemo(() => analysis?.exercises.filter((e) => !e.stationId) ?? [], [analysis]);
  const matchedCount = (analysis?.exercises.length ?? 0) - unknownExercises.length;
  const planCandidates = useMemo(
    () =>
      analysis?.exercises.filter(
        (e) => !e.inPlan && e.planDayIds.length && dec.exercises[exKey(e.gymName, e.label)]?.kind !== 'skip',
      ) ?? [],
    [analysis, dec.exercises],
  );
  const selected = analysis?.sessions.filter((s) => dec.sessions[s.key]?.include) ?? [];

  if (!sessions) return null;

  const run = async () => {
    if (!analysis) return;
    setBusy(true);
    try {
      const r = await applyImport(sessions, analysis, dec);
      onDone(
        `✅ ${r.sessions} Training(s) mit ${r.sets} Sätzen hinzugefügt${r.newStations ? `, ${r.newStations} Gerät(e) neu angelegt` : ''}${
          r.addedToPlan ? `, ${r.addedToPlan} Übung(en) in den Plan aufgenommen` : ''
        }.`,
      );
    } catch (e) {
      onDone(`❌ Import fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Trainings hinzufügen">
      {!analysis || !lookup ? (
        <p className="text-sm text-slate-500">Analysiere Datei …</p>
      ) : (
        <div className="space-y-4 text-sm">
          <p className="text-slate-500">Bestehende Daten bleiben erhalten. Die Trainings werden ergänzt.</p>

          {analysis.gyms.some((g) => !g.gymId) && (
            <section>
              <h3 className="mb-1 font-semibold">Unbekannte Gyms</h3>
              {analysis.gyms
                .filter((g) => !g.gymId)
                .map((g) => (
                  <label key={g.name} className="mb-2 block">
                    <span className="label">„{g.name}“</span>
                    <select
                      className="input"
                      value={dec.gyms[norm(g.name)]}
                      onChange={(e) => setDec((d) => ({ ...d, gyms: { ...d.gyms, [norm(g.name)]: e.target.value } }))}
                    >
                      <option value="new">Neu anlegen</option>
                      {lookup.gyms.map((x) => (
                        <option key={x.id} value={x.id}>
                          = {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
            </section>
          )}

          <section>
            <h3 className="mb-1 font-semibold">Übungen</h3>
            <p className="mb-2 text-slate-500">
              {matchedCount} automatisch zugeordnet{unknownExercises.length ? `, ${unknownExercises.length} unbekannt:` : '.'}
            </p>
            {unknownExercises.map((e) => {
              const k = exKey(e.gymName, e.label);
              const gymChoice = dec.gyms[norm(e.gymName)];
              const gymStations = lookup.stations
                .filter((s) => s.gymId === gymChoice)
                .sort((a, b) => a.name.localeCompare(b.name));
              return (
                <label key={k} className="mb-2 block">
                  <span className="label">
                    „{e.label}“ <span className="font-normal text-slate-500">· {e.gymName}</span>
                  </span>
                  <select
                    className="input"
                    value={encode(dec.exercises[k] ?? { kind: 'new' })}
                    onChange={(ev) => setDec((d) => ({ ...d, exercises: { ...d.exercises, [k]: decode(ev.target.value) } }))}
                  >
                    <option value="new">Als neues Gerät anlegen</option>
                    <option value="skip">Überspringen</option>
                    {gymStations.map((s) => (
                      <option key={s.id} value={`st:${s.id}`}>
                        = {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
            {unknownExercises.length > 0 && (
              <p className="text-xs text-slate-500">Zuordnungen werden gemerkt und beim nächsten Import automatisch genutzt.</p>
            )}
          </section>

          {planCandidates.length > 0 && (
            <section>
              <h3 className="mb-1 font-semibold">In den Plan aufnehmen</h3>
              <p className="mb-2 text-slate-500">Diese Übungen stehen noch nicht im Trainingstag:</p>
              {planCandidates.map((e) => {
                const k = exKey(e.gymName, e.label);
                const dayNames = e.planDayIds.map((id) => lookup.days.find((x) => x.id === id)?.name).join(', ');
                return (
                  <label key={k} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={!!dec.addToPlan?.[k]}
                      onChange={(ev) => setDec((d) => ({ ...d, addToPlan: { ...d.addToPlan, [k]: ev.target.checked } }))}
                    />
                    <span>
                      {e.label} <span className="text-slate-500">→ {dayNames}</span>
                    </span>
                  </label>
                );
              })}
            </section>
          )}

          <section>
            <h3 className="mb-1 font-semibold">Trainings ({selected.length}/{analysis.sessions.length})</h3>
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {analysis.sessions.map((s) => {
                const ds = dec.sessions[s.key];
                const dayName = lookup.days.find((d) => d.id === s.planDayId)?.name ?? 'Freies Training';
                return (
                  <li key={s.key} className="flex items-center gap-2 py-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={ds?.include ?? false}
                      aria-label="Training importieren"
                      onChange={(e) => setDec((d) => ({ ...d, sessions: { ...d.sessions, [s.key]: { ...ds, include: e.target.checked } } }))}
                    />
                    <div className="flex-1">
                      <p className="font-medium">
                        {dayName} · {s.gymName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.setCount} Sätze
                        {s.duplicate && <span className="ml-1 text-amber-600 dark:text-amber-300">· am {fmtDate(isoToTs(s.date))} schon vorhanden</span>}
                      </p>
                    </div>
                    <input
                      type="date"
                      className="input w-auto px-2 py-1 text-sm"
                      value={ds?.date ?? s.date}
                      aria-label="Datum"
                      onChange={(e) =>
                        e.target.value && setDec((d) => ({ ...d, sessions: { ...d.sessions, [s.key]: { ...ds, date: e.target.value } } }))
                      }
                    />
                  </li>
                );
              })}
            </ul>
          </section>

          <Button className="w-full" disabled={busy || selected.length === 0} onClick={run}>
            {selected.length} Training(s) hinzufügen
          </Button>
        </div>
      )}
    </Modal>
  );
}
