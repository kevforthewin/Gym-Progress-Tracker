import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/schema';
import { downloadBackup, importData } from '../../db/backup';
import { getSetting } from '../../db/repositories/settings';
import { isAppBackup, mergeAppBackup, parseSessionsFile, type ImportSession } from '../../db/addSessions';
import { AddSessionsDialog } from './AddSessionsDialog';
import { fmtDate } from '../../domain/units';
import { Button, Card, PageHeader } from '../../components/ui';

export function SettingsPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<ImportSession[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const info = useLiveQuery(async () => ({
    lastBackupAt: await getSetting('lastBackupAt'),
    sessions: await db.sessions.count(),
    sets: await db.sets.count(),
  }));
  const persisted = useLiveQuery(async () => (await navigator.storage?.persisted?.()) ?? false);

  const onImport = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      if (!confirm('Achtung: ALLE aktuellen Daten werden durch das Backup ersetzt. Zum Ergänzen „Trainings hinzufügen“ nutzen. Fortfahren?')) return;
      await importData(json);
      setMsg('✅ Backup importiert.');
    } catch (e) {
      setMsg(`❌ Import fehlgeschlagen: ${(e as Error).message}`);
    }
  };

  const onAdd = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      if (isAppBackup(json)) {
        const n = await mergeAppBackup(json);
        setMsg(`✅ ${n} fehlende Datensätze aus dem Backup ergänzt.`);
        return;
      }
      setPending(parseSessionsFile(json));
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    }
  };

  return (
    <>
      <PageHeader title="Einstellungen" />
      <div className="space-y-4">
        <Card className="space-y-3">
          <h2 className="font-semibold">Trainings hinzufügen</h2>
          <p className="text-sm text-slate-500">
            Trainings aus einer JSON-Datei ergänzen (z. B. aus deinem Trainingslog). Es wird nichts gelöscht, doppelte
            Trainings werden erkannt.
          </p>
          <Button variant="secondary" onClick={() => addRef.current?.click()}>
            Datei auswählen
          </Button>
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
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">Backup</h2>
          <p className="text-sm text-slate-500">
            Alle Daten liegen nur lokal in diesem Browser. Exportiere regelmäßig ein Backup (z. B. in iCloud/Google Drive),
            um sie bei Gerätewechsel wiederherzustellen.
          </p>
          <p className="text-sm">
            {info?.sessions ?? 0} Trainings · {info?.sets ?? 0} Sätze · Letztes Backup:{' '}
            <strong>{info?.lastBackupAt ? fmtDate(info.lastBackupAt) : 'nie'}</strong>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => downloadBackup().then(() => setMsg('✅ Backup heruntergeladen.'))}>Backup exportieren</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Backup wiederherstellen
            </Button>
          </div>
          <input
            ref={fileRef}
            data-testid="restore-input"
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </Card>

        {msg && <p className="text-sm">{msg}</p>}

        <Card className="space-y-1 text-sm">
          <h2 className="font-semibold">Speicher</h2>
          <p className="text-slate-500">
            Dauerhafter Speicher: {persisted ? 'aktiv ✅' : 'nicht garantiert – App zum Home-Bildschirm hinzufügen hilft.'}
          </p>
        </Card>

        <Card className="space-y-2 text-sm">
          <h2 className="font-semibold">So funktioniert das Ziel</h2>
          <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
            <li>Jede Übung im Plan hat einen Wiederholungsbereich (z. B. 8–12).</li>
            <li>Schaffst du in allen Sätzen das obere Ende, steigt das Gewicht um den Gewichtssprung des Geräts und du startest wieder unten.</li>
            <li>Sonst bleibt das Gewicht und das Ziel ist +1 Wdh. pro Satz.</li>
            <li>3 Trainings ohne Verbesserung → Deload um ca. 10 %.</li>
            <li>Sind am Gerät Gewichtsstufen hinterlegt, springt das Ziel auf die nächste echte Stufe.</li>
            <li>Sätze mit „unsauber“, „Ersatz“ oder „zählt nicht“ bleiben in der Historie, zählen aber nicht fürs Ziel.</li>
            <li>Zeit/Distanz: +5 % gegenüber dem letzten Mal. Aufwärmsätze zählen nie mit.</li>
            <li>Historie und Ziel gelten je Gerät und Gym.</li>
          </ul>
        </Card>

        <Card className="text-sm">
          <h2 className="mb-2 font-semibold text-red-600 dark:text-red-400">Gefahrenzone</h2>
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
        </Card>
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
