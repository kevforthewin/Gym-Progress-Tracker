import { applyHealthImport, type HealthApplyResult } from '../../db/repositories/health';
import { isoDate } from '../../db/repositories/body';
import { parseShortcutText, type HealthImport } from '../../domain/health';
import type { WorkerOut } from '../../workers/healthExport.worker';

export function formatHealthResult(r: HealthApplyResult): string {
  return (
    `✅ Health: ${r.days} Tag(e)` +
    (r.weights ? `, ${r.weights}× Gewicht` : '') +
    (r.workouts ? `, ${r.workouts} Workout(s) als Cardio` : '') +
    (r.skippedWorkouts ? ` (${r.skippedWorkouts} schon vorhanden)` : '') +
    ' übernommen.'
  );
}

/** Kurzbefehl-Text übernehmen; null, wenn nichts erkannt wurde. */
export async function applyHealthText(text: string): Promise<HealthApplyResult | null> {
  const data = parseShortcutText(text);
  if (!Object.keys(data.days).length && !Object.keys(data.weights).length && !data.workouts.length) return null;
  return applyHealthImport(data);
}

export type ClipboardOutcome = { kind: 'ok'; result: HealthApplyResult } | { kind: 'empty' } | { kind: 'denied' };

/** Liest die Zwischenablage (Kurzbefehl-Ausgabe) und übernimmt die Werte. */
export async function importHealthFromClipboard(): Promise<ClipboardOutcome> {
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return { kind: 'denied' };
  }
  const result = await applyHealthText(text);
  return result ? { kind: 'ok', result } : { kind: 'empty' };
}

export const HEALTH_EMPTY_MSG = '❌ Keine Health-Daten in der Zwischenablage. Erst den Kurzbefehl ausführen, dann einlesen.';

/** Health-Export (zip/xml) im Web-Worker lesen und übernehmen. */
export function importHealthExport(file: File, sinceDays: number | null, onProgress: (pct: number) => void): Promise<HealthApplyResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/healthExport.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = async (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'progress') return onProgress(m.pct);
      worker.terminate();
      if (m.type === 'error') reject(new Error(m.message));
      else resolve(await applyHealthImport(m.result as HealthImport));
    };
    worker.postMessage({ file, since: sinceDays === null ? undefined : isoDate(Date.now() - sinceDays * 86400000) });
  });
}
