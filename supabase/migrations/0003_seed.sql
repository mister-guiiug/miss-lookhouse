-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ Miss LookHouse — Référentiel des sources (données NON personnelles).   ║
-- ║ Position de collecte RESPONSABLE par défaut : `manual_import` et       ║
-- ║ `server_fetch_allowed = false`. Aucune source n'est aspirée            ║
-- ║ automatiquement tant qu'un connecteur autorisé n'est pas configuré.    ║
-- ║                                                                        ║
-- ║ ⚠️ Hypothèse explicite : à la connaissance de ce projet, leboncoin,    ║
-- ║ SeLoger, Bien'ici et PAP n'exposent PAS d'API publique officielle pour ║
-- ║ la veille tierce, et leurs CGU encadrent l'usage automatisé. La        ║
-- ║ collecte se fait donc par import/capture initiée par l'utilisateur,    ║
-- ║ ou via un connecteur autorisé si/quand il existe. À vérifier au cas    ║
-- ║ par cas avant d'activer un `server_fetch`.                             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

insert into sources (id, label, homepage_url, terms_url, default_mode, server_fetch_allowed, notes)
values
  ('leboncoin', 'leboncoin', 'https://www.leboncoin.fr', 'https://www.leboncoin.fr/cgu',
   'manual_import', false,
   'Pas d''API publique tierce connue. Protection anti-bot. Import/capture utilisateur recommandé.'),
  ('seloger', 'SeLoger', 'https://www.seloger.com', 'https://www.seloger.com/cgu.htm',
   'manual_import', false,
   'Pas d''API publique tierce connue. Import/capture utilisateur ; vérifier les CGU.'),
  ('bienici', 'Bien''ici', 'https://www.bienici.com', 'https://www.bienici.com/cgu',
   'manual_import', false,
   'Pas d''API publique tierce connue. Import/capture utilisateur ; vérifier les CGU.'),
  ('pap', 'PAP (Particulier à Particulier)', 'https://www.pap.fr', 'https://www.pap.fr/cgu',
   'manual_import', false,
   'Pas d''API publique tierce connue. Import/capture utilisateur ; vérifier les CGU.'),
  ('import_generique', 'Import générique', null, null,
   'manual_import', false,
   'Connecteur universel : coller une URL, un JSON, un CSV ou un payload capturé. Toujours disponible.')
on conflict (id) do update set
  label = excluded.label,
  homepage_url = excluded.homepage_url,
  terms_url = excluded.terms_url,
  default_mode = excluded.default_mode,
  notes = excluded.notes;
