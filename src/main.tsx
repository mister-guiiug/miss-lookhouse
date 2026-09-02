import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { AppUpdates } from '@mister-guiiug/dev-wpa-config/react/app-updates';
import './styles.css';
import { App } from './App';

const el = document.getElementById('app');
if (el) {
  createRoot(el).render(
    <StrictMode>
      {/* Mise à jour en `prompt` (vite.config.ts) : la nouvelle version est
          téléchargée en fond, le bandeau du socle propose de recharger, et
          l'utilisateur choisit le moment. Avant le 02/09/2026, `autoUpdate`
          rechargeait la page de lui-même — en pleine saisie d'une recherche.
          En développement, `registerSW` vaut `undefined` : aucun worker. */}
      <AppUpdates registerSW={import.meta.env.PROD ? registerSW : undefined}>
        <App />
      </AppUpdates>
    </StrictMode>
  );
}
