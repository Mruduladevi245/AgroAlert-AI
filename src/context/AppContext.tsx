import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getUiText, type UiTranslations } from '../../shared/languages.ts';
import { apiRequest, setStoredToken } from '../services/api.ts';
import type {
  FarmRecord,
  FarmerProfile,
  FarmerUser,
  FieldRecord,
  LanguageCapability,
  RiskEvaluation,
  WeatherForecast,
} from '../types/agro.ts';

interface AppContextValue {
  user: FarmerUser | null;
  profile: FarmerProfile | null;
  farms: FarmRecord[];
  fields: FieldRecord[];
  selectedField: FieldRecord | null;
  selectFieldId: (id: number) => void;
  weather: WeatherForecast | null;
  weatherLoading: boolean;
  evaluation: RiskEvaluation | null;
  evaluationLoading: boolean;
  languageCode: string;
  setLanguageCode: (code: string) => Promise<void>;
  ui: UiTranslations;
  languageCapabilities: LanguageCapability[];
  voiceProviders: {
    googleCloudTts: boolean;
    geminiTts: boolean;
    geminiStt: boolean;
    geminiTranslation: boolean;
  };
  authChecked: boolean;
  darkMode: boolean;
  toggleDarkMode: () => void;
  refreshSession: () => Promise<void>;
  refreshFields: () => Promise<void>;
  refreshWeatherAndRisk: (fieldOverride?: FieldRecord) => Promise<void>;
  logout: () => Promise<void>;
  voiceDrawerOpen: boolean;
  setVoiceDrawerOpen: (open: boolean) => void;
  voicePromptPrefill: string;
  openVoiceWithPrompt: (prompt: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FarmerUser | null>(null);
  const [profile, setProfile] = useState<FarmerProfile | null>(null);
  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [fields, setFields] = useState<FieldRecord[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<number | null>(null);
  const [weather, setWeather] = useState<WeatherForecast | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [evaluation, setEvaluation] = useState<RiskEvaluation | null>(null);
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [languageCode, setLangState] = useState('en-IN');
  const [languageCapabilities, setLanguageCapabilities] = useState<LanguageCapability[]>([]);
  const [voiceProviders, setVoiceProviders] = useState({
    googleCloudTts: false,
    geminiTts: false,
    geminiStt: false,
    geminiTranslation: false,
  });
  const [authChecked, setAuthChecked] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [voiceDrawerOpen, setVoiceDrawerOpen] = useState(false);
  const [voicePromptPrefill, setVoicePromptPrefill] = useState('');

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  }, []);

  const loadVoiceCapabilities = useCallback(async () => {
    try {
      const data = await apiRequest<{
        languages: LanguageCapability[];
        providers: typeof voiceProviders;
      }>('/api/voice/languages');
      setLanguageCapabilities(data.languages);
      setVoiceProviders(data.providers);
    } catch {
      // non-fatal
    }
  }, []);

  const refreshFields = useCallback(async () => {
    try {
      const data = await apiRequest<{ fields: FieldRecord[] }>('/api/fields');
      setFields(data.fields);
      setSelectedFieldId((prev) => {
        if (prev && data.fields.some((f) => f.id === prev)) return prev;
        const pref = data.fields.find((f) => f.is_preferred === 1) ?? data.fields[0];
        return pref ? pref.id : null;
      });
    } catch {
      setFields([]);
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const me = await apiRequest<{
        user: FarmerUser;
        profile: FarmerProfile;
        farms?: FarmRecord[];
      }>('/api/farmer/profile');
      setUser(me.user);
      setProfile(me.profile);
      setFarms(me.farms ?? []);
      if (me.profile?.preferred_language) {
        setLangState(me.profile.preferred_language);
      }
      await refreshFields();
    } catch {
      setUser(null);
      setProfile(null);
      setFields([]);
    } finally {
      setAuthChecked(true);
    }
  }, [refreshFields]);

  useEffect(() => {
    loadVoiceCapabilities();
    refreshSession();
  }, [loadVoiceCapabilities, refreshSession]);

  const selectedField = fields.find((f) => f.id === selectedFieldId) ?? fields[0] ?? null;

  const refreshWeatherAndRisk = useCallback(
    async (fieldOverride?: FieldRecord) => {
      const target = fieldOverride ?? selectedField;
      if (!target) {
        setWeather(null);
        setEvaluation(null);
        return;
      }
      setWeatherLoading(true);
      setEvaluationLoading(true);
      try {
        const res = await apiRequest<{
          weather: WeatherForecast;
          evaluation: RiskEvaluation;
        }>('/api/analyze', {
          method: 'POST',
          body: JSON.stringify({
            fieldId: target.id,
            languageCode,
          }),
        });
        setWeather(res.weather);
        setEvaluation(res.evaluation);
      } catch {
        // Fallback: fetch weather alone if analyze fails
        try {
          const w = await apiRequest<WeatherForecast>(
            `/api/weather?lat=${target.latitude}&lon=${target.longitude}&timezone=${encodeURIComponent(
              target.timezone || 'auto'
            )}&fieldId=${target.id}`
          );
          setWeather(w);
        } catch {
          setWeather(null);
        }
        setEvaluation(null);
      } finally {
        setWeatherLoading(false);
        setEvaluationLoading(false);
      }
    },
    [selectedField, languageCode]
  );

  useEffect(() => {
    if (user && selectedField?.id) {
      refreshWeatherAndRisk(selectedField);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, selectedField?.id]);

  const setLanguageCode = useCallback(
    async (code: string) => {
      setLangState(code);
      if (user) {
        try {
          const updated = await apiRequest<{ profile: FarmerProfile }>('/api/farmer/profile', {
            method: 'PUT',
            body: JSON.stringify({ preferredLanguage: code }),
          });
          setProfile(updated.profile);
        } catch {
          // keep local selection even if offline
        }
      }
    },
    [user]
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setProfile(null);
    setFields([]);
    setWeather(null);
    setEvaluation(null);
  }, []);

  const openVoiceWithPrompt = useCallback((prompt: string) => {
    setVoicePromptPrefill(prompt);
    setVoiceDrawerOpen(true);
  }, []);

  const ui = getUiText(languageCode);

  return (
    <AppContext.Provider
      value={{
        user,
        profile,
        farms,
        fields,
        selectedField,
        selectFieldId: setSelectedFieldId,
        weather,
        weatherLoading,
        evaluation,
        evaluationLoading,
        languageCode,
        setLanguageCode,
        ui,
        languageCapabilities,
        voiceProviders,
        authChecked,
        darkMode,
        toggleDarkMode,
        refreshSession,
        refreshFields,
        refreshWeatherAndRisk,
        logout,
        voiceDrawerOpen,
        setVoiceDrawerOpen,
        voicePromptPrefill,
        openVoiceWithPrompt,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
