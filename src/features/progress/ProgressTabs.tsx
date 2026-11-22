import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../../components/ui';
import { ExerciseProgress } from './ProgressPage';
import { VolumeView } from './VolumeView';
import { BodyView } from './BodyView';

type Tab = 'exercises' | 'volume' | 'body';

export function ProgressPage() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'exercises';
  const setTab = (t: Tab) => {
    const p = new URLSearchParams(params);
    p.set('tab', t);
    setParams(p, { replace: true });
  };
  return (
    <>
      <PageHeader title="Fortschritt" />
      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'exercises', label: 'Übungen' },
          { value: 'volume', label: 'Volumen' },
          { value: 'body', label: 'Körper & Cardio' },
        ]}
      />
      {tab === 'exercises' && <ExerciseProgress />}
      {tab === 'volume' && <VolumeView />}
      {tab === 'body' && <BodyView />}
    </>
  );
}
