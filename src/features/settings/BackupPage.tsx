import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db } from '../../db/schema';
import { downloadBackup, importData } from '../../db/backup';
import { getSetting } from '../../db/repositories/settings';
import { fmtDate } from '../../domain/units';
import { Button, Card, PageHeader } from '../../components/ui';

export function BackupPage() {
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const info = useLiveQuery(async () => ({
    lastBackupAt: await getSetting('lastBackupAt'),
    sessions: await db.sessions.count(),
    sets: await db.sets.count(),
  }));
  const persisted = useLiveQuery(async () => (await navigator.storage?.persisted?.()) ?? false);

  const onRestore = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      if (!confirm('Achtung: ALLE aktuellen Daten werden durch das Backup ersetzt. Zum Ergänzen „Trainings importieren“ nutzen. Fortfahren?')) return;
      await importData(json);
      setMsg('✅ Backup importiert.');
    } catch (e) {
      setMsg(`❌ Import fehlgeschlagen: ${(e as Error).message}`);
    }
  };

  return (
    <>
      <PageHeader title="Backup" back={() => nav('/settings')} />
      <div className="space-y-4">
        <Card className="space-y-3">
          <p className="text-sm text-slate-500">
            Alle Daten liegen nur lokal auf diesem Gerät. Exportiere regelmäßig ein Backup (z. B. in iCloud Drive), um sie bei
            Gerätewechsel wiederherzustellen.
          </p>
          <p className="text-sm">
            {info?.sessions ?? 0} Trainings · {info?.sets ?? 0} Sätze · Letztes Backup:{' '}
            <strong>{info?.lastBackupAt ? fmtDate(info.lastBackupAt) : 'nie'}</strong>
          </p>
          <Button className="w-full" onClick={() => downloadBackup().then(() => setMsg('✅ Backup heruntergeladen.'))}>
            Backup exportieren
          </Button>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">Wiederherstellen</h2>
          <p className="text-sm text-slate-500">Ersetzt <strong>alle</strong> aktuellen Daten durch das gewählte Backup.</p>
          <Button variant="secondary" className="w-full" onClick={() => fileRef.current?.click()}>
            Backup wiederherstellen
          </Button>
          <input
            ref={fileRef}
            data-testid="restore-input"
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onRestore(f);
              e.target.value = '';
            }}
          />
        </Card>
        {msg && <p className="text-sm">{msg}</p>}
        <p className="px-1 text-xs text-slate-500">
          Dauerhafter Speicher: {persisted ? 'aktiv ✅' : 'nicht garantiert – App vom Home-Bildschirm aus nutzen hilft.'}
        </p>
      </div>
    </>
  );
}
