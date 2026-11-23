import { useState } from 'react';
import { Modal } from '../../components/ui';
import { BodyweightForm, CardioForm, HealthPasteForm } from '../body/BodyForms';
import { applyHealthText, formatHealthResult, HEALTH_EMPTY_MSG, importHealthFromClipboard } from '../body/healthActions';

type Open = 'weight' | 'cardio' | 'paste' | null;

/** Tägliche Eingaben mit einem Tipp: Health einlesen, Gewicht, Cardio. */
export function QuickActions() {
  const [open, setOpen] = useState<Open>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const health = async () => {
    setBusy(true);
    setMsg(null);
    const r = await importHealthFromClipboard();
    setBusy(false);
    if (r.kind === 'ok') setMsg(formatHealthResult(r.result));
    else if (r.kind === 'empty') setMsg(HEALTH_EMPTY_MSG);
    else setOpen('paste');
  };
  const done = (m: string) => {
    setOpen(null);
    setMsg(m);
  };

  const btn =
    'flex flex-col items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-3 text-xs font-medium shadow-sm active:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800/60 dark:active:bg-slate-700';

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className={btn} onClick={health} disabled={busy}>
          <span className="text-2xl" aria-hidden>
            ⌚
          </span>
          Health einlesen
        </button>
        <button type="button" className={btn} onClick={() => setOpen('weight')}>
          <span className="text-2xl" aria-hidden>
            ⚖️
          </span>
          Gewicht
        </button>
        <button type="button" className={btn} onClick={() => setOpen('cardio')}>
          <span className="text-2xl" aria-hidden>
            🏃
          </span>
          Cardio
        </button>
      </div>
      {msg && <p className="mt-2 text-sm">{msg}</p>}

      <Modal open={open === 'weight'} onClose={() => setOpen(null)} title="Körpergewicht">
        <BodyweightForm onDone={done} />
      </Modal>
      <Modal open={open === 'cardio'} onClose={() => setOpen(null)} title="Cardio eintragen">
        <CardioForm onDone={done} />
      </Modal>
      <Modal open={open === 'paste'} onClose={() => setOpen(null)} title="Health einlesen">
        <HealthPasteForm
          onSubmit={async (text) => {
            const r = await applyHealthText(text);
            done(r ? formatHealthResult(r) : HEALTH_EMPTY_MSG);
          }}
        />
      </Modal>
    </div>
  );
}
