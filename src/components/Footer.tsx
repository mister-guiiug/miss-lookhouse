import { Coffee } from 'lucide-react';
import { REPO_URL, SPONSOR_URL } from '../links';

// lucide 1.x a retiré les icônes de marque → SVG inline pour le logo GitHub.
function GithubMark() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.575.105.785-.25.785-.555 0-.275-.01-1.18-.015-2.14-3.2.695-3.875-1.36-3.875-1.36-.525-1.33-1.28-1.685-1.28-1.685-1.045-.715.08-.7.08-.7 1.155.08 1.765 1.185 1.765 1.185 1.025 1.76 2.69 1.25 3.345.955.105-.74.4-1.25.725-1.535-2.555-.29-5.24-1.275-5.24-5.675 0-1.255.45-2.28 1.185-3.085-.12-.29-.515-1.46.11-3.045 0 0 .965-.31 3.165 1.18a11 11 0 0 1 2.88-.385c.975.005 1.96.13 2.88.385 2.2-1.49 3.16-1.18 3.16-1.18.63 1.585.235 2.755.115 3.045.74.805 1.185 1.83 1.185 3.085 0 4.41-2.69 5.38-5.255 5.665.415.355.78 1.06.78 2.135 0 1.54-.015 2.78-.015 3.16 0 .305.21.665.79.55A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="row" style={{ justifyContent: 'center', gap: '1rem' }}>
        <a
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="row"
        >
          <GithubMark /> Code source
        </a>
        <a
          href={SPONSOR_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="row"
        >
          <Coffee size={14} aria-hidden /> Soutenir
        </a>
      </div>
      <div style={{ marginTop: '0.4rem' }}>
        Collecte responsable · données locales à votre appareil en mode démo.
      </div>
    </footer>
  );
}
