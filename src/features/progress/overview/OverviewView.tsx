import { useDashboardData } from './useDashboardData';
import { ConsistencyCard } from './ConsistencyCard';
import { BalanceCard } from './BalanceCard';
import { AdherenceCard, ProgressRateCard } from './TargetsCard';
import { HighlightsCard } from './HighlightsCard';
import { EmptyState } from '../../../components/ui';

/** Fortschritt → Überblick: Konsistenz, Balance, Ziel-Erfüllung, Fortschrittsquote, Kraft-Highlights. */
export function OverviewView() {
  const data = useDashboardData();
  if (!data) return null;
  if (!data.sessions.length) return <EmptyState title="Noch keine Trainings – starte dein erstes auf „Heute“." />;
  return (
    <div className="space-y-4">
      <ConsistencyCard data={data} />
      <BalanceCard data={data} />
      <AdherenceCard data={data} />
      <ProgressRateCard data={data} />
      <HighlightsCard data={data} />
    </div>
  );
}
