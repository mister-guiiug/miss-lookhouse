import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { caseDeSession } from './caseDeSession';

describe('caseDeSession', () => {
  it('est la case où le SDK installé range la session', () => {
    // La formule est DÉRIVÉE, pas lue : c'est ce test qui verra une montée du
    // SDK qui la changerait.
    const url = 'https://abcdefghijklmnop.supabase.co';
    const client = createClient(url, 'cle-anon-de-test', {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const range = (client.auth as unknown as { storageKey: string }).storageKey;
    expect(caseDeSession(url)).toBe(range);
    expect(range).toBe('sb-abcdefghijklmnop-auth-token');
  });

  it('sans URL de projet, il n’y a pas de case', () => {
    expect(caseDeSession('')).toBeUndefined();
    expect(caseDeSession('pas une url')).toBeUndefined();
  });
});
