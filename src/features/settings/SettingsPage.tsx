import { useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../../db/schema';
import { getSetting } from '../../db/repositories/settings';
import { backupToImportSessions, isAppBackup, parseSessionsFile, type ImportSession } from '../../db/addSessions';
import { findDuplicates, mergeDuplicates, type DuplicateReport } from '../../db/dedupe';
import { downloadBackup } from '../../db/backup';
import { fmtDate } from '../../domain/units';
import { Button, Card, PageHeader } from '../../components/ui';
import { AddSessionsDialog } from './AddSessionsDialog';

function Row({ to, onClick, icon, title, sub }: { to?: string; onClick?: () => void; icon: string; title: string; sub?: ReactNode }) {
  const inner = (
    <>
      <span className="text-xl" aria-hidden>
        {icon}
      </span>
      <span className="flex-1">
        <span className="block font-medium">{title}</span>
        {sub && <span className="block text-xs text-slate-500">{sub}</span>}
      </span>
      <span className="text-slate-400">›</span>
    </>
  );
  const cls = 'flex w-full items-center gap-3 px-4 py-3 text-left';
  return to ? (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      <Card className="divide-y divide-slate-200 p-0 dark:divide-slate-700">{children}</Card>
    </section>
  );
}

export function SettingsPage() {
  const addRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ImportSession[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const info = useLiveQuery(async () => ({
    lastBackupAt: await getSetting('lastBackupAt'),
    plans: await db.plans.count(),
    exercises: await db.exercises.count(),
    gyms: await db.gyms.count(),
    stations: await db.stations.count(),
    healthDays: await db.health.count(),
  }));

  const onAdd = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      // App-Backups laufen ebenfalls über die Namens-Zuordnung -> keine doppelten Gyms/Pläne/Übungen
      setPending(isAppBackup(json) ? backupToImportSessions(json) : parseSessionsFile(json));
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    }
  };

  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="space-y-5">
        <DuplicatesNotice />

        <Section title="Training">
          <Row to="/manage?tab=plans" icon="📋" title="Trainingspläne" sub={`${info?.plans ?? 0} Plan/Pläne · Tage & Übungen`} />
          <Row to="/manage?tab=exercises" icon="🏋️" title="Übungen" sub={`${info?.exercises ?? 0} Übungen · Muskel- & Alternativ-Gruppen`} />
          <Row to="/manage?tab=gyms" icon="📍" title="Gyms & Geräte" sub={`${info?.gyms ?? 0} Gyms · ${info?.stations ?? 0} Geräte · Gewichtsstufen`} />
        </Section>

        <Section title="Daten">
          <Row to="/quick" icon="✍️" title="Training nachtragen" sub="Vergessenes Training als Text eingeben" />
          <Row onClick={() => addRef.current?.click()} icon="📥" title="Trainings importieren" sub="Aus JSON-Datei ergänzen, ohne etwas zu löschen" />
          <Row to="/settings/health" icon="⌚" title="Apple Health" sub={info?.healthDays ? `${info.healthDays} Tage · Export & Kurzbefehl` : 'Export & Kurzbefehl einrichten'} />
          <Row
            to="/settings/backup"
            icon="💾"
            title="Backup"
            sub={`Letztes Backup: ${info?.lastBackupAt ? fmtDate(info.lastBackupAt) : 'nie'}`}
          />
        </Section>
        <input
          ref={addRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          data-testid="add-sessions-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onAdd(f);
            e.target.value = '';
          }}
        />
        {msg && <p className="text-sm">{msg}</p>}

        <Section title="Info">
          <details className="px-4 py-3 text-sm">
            <summary className="cursor-pointer font-medium">🎯 So funktioniert das Ziel</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
              <li>Jede Übung im Plan hat einen Wiederholungsbereich (z. B. 8–12).</li>
              <li>Schaffst du in allen geplanten Sätzen das obere Ende, steigt das Gewicht (nächste Gewichtsstufe bzw. Gewichtssprung) und du startest wieder unten.</li>
              <li>Sonst bleibt das Gewicht und das Ziel ist +1 Wdh. pro Satz. Zusatzsätze zählen fürs Volumen, nicht fürs Ziel.</li>
              <li>3 Trainings ohne Verbesserung → Deload um ca. 10 %.</li>
              <li>Sätze mit „unsauber“, „Ersatz“ oder „zählt nicht“ bleiben in der Historie, zählen aber nicht fürs Ziel.</li>
              <li>Zeit/Distanz: +5 % gegenüber dem letzten Mal. Aufwärmsätze zählen nie mit.</li>
              <li>Historie und Ziel gelten je Gerät und Gym.</li>
            </ul>
          </details>
        </Section>

        <Section title="Gefahrenzone">
          <div className="px-4 py-3">
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm('Wirklich ALLE Daten löschen? Das kann nicht rückgängig gemacht werden.')) return;
                await Promise.all(db.tables.map((t) => t.clear()));
                setMsg('Alle Daten gelöscht.');
              }}
            >
              Alle Daten löschen
            </Button>
          </div>
        </Section>
      </div>
      <AddSessionsDialog
        sessions={pending}
        onClose={() => setPending(null)}
        onDone={(m) => {
          setPending(null);
          setMsg(m);
        }}
      />
    </>
  );
}

function DuplicatesNotice() {
  const report = useLiveQuery(() => findDuplicates());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<DuplicateReport | null>(null);
  if (done) return <Card className="border-emerald-500 text-sm">✅ Zusammengeführt: {describe(done)}.</Card>;
  if (!report || report.total === 0) return null;
  const run = async () => {
    if (!confirm('Doppelte Einträge zusammenführen? Vorher wird automatisch ein Backup heruntergeladen.')) return;
    setBusy(true);
    try {
      await downloadBackup();
      setDone(await mergeDuplicates());
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-2 border-amber-400 text-sm">
      <p>
        ⚠️ <strong>Doppelte Einträge gefunden:</strong> {describe(report)}. Vermutlich wurde ein Backup zusätzlich eingespielt.
      </p>
      <Button className="w-full" disabled={busy} onClick={run}>
        Zusammenführen
      </Button>
    </Card>
  );
}

function describe(r: DuplicateReport) {
  const parts: [number, string][] = [
    [r.gyms, 'Gym(s)'],
    [r.plans, 'Plan/Pläne'],
    [r.planDays, 'Trainingstag(e)'],
    [r.exercises, 'Übung(en)'],
    [r.stations, 'Gerät(e)'],
    [r.sessions, 'Training(s)'],
  ];
  return parts.filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`).join(', ') || 'nichts';
}
