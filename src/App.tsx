import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { AuthProvider } from './auth/useAuth';
import { AuthGate } from './auth/AuthGate';
import { SupabaseSync } from './backend/SupabaseSync';
import { Layout } from './components/Layout';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { SearchesScreen } from './features/searches/SearchesScreen';
import { SearchEditScreen } from './features/searches/SearchEditScreen';
import { ListingsScreen } from './features/listings/ListingsScreen';
import { ListingDetailScreen } from './features/listings/ListingDetailScreen';
import { SimilarScreen } from './features/similar/SimilarScreen';
import { NotificationsScreen } from './features/notifications/NotificationsScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { ImportScreen } from './features/import/ImportScreen';

const MapScreen = lazy(() =>
  import('./features/map/MapScreen').then(m => ({ default: m.MapScreen }))
);

function RoutedApp() {
  return (
    <>
      <SupabaseSync />
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardScreen />} />
            <Route path="/recherches" element={<SearchesScreen />} />
            <Route path="/recherches/nouvelle" element={<SearchEditScreen />} />
            <Route
              path="/recherches/:id/modifier"
              element={<SearchEditScreen />}
            />
            <Route path="/annonces" element={<ListingsScreen />} />
            <Route path="/annonces/:id" element={<ListingDetailScreen />} />
            <Route path="/similaires" element={<SimilarScreen />} />
            <Route path="/import" element={<ImportScreen />} />
            <Route
              path="/carte"
              element={
                <Suspense
                  fallback={
                    <div className="empty">Chargement de la carte…</div>
                  }
                >
                  <MapScreen />
                </Suspense>
              }
            />
            <Route path="/notifications" element={<NotificationsScreen />} />
            <Route path="/reglages" element={<SettingsScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </>
  );
}

export function App() {
  const init = useAppStore(s => s.init);
  const ready = useAppStore(s => s.ready);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <AuthProvider>
      <AuthGate>
        {ready ? (
          <RoutedApp />
        ) : (
          <div className="empty" style={{ paddingTop: '4rem' }}>
            Chargement…
          </div>
        )}
      </AuthGate>
    </AuthProvider>
  );
}
