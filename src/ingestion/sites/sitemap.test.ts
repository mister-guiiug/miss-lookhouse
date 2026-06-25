import { describe, expect, it } from 'vitest';
import {
  collectListingUrls,
  isSitemapIndex,
  parseSitemapLocs,
  resolveDetailUrls,
} from './sitemap';
import type { SiteFetch } from './types';

const URLSET = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://ex.fr/vente/1</loc></url>
  <url><loc>https://ex.fr/vente/2-issoire/maison/1388-maison-de-maitre</loc></url>
  <url><loc>https://ex.fr/location/3-x/appartement/9-t2</loc></url>
  <url><loc>https://ex.fr/vente/729-x/propriete/1416-belle-maison</loc></url>
</urlset>`;

describe('sitemap', () => {
  it('parseSitemapLocs extrait les <loc>', () => {
    expect(parseSitemapLocs(URLSET)).toHaveLength(4);
  });

  it('isSitemapIndex distingue index et urlset', () => {
    expect(isSitemapIndex(URLSET)).toBe(false);
    expect(
      isSitemapIndex(
        '<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>'
      )
    ).toBe(true);
  });

  it('collectListingUrls filtre les pages détail de vente', async () => {
    const fetcher: SiteFetch = {
      async text() {
        return URLSET;
      },
      async json<T>() {
        return [] as unknown as T;
      },
    };
    // Détail = /vente/{ville}/{type}/{id-slug} (3 segments), exclut /vente/1 et /location/.
    const urls = await collectListingUrls(
      fetcher,
      'https://ex.fr/sitemap.xml',
      /\/vente\/[^/]+\/[^/]+\/[^/]+/
    );
    expect(urls).toEqual([
      'https://ex.fr/vente/2-issoire/maison/1388-maison-de-maitre',
      'https://ex.fr/vente/729-x/propriete/1416-belle-maison',
    ]);
  });

  it('collectListingUrls suit un sitemapindex sur un niveau', async () => {
    const fetcher: SiteFetch = {
      async text(url: string) {
        if (url.endsWith('index.xml'))
          return '<sitemapindex><sitemap><loc>https://ex.fr/child.xml</loc></sitemap></sitemapindex>';
        return URLSET;
      },
      async json<T>() {
        return [] as unknown as T;
      },
    };
    const urls = await collectListingUrls(
      fetcher,
      'https://ex.fr/index.xml',
      /\/vente\/[^/]+\/[^/]+\/[^/]+/
    );
    expect(urls).toHaveLength(2);
  });
});

describe('resolveDetailUrls', () => {
  const detailRe = /\/annonces\/vente\/[a-z]+\/[a-z-]+-[0-9]{5}\/[A-Z0-9]+$/;

  it('utilise les URLs directes du sitemap si elles matchent', async () => {
    const SM = `<urlset><url><loc>https://ex.fr/annonces/vente/maison/blois-41000/TAPP1</loc></url></urlset>`;
    const fetcher: SiteFetch = {
      async text() {
        return SM;
      },
      async json<T>() {
        return [] as unknown as T;
      },
    };
    const urls = await resolveDetailUrls(
      fetcher,
      'https://ex.fr/sm.xml',
      detailRe
    );
    expect(urls).toEqual([
      'https://ex.fr/annonces/vente/maison/blois-41000/TAPP1',
    ]);
  });

  it('récolte les liens détail des pages catégorie (cas needsCrawl)', async () => {
    // Le sitemap ne liste QUE des pages catégorie → crawl + récolte des détails.
    const SM = `<urlset>
      <url><loc>https://ex.fr/annonces/vente/maison</loc></url>
      <url><loc>https://ex.fr/blog/guide</loc></url>
    </urlset>`;
    const CAT = `<a href="/annonces/vente/maison/blois-41000/TAPP1">x</a><a href="/annonces/vente/maison/tours-37000/TAPP2">y</a><a href="/contact">z</a>`;
    const fetcher: SiteFetch = {
      async text(url: string) {
        if (url.endsWith('sm.xml')) return SM;
        if (url.includes('/annonces/vente/maison')) return CAT;
        return '';
      },
      async json<T>() {
        return [] as unknown as T;
      },
    };
    const urls = await resolveDetailUrls(
      fetcher,
      'https://ex.fr/sm.xml',
      detailRe,
      {
        base: 'https://ex.fr',
        seedPattern: /\/annonces\/vente\/[a-z]+$/, // ne crawle que la page catégorie, pas le blog
      }
    );
    expect(urls.sort()).toEqual([
      'https://ex.fr/annonces/vente/maison/blois-41000/TAPP1',
      'https://ex.fr/annonces/vente/maison/tours-37000/TAPP2',
    ]);
  });
});
