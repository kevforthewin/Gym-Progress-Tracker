import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ExcludeReason, Exercise, SetEntry, Station } from '../../db/types';
import { db } from '../../db/schema';
import { stationHistory } from '../../db/repositories/sessions';
import type { Prescription } from '../../domain/progression';
import { compareSides } from '../../domain/insights';
import { splitSide } from '../../domain/exerciseDefaults';
import { Button, Card, Modal } from '../../components/ui';
import { ExerciseBody } from './ExerciseBody';

export interface UnitMember {
  station: Station;
  exercise: Exercise;
  prescription: Prescription;
  sets: SetEntry[];
}

export interface SwapOption {
  key: string;
  title: string;
  stationIds: string[];
}

interface Props {
  sessionId: string;
  title: string;
  members: UnitMember[];
  /** Tauschbare Alternativen im aktuellen Gym. */
  alternatives?: SwapOption[];
  onSwap?: (opt: SwapOption | null) => void;
  swapped?: boolean;
}

const sideName = (m: UnitMember) => splitSide(m.exercise.name).side ?? splitSide(m.station.name).side;

export function ExerciseCard({ sessionId, title, members, alternatives = [], onSwap, swapped }: Props) {
  const ids = members.map((m) => m.station.id).join('|');
  const histories = useLiveQuery(
    () => Promise.all(members.map((m) => stationHistory(m.station.id, sessionId))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ids, sessionId],
  );

  const isPair = members.length === 2 && members.every((m) => sideName(m));
  const comparison = useMemo(() => {
    if (!isPair || !histories) return null;
    const li = members.findIndex((m) => sideName(m) === 'links');
    const ri = 1 - li;
    return compareSides(title, histories[li]?.at(-1), histories[ri]?.at(-1));
  }, [isPair, histories, members, title]);

  // Schwächere Seite zuerst
  const order = useMemo(() => {
    const idx = members.map((_, i) => i);
    if (!isPair) return idx;
    const firstSide = comparison?.weaker && comparison.diffPct >= 5 ? comparison.weaker : 'links';
    const rank = (i: number) => (sideName(members[i]) === firstSide ? 0 : 1);
    return idx.sort((a, b) => rank(a) - rank(b));
  }, [members, isPair, comparison]);

  const workCount = members.reduce((a, m) => a + m.sets.filter((s) => !s.isWarmup).length, 0);
  const plannedCount = members.reduce((a, m) => a + m.prescription.sets, 0);
  const done = workCount >= plannedCount;
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (done) setOpen(false);
  }, [done]);
  const [menu, setMenu] = useState(false);

  const first = members[0];
  const allSets = members.flatMap((m) => m.sets.filter((s) => !s.isWarmup));
  const allExcluded = allSets.length > 0 && allSets.every((s) => s.excluded);

  const markAll = async (reason: ExcludeReason | null) => {
    await db.sets.bulkUpdate(
      allSets.map((s) => ({ key: s.id, changes: reason ? { excluded: true, excludeReason: reason } : { excluded: false, excludeReason: undefined } })),
    );
    setMenu(false);
  };

  const p = first.prescription;
  const isEndurance = first.exercise.type === 'time_distance';

  return (
    <Card className={done ? 'opacity-90' : ''}>
      <div className="flex items-start gap-2">
        <button type="button" className="flex flex-1 items-start justify-between text-left" onClick={() => setOpen((o) => !o)}>
          <div>
            <h3 className="text-lg font-bold">
              {done && <span className="text-emerald-600 dark:text-emerald-400">✓ </span>}
              {title}
              {allExcluded && <span className="chip ml-2 bg-amber-100 align-middle text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">zählt nicht</span>}
            </h3>
            <p className="text-xs text-slate-500">
              {swapped && '⇄ getauscht · '}
              {isEndurance ? `${p.sets} Satz/Sätze` : `${p.sets} × ${p.repMin}–${p.repMax}${isPair ? ' je Seite' : ''}`}
              {first.station.settingsNote && ` · ${first.station.settingsNote}`}
            </p>
            {comparison && comparison.weaker && comparison.diffPct >= 5 && (
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                {comparison.weaker === 'links' ? 'Links' : 'Rechts'} {comparison.diffPct} % schwächer – mit {comparison.weaker} beginnen
              </p>
            )}
          </div>
          <span className="text-sm text-slate-500">
            {workCount}/{plannedCount}
          </span>
        </button>
        <button type="button" className="-mr-2 -mt-1 rounded p-2 text-lg text-slate-500" aria-label="Optionen" onClick={() => setMenu(true)}>
          ⋯
        </button>
      </div>

      {!open && done && (
        <button
          type="button"
          className="mt-2 w-full rounded-lg border border-dashed border-slate-300 py-2 text-sm font-semibold text-emerald-600 dark:border-slate-600 dark:text-emerald-400"
          onClick={() => setOpen(true)}
        >
          + Weiterer Satz
        </button>
      )}

      {open && histories && (
        <div className="mt-3 space-y-4">
          {order.map((i, n) => {
            const m = members[i];
            const side = sideName(m);
            return (
              <div key={m.station.id} className={n > 0 ? 'border-t border-slate-200 pt-4 dark:border-slate-700' : ''}>
                <ExerciseBody
                  sessionId={sessionId}
                  station={m.station}
                  exercise={m.exercise}
                  prescription={m.prescription}
                  sets={m.sets}
                  history={histories[i]}
                  subtitle={isPair && side ? (side === 'links' ? 'Links' : 'Rechts') : undefined}
                />
              </div>
            );
          })}
        </div>
      )}

      <Modal open={menu} onClose={() => setMenu(false)} title={title}>
        <div className="space-y-4 text-sm">
          {onSwap && (
            <section>
              <h3 className="mb-1 font-semibold">Übung tauschen</h3>
              {alternatives.length === 0 ? (
                <p className="text-slate-500">
                  Keine Alternativen in diesem Gym. Alternativ-Gruppen legst du unter Verwalten → Übungen fest.
                </p>
              ) : (
                <ul className="divide-y divide-slate-200 dark:divide-slate-700">
                  {alternatives.map((a) => (
                    <li key={a.key}>
                      <button
                        type="button"
                        className="w-full py-2.5 text-left"
                        onClick={() => {
                          onSwap(a);
                          setMenu(false);
                        }}
                      >
                        ⇄ {a.title}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {swapped && (
                <Button
                  variant="secondary"
                  className="mt-2 w-full"
                  onClick={() => {
                    onSwap(null);
                    setMenu(false);
                  }}
                >
                  Zurück zur Plan-Übung
                </Button>
              )}
            </section>
          )}
          <section>
            <h3 className="mb-1 font-semibold">Ganze Übung in diesem Training</h3>
            {allSets.length === 0 ? (
              <p className="text-slate-500">Noch keine Sätze gespeichert.</p>
            ) : allExcluded ? (
              <Button variant="secondary" className="w-full" onClick={() => markAll(null)}>
                Wieder werten
              </Button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Button variant="secondary" onClick={() => markAll('unsauber')}>
                  unsauber
                </Button>
                <Button variant="secondary" onClick={() => markAll('ersatz')}>
                  Ersatz
                </Button>
                <Button variant="secondary" onClick={() => markAll('sonstiges')}>
                  zählt nicht
                </Button>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Markierte Sätze bleiben in der Historie, zählen aber nicht für Ziel, Charts und Bestwerte.
            </p>
          </section>
        </div>
      </Modal>
    </Card>
  );
}
