/// <reference lib="webworker" />
/**
 * Liest den Apple-Health-Export (export.zip oder export.xml) stückweise, ohne die
 * (oft mehrere hundert MB große) Datei komplett in den Speicher zu laden.
 */
import { Unzip, UnzipInflate } from 'fflate';
import { HealthExportAggregator } from '../domain/health';

export type WorkerIn = { file: File; since?: string };
export type WorkerOut =
  | { type: 'progress'; pct: number }
  | { type: 'done'; result: ReturnType<HealthExportAggregator['result']> }
  | { type: 'error'; message: string };

const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const { file, since } = e.data;
  try {
    const agg = new HealthExportAggregator(since);
    const decoder = new TextDecoder();
    let found = false;
    const isZip = /\.zip$/i.test(file.name) || file.type.includes('zip');

    const unzip = new Unzip();
    unzip.register(UnzipInflate);
    unzip.onfile = (f) => {
      // export.xml (nicht export_cda.xml)
      if (!/(^|\/)export\.xml$/i.test(f.name)) return;
      found = true;
      f.ondata = (err, chunk, final) => {
        if (err) throw err;
        agg.push(decoder.decode(chunk, { stream: !final }));
      };
      f.start();
    };

    const reader = file.stream().getReader();
    let read = 0;
    let lastPct = -1;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.length;
      if (isZip) unzip.push(value, false);
      else {
        found = true;
        agg.push(decoder.decode(value, { stream: true }));
      }
      const pct = Math.floor((read / file.size) * 100);
      if (pct !== lastPct) post({ type: 'progress', pct: (lastPct = pct) });
    }
    if (isZip) unzip.push(new Uint8Array(0), true);
    else agg.push(decoder.decode());
    if (!found) throw new Error('In der Datei wurde keine export.xml gefunden.');
    post({ type: 'done', result: agg.result() });
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};
