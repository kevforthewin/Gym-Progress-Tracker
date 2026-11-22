import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { addCardio, deleteCardio, todayIso, upsertBodyweight } from '../../db/repositories/body';
import { isoToTs } from '../../db/addSessions';
import { addWeeks, isoWeek, weekStart } from '../../domain/insights';
import { fmtDate, fmtNumber, parseNum } from '../../domain/units';
import { Button, Card, Field } from '../../components/ui';
import { ProgressChart } from './ProgressChart';

const CARDIO_KINDS = ['Laufband', 'Crosstrainer', 'Fahrrad', 'Rudergerät', 'Stepper', 'Zone 2', 'Spazieren', 'Schwimmen'];

export function BodyView() {
  return (
    <div className="space-y-4">
      <BodyweightCard />
      <CardioCard />
    </div>
  );
}

function BodyweightCard() {
  const entries = useLiveQuery(() => db.bodyweights.orderBy('date').toArray());
  const [date, setDate] = useState(todayIso());
  const [kg, setKg] = useState('');
  if (!entries) return null;
  const last = entries.at(-1);
  const first30 = entries.filter((e) => isoToTs(e.date) >= Date.now() - 30 * 86400000)[0];
  const delta = last && first30 && last !== first30 ? last.weightKg - first30.weightKg : undefined;

  const save = async () => {
    const v = parseNum(kg);
    if (!v) return;
    await upsertBodyweight(date, v);
    setKg('');
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Körpergewicht</h2>
        {last && (
          <span className="text-sm">
            <strong>{fmtNumber(last.weightKg, 1)} kg</strong>
            {delta !== undefined && (
              <span className="ml-1 text-xs text-slate-500">
                ({delta >= 0 ? '+' : ''}
                {fmtNumber(delta, 1)} kg / 30 T.)
              </span>
            )}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Datum">
          <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <Field label="kg">
          <input className="input" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} placeholder={last ? fmtNumber(last.weightKg, 1) : '80'} />
        </Field>
        <Button className="col-span-2" onClick={save} disabled={!parseNum(kg)}>
          Gewicht speichern
        </Button>
      </div>
      {entries.length >= 2 ? (
        <ProgressChart
          format={(v) => `${fmtNumber(v, 1)} kg`}
          data={entries.map((e) => ({ date: isoToTs(e.date), value: e.weightKg, pr: false }))}
        />
      ) : (
        <p className="text-sm text-slate-500">Ab zwei Einträgen siehst du hier den Verlauf. Im Training kannst du das Gewicht auch unten in der Session eintragen.</p>
      )}
      {entries.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-slate-500">Alle Einträge ({entries.length})</summary>
          <ul className="mt-1 divide-y divide-slate-200 dark:divide-slate-700">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="flex justify-between py-1">
                <span>{fmtDate(isoToTs(e.date))}</span>
                <span>
                  {fmtNumber(e.weightKg, 1)} kg
                  <button type="button" className="ml-3 text-slate-400" aria-label="Eintrag löschen" onClick={() => db.bodyweights.delete(e.id)}>
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function CardioCard() {
  const data = useLiveQuery(async () => ({
    entries: await db.cardio.orderBy('date').reverse().toArray(),
    gyms: await db.gyms.toArray(),
  }));
  const [date, setDate] = useState(todayIso());
  const [kind, setKind] = useState('Zone 2');
  const [min, setMin] = useState('');
  const [km, setKm] = useState('');
  const [hr, setHr] = useState('');
  if (!data) return null;
  const { entries } = data;

  const save = async () => {
    const durationMin = parseNum(min);
    if (!durationMin) return;
    await addCardio({ date, kind: kind.trim() || 'Cardio', durationMin, distanceKm: parseNum(km), avgHr: parseNum(hr) });
    setMin('');
    setKm('');
    setHr('');
  };

  // Minuten pro Woche (8 Wochen)
  const thisWeek = weekStart(Date.now());
  const weeks = Array.from({ length: 8 }, (_, i) => addWeeks(thisWeek, -(7 - i)));
  const perWeek = weeks.map((w) => entries.filter((e) => weekStart(isoToTs(e.date)) === w).reduce((a, e) => a + e.durationMin, 0));
  const maxMin = Math.max(150, ...perWeek);

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Cardio</h2>
        <span className="text-sm text-slate-500">diese Woche {fmtNumber(perWeek.at(-1) ?? 0, 0)} min</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Art">
          <input className="input" list="cardio-kinds" value={kind} onChange={(e) => setKind(e.target.value)} />
          <datalist id="cardio-kinds">
            {CARDIO_KINDS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </Field>
        <Field label="Datum">
          <input type="date" className="input" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <Field label="Minuten">
          <input className="input" inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="30" />
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

      <div>
        <p className="mb-1 text-xs text-slate-500">Minuten pro Woche (Linie: 150 min)</p>
        <div className="relative flex h-24 items-end gap-1.5">
          <div className="absolute inset-x-0 border-t border-dashed border-slate-400/60" style={{ bottom: `${(150 / maxMin) * 100}%` }} />
          {perWeek.map((v, i) => (
            <div key={weeks[i]} className="flex h-full flex-1 flex-col justify-end" title={`KW ${isoWeek(weeks[i])}: ${v} min`}>
              <div className="rounded-t bg-emerald-500" style={{ height: `${(v / maxMin) * 100}%`, minHeight: v ? 2 : 0 }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5 text-center text-[10px] text-slate-500">
          {weeks.map((w, i) => (
            <span key={w} className="flex-1">
              {perWeek[i] ? fmtNumber(perWeek[i], 0) : ''}
              <br />
              KW{isoWeek(w)}
            </span>
          ))}
        </div>
      </div>

      {entries.length > 0 && (
        <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-700">
          {entries.slice(0, 10).map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-2 py-1.5">
              <span>
                {e.kind} <span className="text-xs text-slate-500">{fmtDate(isoToTs(e.date))}</span>
              </span>
              <span className="text-right">
                {fmtNumber(e.durationMin, 0)} min
                {e.distanceKm ? ` · ${fmtNumber(e.distanceKm, 2)} km` : ''}
                {e.avgHr ? ` · ${e.avgHr} bpm` : ''}
                <button type="button" className="ml-3 text-slate-400" aria-label="Eintrag löschen" onClick={() => deleteCardio(e.id)}>
                  ✕
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
