/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Settings } from '@/types';

interface AppContextValue {
  settings: Settings | null;
  loadingSettings: boolean;
  refreshSettings: () => Promise<void>;
  darkMode: boolean;
  toggleDarkMode: () => void;
  notify: (message: string, type?: 'success' | 'error' | 'info') => void;
  notifications: AppNotification[];
  dismissNotification: (id: string) => void;
}

export interface AppNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const refreshSettings = async () => {
    const { data, error } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (error) {
      console.error('Failed to load settings:', error.message);
      return;
    }
    if (data) {
      setSettings(data as Settings);
      setDarkMode(data.dark_mode);
    }
    setLoadingSettings(false);
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => setDarkMode((d) => !d);

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setNotifications((n) => [...n, { id, message, type }]);
    setTimeout(() => {
      setNotifications((n) => n.filter((x) => x.id !== id));
    }, 4000);
  };

  const dismissNotification = (id: string) => {
    setNotifications((n) => n.filter((x) => x.id !== id));
  };

  return (
    <AppContext.Provider
      value={{
        settings,
        loadingSettings,
        refreshSettings,
        darkMode,
        toggleDarkMode,
        notify,
        notifications,
        dismissNotification,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}
