// ╔══════════════════════════════════════════════════════════════════════╗
// ║ Garde-fous réseau partagés (Edge Functions).                          ║
// ║ - fetchWithTimeout : aucun fetch sortant ne peut pendre indéfiniment   ║
// ║   (sinon un endpoint lent bloque la boucle de dispatch/collecte).      ║
// ║ - assertPublicHttpsUrl : anti-SSRF — refuse loopback / IP privées /    ║
// ║   link-local (dont l'endpoint de métadonnées 169.254.169.254).         ║
// ║ - timingSafeEqual : comparaison de secret à temps constant.            ║
// ╚══════════════════════════════════════════════════════════════════════╝

/** fetch avec timeout (défaut 8 s). Lève une AbortError si dépassé. */
export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit = {},
  ms = 8000
): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase();
  if (
    v === '::1' ||
    v === '0.0.0.0' ||
    v.startsWith('fe80:') ||
    v.startsWith('fc') ||
    v.startsWith('fd') ||
    v.startsWith('::ffff:127.') ||
    v.startsWith('127.') ||
    v.startsWith('10.') ||
    v.startsWith('192.168.') ||
    v.startsWith('169.254.')
  ) {
    return true;
  }
  return /^172\.(1[6-9]|2\d|3[01])\./.test(v);
}

/**
 * Valide une URL de connecteur : https + hôte PUBLIC (anti-SSRF). Lève sinon.
 * Pour un nom d'hôte, on résout le DNS et on refuse toute IP privée.
 */
export async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('URL invalide.');
  }
  if (u.protocol !== 'https:') throw new Error('URL https requise.');
  const host = u.hostname.replace(/^\[|\]$/g, '');

  if (/^[0-9.]+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) throw new Error('Hôte interne interdit.');
    return u;
  }
  // Hôte = nom de domaine : on résout et on vérifie que les IP sont publiques.
  try {
    const a = await Deno.resolveDns(host, 'A').catch(() => [] as string[]);
    const aaaa = await Deno.resolveDns(host, 'AAAA').catch(
      () => [] as string[]
    );
    const ips = [...a, ...aaaa];
    if (ips.length > 0 && ips.some(isPrivateIp)) {
      throw new Error('Hôte interne interdit.');
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'Hôte interne interdit.') throw e;
    // resolveDns indisponible : on tolère (le filtre IP-littérale reste actif).
  }
  return u;
}

/** Comparaison de chaînes à temps constant (anti-canal temporel). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
