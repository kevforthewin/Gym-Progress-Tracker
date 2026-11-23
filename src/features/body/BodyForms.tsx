import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { addCardio, todayIso, upsertBodyweight } from '../../db/repositories/body';
import { fmtNumber, parseNum } from '../../domain/units';
import { Button, Field } from '../../components/ui';

export const CARDIO_KINDS = ['Laufband', 'Crosstrainer', 'Fahrrad', 'Rudergerät', 'Stepper', 'Zone 2', 'Spazieren', 'Schwimmen'];

export function BodyweightForm({ onDone }: { onDone?: (msg: string) => void }) {
  const last = useLiveQuery(() => db.bodyweights.orderBy('date').last());
  const [date, setDate] = useState(todayIso());
  const [kg, setKg] = useState('');
  const save = async () => {
    const v = parseNum(kg);
    if (!v) return;
    await upsertBodyweight(date, v);
    setKg('');
    onDone?.(`✅ Gewicht ${fmtNumber(v, 1)} kg gespeichert.`);
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Datum">
        <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>
      <Field label="kg">
        <input
          className="input"
          inputMode="decimal"
          autoFocus
          value={kg}
          onChange={(e) => setKg(e.target.value)}
          placeholder={last ? fmtNumber(last.weightKg, 1) : '80'}
        />
      </Field>
      <Button className="col-span-2" onClick={save} disabled={!parseNum(kg)}>
        Gewicht speichern
      </Button>
    </div>
  );
}

export function CardioForm({ onDone }: { onDone?: (msg: string) => void }) {
  const lastKind = useLiveQuery(async () => (await db.cardio.orderBy('date').last())?.kind);
  const [date, setDate] = useState(todayIso());
  const [kind, setKind] = useState<string | null>(null);
  const [min, setMin] = useState('');
  const [km, setKm] = useState('');
  const [hr, setHr] = useState('');
  const k = kind ?? lastKind ?? 'Zone 2';
  const save = async () => {
    const durationMin = parseNum(min);
    if (!durationMin) return;
    await addCardio({ date, kind: k.trim() || 'Cardio', durationMin, distanceKm: parseNum(km), avgHr: parseNum(hr) });
    setMin('');
    setKm('');
    setHr('');
    onDone?.(`✅ ${k} · ${fmtNumber(durationMin, 0)} min gespeichert.`);
  };
  return (
    <div className="grid grid-cols-2 gap-2">
      <Field label="Art">
        <input className="input" list="cardio-kinds" value={k} onChange={(e) => setKind(e.target.value)} />
        <datalist id="cardio-kinds">
          {CARDIO_KINDS.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </Field>
      <Field label="Datum">
        <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      </Field>
      <Field label="Minuten">
        <input className="input" inputMode="decimal" autoFocus value={min} onChange={(e) => setMin(e.target.value)} placeholder="30" />
      </Field>
      <Field label="Distanz km (opt.)">
        <input className="input" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
      </Field>
      <Field label="Ø Puls (opt.)">
        <input className="input" inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} />
      </Field>
      <div className="flex items-end">
        <Button className="w-full" onClick={save} disabled={!parseNum(min)}>
          Cardio speichern
        </Button>
      </div>
    </div>
  );
}

/** Fallback, wenn die Zwischenablage nicht gelesen werden darf. */
export function HealthPasteForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <div className="space-y-2">
      <p className="text-sm text-slate-500">
        Kein Zugriff auf die Zwischenablage – bitte hier einfügen (lange tippen → Einsetzen):
      </p>
      <textarea className="input font-mono text-xs" rows={5} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <Button className="w-full" disabled={!text.trim()} onClick={() => onSubmit(text)}>
        Übernehmen
      </Button>
    </div>
  );
}
