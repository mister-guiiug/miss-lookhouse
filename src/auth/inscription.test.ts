import { describe, expect, it } from 'vitest';
import {
  MESSAGE_INSCRIPTION_SUR_INVITATION,
  REFUS_INVITATION_SERVEUR,
  estRefusSurInvitation,
  messageErreurConnexion,
} from './inscription';

describe('estRefusSurInvitation', () => {
  it('reconnaît le message exact du hook de 0018', () => {
    expect(estRefusSurInvitation({ message: REFUS_INVITATION_SERVEUR })).toBe(
      true
    );
  });

  it('tolère une apostrophe typographique ou une autre casse', () => {
    expect(
      estRefusSurInvitation({ message: 'L’inscription est SUR INVITATION.' })
    ).toBe(true);
  });

  it('ne confond pas les autres erreurs d’authentification', () => {
    for (const message of [
      'Invalid login credentials',
      'Signups not allowed for this instance',
      'Email rate limit exceeded',
      '',
    ])
      expect(estRefusSurInvitation({ message })).toBe(false);
    expect(estRefusSurInvitation(null)).toBe(false);
    expect(estRefusSurInvitation({ message: null })).toBe(false);
  });
});

describe('messageErreurConnexion', () => {
  it('traduit le refus en une phrase claire', () => {
    expect(messageErreurConnexion({ message: REFUS_INVITATION_SERVEUR })).toBe(
      MESSAGE_INSCRIPTION_SUR_INVITATION
    );
    expect(MESSAGE_INSCRIPTION_SUR_INVITATION).toMatch(/sur invitation/);
  });

  it('laisse les autres messages tels que Supabase les rend', () => {
    expect(messageErreurConnexion({ message: 'Email not confirmed' })).toBe(
      'Email not confirmed'
    );
  });
});
