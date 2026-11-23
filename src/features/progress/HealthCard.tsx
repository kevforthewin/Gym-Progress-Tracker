import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { isoDate } from '../../db/repositories/body';
import { isoToTs } from '../../db/addSessions';
import type { HealthDay } from '../../db/types';
import { fmtDate, fmtNumber, fmtShortDate } from '../../domain/units';
import { Card, Tabs } from '../../components/ui';
import { ProgressChart } from './ProgressChart';
import { HealthBars } from './HealthBars';

type Metric = 'steps' | 'activeKcal' | 'vo2max' | 'restingHr';
const METRICS: { value: Metric; label: string; unit: string; bars: boolean }[] = [
  { value: 'steps', label: 'Schritte', unit: '', bars: true },
  { value: 'activeKcal', label: 'kcal', unit: 'kcal', bars: true },
  { value: 'vo2max', label: 'VO₂max', unit: 'ml/kg/min', bars: false },
  { value: 'restingHr', label: 'Ruhepuls', unit: 'bpm', bars: false },
];

const daysAgo = (n: number) => isoDate(Date.now() - n * 86400000);

function avg(days: HealthDay[], key: Metric, from: string) {
  const vals = days.filter((d) => d.date >= from && d[key] !== undefined).map((d) => d[key]!);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
}
const latest = (days: HealthDay[], key: Metric) => [...days].reverse().find((d) => d[key] !== undefined);

export function HealthCard() {
  const days = useLiveQuery(() => db.health.orderBy('date').toArray());
  const [metric, setMetric] = useState<Metric>('steps');

  const chartData = useMemo(() => {
    if (!days) return [];
    const m = METRICS.find((x) => x.value === metric)!;
    // Balken: alle Tage (Diagramm fasst selbst nach Tag/Woche/Monat zusammen); Linien: 12 Monate
    const from = m.bars ? '0000-00-00' : daysAgo(365);
    return days.filter((d) => d.date >= from && d[metric] !== undefined).map((d) => ({ date: d.date, value: d[metric]! }));
  }, [days, metric]);

  if (!days) return null;
  const m = METRICS.find((x) => x.value === metric)!;
  const vo2 = latest(days, 'vo2max');
  const rhr = latest(days, 'restingHr');
  const lastUpdate = days.reduce((a, d) => Math.max(a, d.updatedAt), 0);

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Apple Health</h2>
        <span className="text-xs text-slate-500">{lastUpdate ? `aktualisiert ${fmtDate(lastUpdate)}` : ''}</span>
      </div>
      {days.length === 0 ? (
        <p className="text-sm text-slate-500">
          Noch keine Health-Daten. Täglich über <strong>Heute → ⌚ Health einlesen</strong>, die Vergangenheit über{' '}
          <Link to="/settings/health" className="text-emerald-600 underline dark:text-emerald-400">
            Einstellungen → Apple Health
          </Link>
          .
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-4 gap-2 text-center">
            <Kpi label="Ø Schritte 7 T." value={avg(days, 'steps', daysAgo(6))} digits={0} />
            <Kpi label="Ø aktive kcal 7 T." value={avg(days, 'activeKcal', daysAgo(6))} digits={0} />
            <Kpi label={`VO₂max${vo2 ? ` · ${fmtShortDate(isoToTs(vo2.date))}` : ''}`} value={vo2?.vo2max} digits={1} />
            <Kpi label="Ø Ruhepuls 7 T." value={avg(days, 'restingHr', daysAgo(6)) ?? rhr?.restingHr} digits={0} />
          </dl>
          <Tabs value={metric} onChange={setMetric} options={METRICS.map(({ value, label }) => ({ value, label }))} />
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-500">Keine Werte für {m.label}.</p>
          ) : m.bars ? (
            <HealthBars key={metric} data={chartData} unit={m.unit} label={m.label} />
          ) : chartData.length >= 2 ? (
            <ProgressChart
              format={(v) => `${fmtNumber(v, 1)} ${m.unit}`}
              data={chartData.map((d) => ({ date: isoToTs(d.date), value: d.value, pr: false }))}
            />
          ) : (
            <p className="text-sm text-slate-500">Ab zwei Werten siehst du hier den Verlauf.</p>
          )}
        </>
      )}
    </Card>
  );
}

function Kpi({ label, value, digits }: { label: string; value?: number; digits: number }) {
  return (
    <div className="rounded-lg border border-slate-200 px-1 py-2 dark:border-slate-700">
      <dd className="text-lg font-bold">{value === undefined ? '–' : fmtNumber(value, digits)}</dd>
      <dt className="text-[10px] leading-tight text-slate-500">{label}</dt>
    </div>
  );
}

