import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array } from './webpush';

describe('urlBase64ToUint8Array', () => {
  it('décode du base64url sans padding', () => {
    const out = urlBase64ToUint8Array('aGVsbG8'); // "hello"
    expect(Array.from(out)).toEqual([104, 101, 108, 108, 111]);
  });

  it('décode une clé VAPID P-256 → 65 octets, préfixe 0x04', () => {
    const vapid =
      'BPNQXXVaqeXDYgkIHnL8yx9xQ4L6fXxUj2vQQnoj9TU0KRrypJ4xUXYRa4WZ6AVWckuGmBt_C_WqmCDvvCPaADo';
    const out = urlBase64ToUint8Array(vapid);
    expect(out.length).toBe(65); // point EC non compressé
    expect(out[0]).toBe(0x04);
  });
});
