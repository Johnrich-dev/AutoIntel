import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getSupabaseAdminClient } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface AppSettings {
  timezone: string;
  dateFormat: string;
  language: string;
  theme: string;
  browserNotifications: boolean;
  sessionTimeout: string;
  sidebarCollapsed: boolean;
  compactView: boolean;
}

interface SettingsContextType {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
}

const defaults: AppSettings = {
  timezone: 'Asia/Manila',
  dateFormat: 'MM/DD/YYYY',
  language: 'en',
  theme: 'light',
  browserNotifications: false,
  sessionTimeout: '30',
  sidebarCollapsed: false,
  compactView: false,
};

const SettingsContext = createContext<SettingsContextType>({
  settings: defaults,
  updateSettings: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { adminSession } = useAuth();
  const { i18n } = useTranslation();
  const [settings, setSettings] = useState<AppSettings>(defaults);

  useEffect(() => {
    if (!adminSession?.user_id) return;

    const load = async () => {
      try {
        const { data } = await getSupabaseAdminClient()
          .from('admin_users')
          .select('timezone, date_format, language, theme, browser_notifications, session_timeout, sidebar_collapsed, compact_view')
          .eq('id', adminSession.user_id)
          .maybeSingle();

        if (data) {
          const loaded: AppSettings = {
            timezone: data.timezone || defaults.timezone,
            dateFormat: data.date_format || defaults.dateFormat,
            language: data.language || defaults.language,
            theme: data.theme || defaults.theme,
            browserNotifications: data.browser_notifications ?? false,
            sessionTimeout: data.session_timeout || '30',
            sidebarCollapsed: data.sidebar_collapsed ?? false,
            compactView: data.compact_view ?? false,
          };
          setSettings(loaded);
          i18n.changeLanguage(loaded.language);
          document.documentElement.classList.toggle('dark', loaded.theme === 'dark');
        }
      } catch (e) {
        console.error('SettingsContext load error:', e);
      }
    };

    load();
  }, [adminSession?.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSettings = (partial: Partial<AppSettings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      if (partial.language) i18n.changeLanguage(partial.language);
      if (partial.theme) document.documentElement.classList.toggle('dark', partial.theme === 'dark');
      if (partial.browserNotifications === true && 'Notification' in window) {
        Notification.requestPermission();
      }
      return next;
    });
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