const Code = ({ children }: { children: string }) => (
  <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[12px] dark:bg-slate-900">{children}</code>
);

export function ShortcutGuide() {
  const blocks: [string, string, string, boolean][] = [
    ['Schritte', 'steps', 'letzten 7 Tage', true],
    ['Aktive Energie', 'kcal', 'letzten 7 Tage', true],
    ['Cardiofitness (VO₂max)', 'vo2', 'letzten 30 Tage', false],
    ['Ruheherzfrequenz', 'rhr', 'letzten 7 Tage', false],
    ['Gewicht', 'weight', 'letzten 30 Tage', false],
  ];
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-500">
        Einmalig in der App <strong>Kurzbefehle</strong> anlegen (ca. 10 Min.). Danach: Kurzbefehl starten → diese App öffnen →
        <strong>Heute → ⌚ Health einlesen</strong>. Namen der Aktionen können je nach iOS-Version leicht abweichen.
      </p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Kurzbefehle → „+“ → Name z. B. <strong>„Gym Health“</strong>.</li>
        <li>
          Für <strong>jede Zeile der Tabelle unten</strong> einen Block anlegen:
          <ol className="mt-1 list-[lower-alpha] space-y-1 pl-5">
            <li>
              Aktion <strong>„Health-Beispiele suchen“</strong>: Typ = <em>(siehe Tabelle)</em>, Filter <em>Startdatum ist in den …</em>,
              sortiert nach <em>Startdatum</em>. Bei Schritte/Energie zusätzlich <strong>„Gruppieren nach: Tag“</strong>.
            </li>
            <li>
              Aktion <strong>„Wiederholen mit jedem“</strong> (mit den Health-Beispielen).
            </li>
            <li>
              Darin <strong>„Datum formatieren“</strong>: Datum = <em>Wiederholungsobjekt → Startdatum</em>, Format „Eigenes“: <Code>yyyy-MM-dd</Code>,
              Uhrzeit: keine.
            </li>
            <li>
              Darin <strong>„Text“</strong>: <Code>KÜRZEL;</Code> + <em>Formatiertes Datum</em> + <Code>;</Code> + <em>Wiederholungsobjekt → Wert</em>
              <br />z. B. <Code>steps;2026-11-22;8543</Code>
            </li>
          </ol>
        </li>
        <li>
          Am Ende eine Aktion <strong>„Text“</strong>, in die du alle <em>Wiederholungsergebnisse</em> der Blöcke untereinander einsetzt (je eine
          Zeile).
        </li>
        <li>
          Aktion <strong>„In Zwischenablage kopieren“</strong> und optional <strong>„Mitteilung anzeigen“</strong> („Health-Daten kopiert“).
        </li>
        <li>Beim ersten Start Health-Zugriff erlauben. Tipp: Kurzbefehl als Widget auf den Home-Bildschirm legen.</li>
      </ol>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="py-1">Typ in Health</th>
            <th>Kürzel</th>
            <th>Zeitraum</th>
            <th>pro Tag</th>
          </tr>
        </thead>
        <tbody>
          {blocks.map(([t, k, r, g]) => (
            <tr key={k} className="border-t border-slate-200 dark:border-slate-700">
              <td className="py-1">{t}</td>
              <td>
                <Code>{k}</Code>
              </td>
              <td>{r}</td>
              <td>{g ? 'gruppieren' : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
        <summary className="cursor-pointer font-medium">Optional: Apple-Watch-Workouts (Cardio)</summary>
        <p className="mt-1 text-slate-500">
          Falls bei „Health-Beispiele suchen“ der Typ <em>Trainings</em> verfügbar ist: gleicher Aufbau, Text-Zeile
          <br />
          <Code>workout;DATUM;ART;DAUER_MIN;DISTANZ_KM;KCAL</Code> (Distanz/kcal dürfen leer bleiben). Krafttraining kannst du weglassen. Sonst
          kommen Workouts über den Health-Export rein – doppelte werden erkannt.
        </p>
      </details>
      <details className="rounded-lg bg-slate-50 p-2 dark:bg-slate-900/50">
        <summary className="cursor-pointer font-medium">Health-Export (Vergangenheit)</summary>
        <p className="mt-1 text-slate-500">
          Health-App → Profilbild → <strong>„Alle Gesundheitsdaten exportieren“</strong> → „In Dateien sichern“. Dann unter Einstellungen → Apple Health die
          <Code>Export.zip</Code> wählen. Schritte, aktive Energie, VO₂max, Ruhepuls, Gewicht und Cardio-Workouts werden übernommen (Krafttraining
          nicht – das loggst du in der App).
        </p>
      </details>
    </div>
  );
}
