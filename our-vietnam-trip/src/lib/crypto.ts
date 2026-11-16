import type { PrivateData } from '../data/types';

/** Encrypted private data envelope (see scripts/encrypt-private.mjs). */
export interface Envelope {
  v: 1;
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  ct: string; // base64 (AES-256-GCM ciphertext + tag)
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );
}

/** Throws if the passphrase is wrong (GCM authentication fails). */
export async function decryptPrivate(env: Envelope, passphrase: string): Promise<PrivateData> {
  const key = await deriveKey(passphrase, b64(env.salt), env.iterations);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv) as BufferSource }, key, b64(env.ct) as BufferSource);
  return JSON.parse(new TextDecoder().decode(plain)) as PrivateData;
}
