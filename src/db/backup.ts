import { ALL_TABLES, applyExerciseDefaults, db, type TableName } from './schema';
import { setSetting } from './repositories/settings';

export const BACKUP_FORMAT = 'gym-progress-tracker';
export const BACKUP_VERSION = 2;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: number;
  tables: Record<TableName, unknown[]>;
}

export async function exportData(): Promise<Backup> {
  const tables = {} as Record<TableName, unknown[]>;
  await db.transaction('r', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) tables[t] = await db.table(t).toArray();
  });
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: Date.now(), tables };
}

export function validateBackup(data: unknown): asserts data is Backup {
  const b = data as Partial<Backup>;
  if (!b || typeof b !== 'object' || b.format !== BACKUP_FORMAT) throw new Error('Keine gültige Backup-Datei.');
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION)
    throw new Error(`Backup-Version ${b.version} wird nicht unterstützt.`);
  if (!b.tables || typeof b.tables !== 'object') throw new Error('Backup enthält keine Tabellen.');
  for (const t of ALL_TABLES) {
    const rows = (b.tables as Record<string, unknown>)[t];
    if (rows !== undefined && !Array.isArray(rows)) throw new Error(`Tabelle ${t} ist ungültig.`);
  }
}

/** Ersetzt ALLE lokalen Daten durch das Backup. */
export async function importData(data: unknown) {
  validateBackup(data);
  await db.transaction('rw', ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
      await db.table(t).clear();
      const rows = data.tables[t] ?? [];
      if (rows.length) await db.table(t).bulkAdd(rows);
    }
  });
  await applyExerciseDefaults();
}

export async function downloadBackup() {
  const data = await exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gym-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  await setSetting('lastBackupAt', Date.now());
}
