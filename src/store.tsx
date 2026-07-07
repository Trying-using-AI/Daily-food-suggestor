import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ensureAuth,
  getPreferences,
  listPantry,
  savePreferences as apiSavePreferences,
} from './lib/api';
import type { PantryItem, Preferences } from './types';

interface AppState {
  loading: boolean;
  userId: string | null;
  prefs: Preferences | null;
  pantry: PantryItem[];
  usePantry: boolean;
  error: string | null;
  setUsePantry: (v: boolean) => void;
  refreshPantry: () => Promise<void>;
  savePreferences: (p: Partial<Preferences>) => Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [pantry, setPantry] = useState<PantryItem[]>([]);
  const [usePantry, setUsePantryState] = useState<boolean>(
    () => localStorage.getItem('usePantry') === '1',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const id = await ensureAuth();
        if (!active) return;
        setUserId(id);
        const [p, pan] = await Promise.all([getPreferences(), listPantry()]);
        if (!active) return;
        setPrefs(p);
        setPantry(pan as PantryItem[]);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setUsePantry = useCallback((v: boolean) => {
    setUsePantryState(v);
    localStorage.setItem('usePantry', v ? '1' : '0');
  }, []);

  const refreshPantry = useCallback(async () => {
    const pan = await listPantry();
    setPantry(pan as PantryItem[]);
  }, []);

  const savePreferences = useCallback(
    async (p: Partial<Preferences>) => {
      if (!userId) throw new Error('Not signed in yet.');
      const saved = await apiSavePreferences(userId, p);
      setPrefs(saved);
    },
    [userId],
  );

  const value = useMemo<AppState>(
    () => ({
      loading,
      userId,
      prefs,
      pantry,
      usePantry,
      error,
      setUsePantry,
      refreshPantry,
      savePreferences,
    }),
    [loading, userId, prefs, pantry, usePantry, error, setUsePantry, refreshPantry, savePreferences],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
