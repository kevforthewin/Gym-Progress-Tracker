import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

  // Trainingstage nur einmal pro Name anzeigen (erster Plan = aktiver Plan hat Vorrang)
  const options: PlanDay[] = [];
  for (const p of plans)
    for (const d of days.filter((x) => x.planId === p.id).sort((a, b) => a.order - b.order))
      if (!options.some((o) => o.name.trim().toLowerCase() === d.name.trim().toLowerCase())) options.push(d);

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
            {options.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            <option value={FREE}>Freies Training</option>
          </select>
        </label>
      </div>
      <Button className="w-full" disabled={!gymId || !dayId || busy} onClick={start}>
        Training starten
      </Button>
    </Card>
  );
}
