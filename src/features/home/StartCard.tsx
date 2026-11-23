import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { startSession } from '../../db/repositories/sessions';
import type { Gym, PlanDay, Plan } from '../../db/types';
import { Button, Card } from '../../components/ui';

const FREE = '__free__';

interface Props {
  gyms: Gym[];
  plans: Plan[];
  days: PlanDay[];
  lastGymId?: string;
}

/** Gym + Training auswählen, dann starten. Kein automatischer Trainingsvorschlag. */
export function StartCard({ gyms, plans, days, lastGymId }: Props) {
  const nav = useNavigate();
  const [gymId, setGymId] = useState('');
  const [dayId, setDayId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!gymId && gyms.length) setGymId(lastGymId && gyms.some((g) => g.id === lastGymId) ? lastGymId : gyms[0].id);
  }, [gyms, lastGymId, gymId]);

  const start = async () => {
    if (!gymId || !dayId) return;
    setBusy(true);
    const s = await startSession(gymId, dayId === FREE ? undefined : dayId);
    nav(`/session/${s.id}`);
  };

  const multiPlan = plans.length > 1;

  return (
    <Card className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="label">Gym</span>
          <select className="input" value={gymId} onChange={(e) => setGymId(e.target.value)} aria-label="Gym">
            {gyms.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Training</span>
          <select className="input" value={dayId} onChange={(e) => setDayId(e.target.value)} aria-label="Training">
            <option value="" disabled>
              wählen …
            </option>
            {plans.map((p) => {
              const list = days.filter((d) => d.planId === p.id).sort((a, b) => a.order - b.order);
              const opts = list.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ));
              return multiPlan ? (
                <optgroup key={p.id} label={p.name}>
                  {opts}
                </optgroup>
              ) : (
                opts
              );
            })}
            <option value={FREE}>Freies Training</option>
          </select>
        </label>
      </div>
      <Button className="w-full" disabled={!gymId || !dayId || busy} onClick={start}>
        Training starten
      </Button>
      <Link to="/quick" className="block text-center text-sm text-emerald-600 dark:text-emerald-400">
        ✍️ Training per Text eintragen
      </Link>
    </Card>
  );
}
