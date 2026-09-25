/**
 * LE CANAL E-MAIL DE `notify` — ce que ces tests tiennent.
 *
 * La fonction Edge n'est qu'une boucle d'entrées-sorties ; les décisions sont
 * ici. On tient les quatre promesses du canal :
 *
 *   1. secrets absents = canal IGNORÉ, jamais en échec ;
 *   2. on n'écrit qu'à qui l'a demandé, à l'adresse VÉRIFIÉE de son compte ;
 *   3. le message ne dit que la notification et le lien — échappé en HTML ;
 *   4. la requête a la forme de l'API Resend, clé d'idempotence comprise.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APP_URL,
  DEFAULT_EMAIL_API_URL,
  buildEmailRequest,
  composeNotificationEmail,
  decideEmail,
  emailStatusFromHttp,
  escapeHtml,
  notificationLink,
  readEmailSetup,
  type EmailSetup,
} from './email';
import { statusFromCounts } from './delivery';

const env =
  (vars: Record<string, string | undefined>) =>
  (name: string): string | undefined =>
    vars[name];

const ready: EmailSetup = readEmailSetup(
  env({ EMAIL_API_KEY: 're_test', EMAIL_FROM: 'Alertes <alertes@exemple.fr>' })
);

const confirmed = {
  email: 'famille@exemple.fr',
  email_confirmed_at: '2026-09-01T10:00:00Z',
};

describe('readEmailSetup', () => {
  it('sans clé ou sans expéditeur : absent (le défaut du dépôt)', () => {
    expect(readEmailSetup(env({})).state).toBe('absent');
    expect(readEmailSetup(env({ EMAIL_API_KEY: 're_x' })).state).toBe('absent');
    expect(
      readEmailSetup(env({ EMAIL_FROM: 'a@b.fr', EMAIL_API_KEY: '  ' })).state
    ).toBe('absent');
  });

  it('les deux posés : prêt, sur l’API Resend et le site Pages par défaut', () => {
    expect(ready).toEqual({
      state: 'ready',
      config: {
        apiUrl: DEFAULT_EMAIL_API_URL,
        apiKey: 're_test',
        from: 'Alertes <alertes@exemple.fr>',
        appUrl: DEFAULT_APP_URL,
      },
    });
  });

  it('un autre fournisseur compatible passe par EMAIL_API_URL', () => {
    const s = readEmailSetup(
      env({
        EMAIL_API_KEY: 'k',
        EMAIL_FROM: 'a@b.fr',
        EMAIL_API_URL: 'https://mail.exemple.fr/v1/emails',
      })
    );
    expect(s.state === 'ready' && s.config.apiUrl).toBe(
      'https://mail.exemple.fr/v1/emails'
    );
  });

  it('une URL non https est une erreur d’exploitation, pas une absence', () => {
    const s = readEmailSetup(
      env({
        EMAIL_API_KEY: 'k',
        EMAIL_FROM: 'a@b.fr',
        EMAIL_API_URL: 'http://mail.exemple.fr/emails',
      })
    );
    expect(s.state).toBe('invalid');
  });

  it('APP_URL est ramenée à une base propre, terminée par « / »', () => {
    const s = readEmailSetup(
      env({
        EMAIL_API_KEY: 'k',
        EMAIL_FROM: 'a@b.fr',
        APP_URL: 'https://exemple.fr/app?x=1#/annonces',
      })
    );
    expect(s.state === 'ready' && s.config.appUrl).toBe(
      'https://exemple.fr/app/'
    );
  });
});

describe('decideEmail', () => {
  it('sans opt-in : ignoré, quoi qu’il arrive', () => {
    expect(decideEmail(false, ready, confirmed)).toEqual({
      send: false,
      status: 'skipped',
      reason: 'not_opted_in',
    });
  });

  it('secrets absents : ignoré — JAMAIS en échec', () => {
    const d = decideEmail(true, { state: 'absent' }, confirmed);
    expect(d).toEqual({
      send: false,
      status: 'skipped',
      reason: 'not_configured',
    });
  });

  it('secrets mal posés : en échec, pour que ça se voie', () => {
    const d = decideEmail(
      true,
      { state: 'invalid', problem: 'EMAIL_API_URL doit être en https.' },
      confirmed
    );
    expect(d.send === false && d.status).toBe('failed');
  });

  it('pas d’adresse confirmée : ignoré (on n’écrit pas à une adresse non vérifiée)', () => {
    expect(
      decideEmail(true, ready, {
        email: 'x@y.fr',
        email_confirmed_at: null,
      })
    ).toMatchObject({ send: false, reason: 'no_confirmed_address' });
    expect(decideEmail(true, ready, null)).toMatchObject({
      send: false,
      status: 'skipped',
    });
  });

  it('opt-in, serveur prêt, adresse vérifiée : on écrit, à elle seule', () => {
    expect(decideEmail(true, ready, confirmed)).toEqual({
      send: true,
      to: 'famille@exemple.fr',
    });
  });
});

describe('composeNotificationEmail', () => {
  const appUrl = 'https://exemple.fr/app/';

  it('texte brut : le titre, le corps, le lien vers l’annonce — et rien d’autre', () => {
    const m = composeNotificationEmail(
      {
        id: 'n1',
        title: 'Baisse de prix',
        body: 'Maison 5 pièces : -3,4 % (-10000 €)',
        listingId: 'a1b2',
      },
      appUrl
    );
    expect(m.subject).toBe('Miss LookHouse — Baisse de prix');
    const lines = m.text.split('\n');
    expect(lines[0]).toBe('Baisse de prix');
    expect(lines).toContain('Maison 5 pièces : -3,4 % (-10000 €)');
    expect(lines).toContain(
      'Voir l’annonce : https://exemple.fr/app/#/annonces/a1b2'
    );
    expect(m.text).toContain('https://exemple.fr/app/#/reglages');
    expect(m.html).toContain('href="https://exemple.fr/app/#/annonces/a1b2"');
    expect(m.html).toContain('lang="fr"');
  });

  it('échappe le HTML venu des annonces (titre et corps)', () => {
    const m = composeNotificationEmail(
      {
        id: 'n2',
        title: '<img src=x onerror=alert(1)>',
        body: 'Ligne 1\n<script>alert("x")</script>',
        listingId: null,
      },
      appUrl
    );
    expect(m.html).not.toContain('<script>');
    expect(m.html).not.toContain('<img src=x');
    expect(m.html).toContain('&lt;script&gt;');
    expect(m.html).toContain('Ligne 1<br>');
  });

  it('sans annonce, le lien mène au centre d’alertes', () => {
    const m = composeNotificationEmail(
      { id: 'n3', title: 'Test', body: null, listingId: null },
      appUrl
    );
    expect(m.text).toContain(
      'Ouvrir vos alertes : https://exemple.fr/app/#/notifications'
    );
  });

  it('un titre sur plusieurs lignes tient sur une ligne d’objet, bornée', () => {
    const m = composeNotificationEmail(
      {
        id: 'n4',
        title: `A\nB   ${'x'.repeat(300)}`,
        body: '',
        listingId: null,
      },
      appUrl
    );
    expect(m.subject).not.toMatch(/\n/);
    expect(m.subject.length).toBeLessThanOrEqual(160);
  });
});

describe('notificationLink', () => {
  it('encode l’identifiant', () => {
    expect(notificationLink('https://e.fr/', 'a/b')).toBe(
      'https://e.fr/#/annonces/a%2Fb'
    );
  });
});

describe('escapeHtml', () => {
  it('neutralise les cinq caractères actifs', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
  });
});

describe('buildEmailRequest', () => {
  it('a la forme de l’API Resend, avec une clé d’idempotence par notification', () => {
    if (ready.state !== 'ready') throw new Error('configuration attendue');
    const req = buildEmailRequest(
      ready.config,
      'famille@exemple.fr',
      { subject: 'S', text: 'T', html: '<p>H</p>' },
      'notif-42'
    );
    expect(req.url).toBe('https://api.resend.com/emails');
    expect(req.init.method).toBe('POST');
    expect(req.init.headers).toEqual({
      Authorization: 'Bearer re_test',
      'Content-Type': 'application/json',
      'Idempotency-Key': 'miss-lookhouse-notification-notif-42',
    });
    expect(JSON.parse(req.init.body)).toEqual({
      from: 'Alertes <alertes@exemple.fr>',
      to: ['famille@exemple.fr'],
      subject: 'S',
      text: 'T',
      html: '<p>H</p>',
    });
  });
});

describe('statuts', () => {
  it('HTTP : 2xx remis, tout le reste en échec', () => {
    expect(emailStatusFromHttp(200)).toBe('sent');
    expect(emailStatusFromHttp(202)).toBe('sent');
    for (const code of [301, 400, 401, 403, 422, 429, 500, 503])
      expect(emailStatusFromHttp(code)).toBe('failed');
  });

  it('plusieurs envois pour un canal : remis, partiel, en échec, ou ignoré', () => {
    expect(statusFromCounts(2, 0)).toBe('sent');
    expect(statusFromCounts(1, 1)).toBe('partial');
    expect(statusFromCounts(0, 2)).toBe('failed');
    expect(statusFromCounts(0, 0)).toBe('skipped');
  });
});
