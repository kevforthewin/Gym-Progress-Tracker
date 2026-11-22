import { db } from '../schema';

export interface SettingsMap {
  activePlanId: string;
  lastBackupAt: number;
  seeded: boolean;
  /** Gemerkte Zuordnungen beim Import: `${gymId}|${normName}` -> stationId */
  importAliases: Record<string, string>;
}

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K] | undefined> {
  return (await db.settings.get(key))?.value as SettingsMap[K] | undefined;
}

export const setSetting = <K extends keyof SettingsMap>(key: K, value: SettingsMap[K]) =>
  db.settings.put({ key, value });
