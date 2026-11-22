import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/schema';
import { listGyms } from '../../db/repositories/gyms';
import { todayIso } from '../../db/repositories/body';
import { textToImportSession, type ImportSession } from '../../db/addSessions';
import { parseTrainingText } from '../../domain/textParser';
import { fmtNumber } from '../../domain/units';
import { useLookup } from '../../hooks/useLookup';
import { Button, Card, Field, PageHeader } from '../../components/ui';
import { AddSessionsDialog } from '../settings/AddSessionsDialog';

const DRAFT_KEY = 'quick-entry-draft';
const EXAMPLE = `Bankdrücken 70 a 8/8/7
Reverse Butterfly einarmig
Links 54 a 8/8/8
Rechts 54 a 7/8/8
Kabel-Seitheben 6,8 a 10/10/10 pro Seite
Klimmzüge 7/7/6
Hammercurls 15 a 6 unsauber`;

export function QuickEntryPage() {
  const nav = useNavigate();
  const lookup = useLookup();
  const gyms = useLiveQuery(() => listGyms());
  const lastGym = useLiveQuery(async () => (await db.sessions.orderBy('startedAt').last())?.gymId);
  const [gymId, setGymId] = useState('');
  const [dayId, setDayId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(DRAFT_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [pending, setPending] = useState<ImportSession[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!gymId && gyms?.length) setGymId(lastGym && gyms.some((g) => g.id === lastGym) ? lastGym : gyms[0].id);
  }, [gyms, lastGym, gymId]);
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, text);
    } catch {
      /* egal */
    }
  }, [text]);

  const parsed = useMemo(() => parseTrainingText(text), [text]);
  if (!lookup || !gyms) return null;

  const gym = gyms.find((g) => g.id === gymId);
  const day = lookup.planDays.get(dayId);

  const next = () => {
    if (!gym || !parsed.length) return;
    setPending([textToImportSession(parsed, { gymName: gym.name, date, workoutType: day?.name })]);
  };

  return (
    <>
      <PageHeader title="Schnelleingabe" back={() => nav(-1)} />
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Gym">
            <select className="input" value={gymId} onChange={(e) => setGymId(e.target.value)}>
              {gyms.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Datum">
            <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Trainingstag">
          <select className="input" value={dayId} onChange={(e) => setDayId(e.target.value)}>
            <option value="">Freies Training</option>
            {lookup.plans.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {[...lookup.planDays.values()]
                  .filter((d) => d.planId === p.id)
                  .sort((a, b) => a.order - b.order)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Training als Text">
          <textarea
            className="input font-mono text-sm"
            rows={9}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            spellCheck={false}
          />
        </Field>
        <p className="-mt-2 text-xs text-slate-500">
          Pro Zeile: Übung, Gewicht „a“ Wiederholungen. Auch möglich: „Links/Rechts …“, „pro Seite“, nur „7/7/6“ (Körpergewicht),
          „unsauber“/„Ersatz“, „warmup“. Text direkt aus deinem Chat einfügen geht auch.
        </p>

        {parsed.length > 0 && (
          <Card>
            <h2 className="mb-2 font-semibold">Erkannt ({parsed.length} Übungen)</h2>
            <ul className="space-y-1 text-sm">
              {parsed.map((e, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span>
                    {e.name}
                    {e.side && <span className="text-slate-500"> ({e.side === 'L' ? 'links' : 'rechts'})</span>}
                  </span>
                  <span className="text-right text-slate-500">
                    {e.sets
                      .map((s) => `${s.warmup ? 'W ' : ''}${s.weightKg ? `${fmtNumber(s.weightKg)}×` : ''}${fmtNumber(s.reps, 1)}${s.excluded ? '*' : ''}`)
                      .join(' · ')}
                  </span>
                </li>
              ))}
            </ul>
            {parsed.some((e) => e.sets.some((s) => s.excluded)) && <p className="mt-2 text-xs text-slate-500">* zählt nicht fürs Ziel</p>}
          </Card>
        )}

        {msg && <p className="text-sm">{msg}</p>}
        <Button className="w-full" disabled={!parsed.length || !gym} onClick={next}>
          Weiter zur Zuordnung
        </Button>
      </div>

      <AddSessionsDialog
        sessions={pending}
        onClose={() => setPending(null)}
        onDone={(m) => {
          setPending(null);
          if (m.startsWith('✅')) {
            setText('');
            nav('/history');
          } else setMsg(m);
        }}
      />
    </>
  );
}
