import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemeProvider } from '@mister-guiiug/dev-wpa-config/react/theme-provider';
import { IconsProvider } from '@mister-guiiug/dev-wpa-config/react/icons-context';
import { useAppStore } from './store/useAppStore';
import { THEME_COLOR, THEME_LEGACY_KEYS, THEME_STORAGE_KEY } from './theme';
import { AuthProvider } from './auth/useAuth';
import { AuthGate } from './auth/AuthGate';
import { SupabaseSync } from './backend/SupabaseSync';
import { Layout } from './components/Layout';
import { OfflineBanner } from './components/OfflineBanner';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { SearchesScreen } from './features/searches/SearchesScreen';
import { SearchEditScreen } from './features/searches/SearchEditScreen';
import { ListingsScreen } from './features/listings/ListingsScreen';
import { ListingDetailScreen } from './features/listings/ListingDetailScreen';
import { SimilarScreen } from './features/similar/SimilarScreen';
import { NotificationsScreen } from './features/notifications/NotificationsScreen';
import { SettingsScreen } from './features/settings/SettingsScreen';
import { ImportScreen } from './features/import/ImportScreen';
import { ProcessingScreen } from './features/processing/ProcessingScreen';
import { ConnectorsScreen } from './features/connectors/ConnectorsScreen';

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
            <Route path="/traitements" element={<ProcessingScreen />} />
            <Route path="/connecteurs" element={<ConnectorsScreen />} />
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
    // UN SEUL écrivain de `data-theme`. `ThemeToggle` et l'écran Réglages
    // lisent ce fournisseur ; ni l'un ni l'autre n'appelle `useTheme` pour son
    // compte, ce qui créerait un second écrivain.
    //
    // `legacyKeys` reprend la clé historique `lh_theme` : la préférence déjà
    // enregistrée sur l'appareil est relue puis réécrite sous la clé famille,
    // une seule fois. Sans elle, l'adoption remettrait tout le monde au thème
    // système — silencieusement.
    //
    // Pas d'`appId` : l'app peint elle-même ses `--dwc-*` depuis ses propres
    // jetons dans `styles.css`. Une palette du catalogue les poserait en style
    // EN LIGNE sur `<html>`, qui l'emporterait sur ce branchement.
    <ThemeProvider
      storageKey={THEME_STORAGE_KEY}
      legacyKeys={THEME_LEGACY_KEYS}
      themeColor={THEME_COLOR}
    >
      {/* Le socle dessine ses propres SVG ; l'app est sous lucide partout. */}
      <IconsProvider icons={{ light: Sun, dark: Moon, system: Monitor }}>
        <AuthProvider>
          {/* AU-DESSUS de la garde, pas dedans : l'écran de connexion est le
              premier endroit où la coupure fait mal, et c'est justement celui
              qui n'affichait rien. */}
          <OfflineBanner />
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
      </IconsProvider>
    </ThemeProvider>
  );
}
