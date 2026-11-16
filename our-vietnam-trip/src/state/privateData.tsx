import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import envelope from '../data/private.enc.json';
import type { PrivateData, PrivateEntry } from '../data/types';
import { decryptPrivate, type Envelope } from '../lib/crypto';

/**
 * Booking codes, ticket numbers and contacts are shipped *encrypted*
 * (AES-256-GCM). Each traveller types the shared trip passphrase once;
 * it is kept only on that device so the codes also work offline.
 */
type State = 'none' | 'locked' | 'unlocked';
interface Ctx {
  state: State;
  get: (id?: string) => PrivateEntry | undefined;
  unlock: (pass: string) => Promise<boolean>;
  lock: () => void;
}
const PrivateCtx = createContext<Ctx>({ state: 'none', get: () => undefined, unlock: async () => false, lock: () => {} });
const KEY = 'ovt:pass';
const env = envelope as Envelope | null;

export function PrivateProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<PrivateData | null>(null);
  const state: State = !env ? 'none' : data ? 'unlocked' : 'locked';

  const unlock = useCallback(async (pass: string) => {
    if (!env) return false;
    try {
      const d = await decryptPrivate(env, pass);
      setData(d);
      try { localStorage.setItem(KEY, pass); } catch { /* ignore */ }
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* ignore */ }
    if (saved && env) unlock(saved).then((ok) => { if (!ok) try { localStorage.removeItem(KEY); } catch { /* ignore */ } });
  }, [unlock]);

  const lock = () => {
    setData(null);
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  };

  return <PrivateCtx.Provider value={{ state, get: (id) => (id && data ? data[id] : undefined), unlock, lock }}>{children}</PrivateCtx.Provider>;
}

export const usePrivate = () => useContext(PrivateCtx);
