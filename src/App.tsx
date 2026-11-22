import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { HomePage } from './features/home/HomePage';
import { StartSessionPage } from './features/session/StartSessionPage';
import { ActiveSessionPage } from './features/session/ActiveSessionPage';
import { QuickEntryPage } from './features/session/QuickEntryPage';
import { HistoryPage } from './features/history/HistoryPage';
import { ManagePage } from './features/manage/ManagePage';
import { GymDetailPage } from './features/manage/GymDetailPage';
import { PlanDetailPage } from './features/manage/PlanDetailPage';
import { SettingsPage } from './features/settings/SettingsPage';

// Recharts ist groß -> eigener Chunk.
const ProgressPage = lazy(() => import('./features/progress/ProgressTabs').then((m) => ({ default: m.ProgressPage })));

export default function App() {
  return (
    <HashRouter>
      <main className="mx-auto max-w-2xl px-4 pb-[calc(5rem+env(safe-area-inset-bottom))]">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/session/start" element={<StartSessionPage />} />
          <Route path="/quick" element={<QuickEntryPage />} />
          <Route path="/session/:id" element={<ActiveSessionPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/progress" element={<Suspense fallback={null}><ProgressPage /></Suspense>} />
          <Route path="/manage" element={<ManagePage />} />
          <Route path="/manage/gym/:id" element={<GymDetailPage />} />
          <Route path="/manage/plan/:id" element={<PlanDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </HashRouter>
  );
}
