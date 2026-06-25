import { describe, expect, it } from 'vitest';
import { extractJsonLd, jsonLdToRaw } from './jsonld';
import { parseListings } from '../schema';

// Bloc JSON-LD réaliste (format squarehabitat : Apartment + UnitPriceSpecification).
const HTML = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Square Habitat"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"UnitPriceSpecification","price":183000,"minPrice":183000,"priceCurrency":"EUR","url":"https://ex.fr/a/annonces/biens/x"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Apartment","name":"Appartement Juan les Pins","url":"https://ex.fr/a/annonces/biens/x","description":"Beau T2","numberOfRooms":2,"floorSize":{"@type":"QuantitativeValue","value":28.1,"unitCode":"MTK"},"address":{"@type":"PostalAddress","addressLocality":"Juan les Pins 06160","addressCountry":"FR"},"geo":{"@type":"GeoCoordinates","latitude":43.57,"longitude":7.12}}</script>
</head><body>...</body></html>`;

describe('extractJsonLd / jsonLdToRaw', () => {
  it('extrait les blocs et aplatit', () => {
    const objs = extractJsonLd(HTML);
    expect(objs.map(o => o['@type'])).toEqual([
      'Organization',
      'UnitPriceSpecification',
      'Apartment',
    ]);
  });

  it('mappe Apartment + UnitPriceSpecification en objet canonique', () => {
    const raw = jsonLdToRaw(extractJsonLd(HTML))!;
    const { listings, errors } = parseListings([
      { ...raw, sourceId: 'squarehabitat' },
    ]);
    expect(errors).toEqual([]);
    const l = listings[0]!;
    expect(l.propertyType).toBe('appartement');
    expect(l.title).toBe('Appartement Juan les Pins');
    expect(l.price).toBe(183000);
    expect(l.surfaceM2).toBe(28.1);
    expect(l.rooms).toBe(2);
    expect(l.city).toBe('Juan les Pins');
    expect(l.postalCode).toBe('06160');
    expect(l.lat).toBe(43.57);
    expect(l.lng).toBe(7.12);
  });

  it('renvoie null si aucun objet exploitable', () => {
    expect(
      jsonLdToRaw(extractJsonLd('<html><body>rien</body></html>'))
    ).toBeNull();
  });
});
