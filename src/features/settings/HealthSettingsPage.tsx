import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, PageHeader } from '../../components/ui';
import { HealthPasteForm } from '../body/BodyForms';
import { applyHealthText, formatHealthResult, HEALTH_EMPTY_MSG, importHealthExport } from '../body/healthActions';
import { ShortcutGuide } from '../progress/HealthCard';

export function HealthSettingsPage() {
  const nav = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [range, setRange] = useState<'all' | '365' | '90'>('all');
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [paste, setPaste] = useState(false);

  const runExport = async (file: File) => {
    setMsg(null);
    setProgress(0);
    try {
      const r = await importHealthExport(file, range === 'all' ? null : Number(range), setProgress);
      setMsg(formatHealthResult(r));
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <PageHeader title="Apple Health" back={() => nav('/settings')} />
      <div className="space-y-4">
        <Card className="space-y-3">
          <h2 className="font-semibold">📦 Health-Export (Vergangenheit)</h2>
          <p className="text-sm text-slate-500">
            Health-App → Profilbild → <strong>„Alle Gesundheitsdaten exportieren“</strong> → „In Dateien sichern“. Dann hier die{' '}
            <strong>Export.zip</strong> wählen (oder entpackt die <strong>export.xml</strong>). Mehrfach einlesen ist kein Problem.
          </p>
          <label className="flex items-center justify-between text-sm">
            Zeitraum
            <select className="input w-auto py-1.5" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
              <option value="all">alles</option>
              <option value="365">letzte 12 Monate</option>
              <option value="90">letzte 3 Monate</option>
            </select>
          </label>
          <Button className="w-full" disabled={progress !== null} onClick={() => fileRef.current?.click()}>
            Export-Datei wählen
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,.xml,application/zip,text/xml"
            className="hidden"
            data-testid="health-export-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) runExport(f);
              e.target.value = '';
            }}
          />
          {progress !== null && (
            <div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700">
                <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Lese Health-Export … {progress} % (kann bei großen Exporten 1–2 Minuten dauern)</p>
            </div>
          )}
          {msg && <p className="text-sm">{msg}</p>}
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">⌚ Täglich per Kurzbefehl</h2>
          <p className="text-sm text-slate-500">
            Kurzbefehl ausführen → App öffnen → <strong>Heute → ⌚ Health einlesen</strong>.
          </p>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-emerald-600 dark:text-emerald-400">Kurzbefehl einrichten (Anleitung)</summary>
            <div className="mt-3">
              <ShortcutGuide />
            </div>
          </details>
          <details open={paste} onToggle={(e) => setPaste((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer text-sm text-slate-500">Text manuell einfügen</summary>
            <div className="mt-2">
              <HealthPasteForm
                onSubmit={async (text) => {
                  const r = await applyHealthText(text);
                  setMsg(r ? formatHealthResult(r) : HEALTH_EMPTY_MSG);
                  setPaste(false);
                }}
              />
            </div>
          </details>
        </Card>
      </div>
    </>
  );
}
