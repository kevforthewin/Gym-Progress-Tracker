import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../../db/schema';
import { seedExampleData } from '../../db/seed';
import { getSetting } from '../../db/repositories/settings';
import { activeSession, recentSessions } from '../../db/repositories/sessions';
import { listGyms } from '../../db/repositories/gyms';
import { fmtDate } from '../../domain/units';
import { useLookup } from '../../hooks/useLookup';
import { Button, Card, EmptyState, PageHeader } from '../../components/ui';
import { StatusOverview } from './StatusOverview';
import { StartCard } from './StartCard';

const BACKUP_REMINDER_DAYS = 14;

export function HomePage() {
  const nav = useNavigate();
  const lookup = useLookup();
  const data = useLiveQuery(async () => {
    const [gymCount, gyms, active, recent, activePlanId, lastBackupAt, sessionCount, plans, days] = await Promise.all([
      db.gyms.count(),
      listGyms(),
      activeSession(),
      recentSessions(5),
      getSetting('activePlanId'),
      getSetting('lastBackupAt'),
      db.sessions.count(),
      db.plans.orderBy('order').toArray(),
      db.planDays.toArray(),
    ]);
    // Aktiver Plan zuerst, damit seine Tage oben stehen
    plans.sort((a, b) => (a.id === activePlanId ? -1 : b.id === activePlanId ? 1 : 0));
    const lastGymId = recent[0]?.gymId;
    return { gymCount, gyms, active, recent, lastBackupAt, sessionCount, plans, days, lastGymId };
  });

  if (!data || !lookup) return null;

  if (data.gymCount === 0) {
    return (
      <>
        <PageHeader title="Willkommen 💪" />
        <Card className="space-y-3">
          <p>
            Lege zuerst dein Gym, deine Übungen und Geräte und einen Trainingsplan an – oder starte mit
            Beispieldaten (ein Gym + Push/Pull/Legs), die du danach anpasst.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => seedExampleData()}>Beispieldaten laden</Button>
            <Button variant="secondary" onClick={() => nav('/manage')}>
              Selbst anlegen
            </Button>
          </div>
        </Card>
      </>
    );
  }

  const backupDue =
    data.sessionCount > 0 &&
    (!data.lastBackupAt || Date.now() - data.lastBackupAt > BACKUP_REMINDER_DAYS * 86400_000);

  return (
    <>
      <PageHeader title="Training" />
      <div className="space-y-4">
        {data.active && (
          <Card className="border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20">
            <p className="text-sm text-slate-600 dark:text-slate-300">Laufendes Training</p>
            <p className="text-lg font-bold">
              {lookup.planDays.get(data.active.planDayId ?? '')?.name ?? 'Freies Training'} ·{' '}
              {lookup.gyms.get(data.active.gymId)?.name}
            </p>
            <Button className="mt-3 w-full" onClick={() => nav(`/session/${data.active!.id}`)}>
              Weiter trainieren
            </Button>
          </Card>
        )}

        {data.days.length === 0 && data.plans.length === 0 ? (
          <EmptyState title="Noch kein Trainingsplan">
            <Button variant="secondary" onClick={() => nav('/manage?tab=plans')}>
              Plan anlegen
            </Button>
          </EmptyState>
        ) : (
          <StartCard gyms={data.gyms} plans={data.plans} days={data.days} lastGymId={data.lastGymId} />
        )}

        <StatusOverview />

        {backupDue && (
          <Card className="border-amber-400 bg-amber-50 text-sm dark:bg-amber-900/20">
            ⚠️ Deine Daten liegen nur auf diesem Gerät.{' '}
            <Link to="/settings" className="font-semibold underline">
              Jetzt Backup exportieren
            </Link>
          </Card>
        )}

        <section>
          <h2 className="mb-2 font-semibold">Letzte Trainings</h2>
          {data.recent.length === 0 ? (
            <EmptyState title="Noch keine Trainings erfasst" />
          ) : (
            <ul className="space-y-2">
              {data.recent.map((s) => (
                <li key={s.id}>
                  <Link to={`/session/${s.id}`}>
                    <Card className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{lookup.planDays.get(s.planDayId ?? '')?.name ?? 'Freies Training'}</p>
                        <p className="text-sm text-slate-500">
                          {fmtDate(s.startedAt)} · {lookup.gyms.get(s.gymId)?.name}
                        </p>
                      </div>
                      {!s.finishedAt && <span className="chip bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">läuft</span>}
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
