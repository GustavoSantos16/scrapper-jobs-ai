import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useSettings } from './api/settings.ts';
import { Layout } from './components/Layout.tsx';
import { EmptyState, Loading } from './components/ui.tsx';
import { setDisplayTimeZone } from './lib/format.ts';
import { SavedFilters } from './components/SavedFilters.tsx';
import { ApplicationsPage } from './pages/ApplicationsPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { ExportPage } from './pages/ExportPage.tsx';
import { JobDetailPage } from './pages/JobDetailPage.tsx';
import { JobsPage } from './pages/JobsPage.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { ReviewsPage } from './pages/ReviewsPage.tsx';
import { RunsPage } from './pages/RunsPage.tsx';
import { SourcesPage } from './pages/SourcesPage.tsx';
import { TodayPage } from './pages/TodayPage.tsx';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false } },
});

/** Applies the configured display time zone before any date is rendered. */
function DisplaySettingsGate({ children }: { children: ReactNode }) {
  const settings = useSettings();
  if (settings.isPending) return <Loading label="Conectando à API local…" />;
  if (settings.data) setDisplayTimeZone(settings.data.display.timezone);
  return children;
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/hoje', element: <TodayPage /> },
      { path: '/vagas', element: <JobsPage title="Todas as vagas" splitApplied headerActions={<SavedFilters />} /> },
      { path: '/vagas/:id', element: <JobDetailPage /> },
      {
        path: '/favoritas',
        element: <JobsPage title="Favoritas" fixed={{ favorite: true, status: 'all' }} hide={['favorite']} emptyTitle="Nenhuma favorita ainda" emptyText="Marque vagas com a estrela para encontrá-las aqui." />,
      },
      { path: '/candidaturas', element: <ApplicationsPage /> },
      { path: '/exportar', element: <ExportPage /> },
      { path: '/perfil', element: <ProfilePage /> },
      { path: '/configuracoes', element: <SettingsPage /> },
      { path: '/fontes', element: <SourcesPage /> },
      { path: '/capturas', element: <RunsPage /> },
      { path: '/duplicatas', element: <ReviewsPage /> },
      { path: '*', element: <EmptyState title="Página não encontrada" /> },
    ],
  },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DisplaySettingsGate>
        <RouterProvider router={router} />
      </DisplaySettingsGate>
    </QueryClientProvider>
  );
}
