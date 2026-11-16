import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import envelope from '../data/private.enc.json';
import type { PrivateData, PrivateEntry } from '../data/types';
import { decryptPrivate, type Envelope } from '../lib/crypto';
import { localPrivate } from '../lib/localStore';
import { localStore } from '../data';

/**
 * Booking codes, ticket numbers and contacts are shipped *encrypted*
 * (AES-256-GCM). Each traveller types the shared trip passphrase once;
 * it is kept only on that device so the codes also work offline.
 */
type State = 'none' | 'locked' | 'opening' | 'unlocked';
interface Ctx {
  state: State;
  get: (id?: string) => PrivateEntry | undefined;
  unlock: (pass: string) => Promise<boolean>;
  lock: () => void;
  /** Passphrase, once unlocked (used to encrypt group updates). */
  passphrase?: string;
}
const PrivateCtx = createContext<Ctx>({ state: 'none', get: () => undefined, unlock: async () => false, lock: () => {} });
const KEY = 'ovt:pass';
const env = envelope as Envelope | null;
const LOCAL_PRIVATE = localPrivate(localStore);

export function PrivateProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<PrivateData | null>(null);
  const [passphrase, setPassphrase] = useState<string>();
  // A passphrase saved on this device is being used to decrypt (~1s): don't flash the lock form.
  const [opening, setOpening] = useState(() => {
    try { return !!env && !!localStorage.getItem(KEY); } catch { return false; }
  });
  const state: State = !env ? 'none' : data ? 'unlocked' : opening ? 'opening' : 'locked';

  const unlock = useCallback(async (pass: string) => {
    if (!env) return false;
    try {
      const d = await decryptPrivate(env, pass);
      setData(d);
      setPassphrase(pass);
      try { localStorage.setItem(KEY, pass); } catch { /* ignore */ }
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (saved && env) {
      unlock(saved).then((ok) => {
        // Wrong saved passphrase (e.g. it was changed in a new version): forget it.
        if (!ok) try { localStorage.removeItem(KEY); } catch { /* ignore */ }
        setOpening(false);
      });
    }
  }, [unlock]);

  const lock = () => {
    setData(null);
    setPassphrase(undefined);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  };

  // Codes typed on this phone are merged over the published (encrypted) ones.
  const get = (id?: string) => {
    if (!id || !data) return undefined;
    const pub = data[id];
    const loc = LOCAL_PRIVATE[id];
    return pub || loc ? { ...pub, ...loc } : undefined;
  };
  return <PrivateCtx.Provider value={{ state, get, unlock, lock, passphrase }}>{children}</PrivateCtx.Provider>;
}

export const usePrivate = () => useContext(PrivateCtx);
