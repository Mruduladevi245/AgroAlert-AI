import React, { useState } from 'react';
import {
  BellRing,
  CloudSun,
  Droplets,
  Languages,
  LayoutDashboard,
  Loader2,
  LogOut,
  Map,
  Menu,
  Mic,
  Moon,
  ScanLine,
  Sprout,
  Sun,
  UserCog,
  X,
} from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../shared/languages.ts';
import { VoiceAssistantDrawer } from './components/VoiceAssistantDrawer.tsx';
import { AppProvider, useApp } from './context/AppContext.tsx';
import { AlertsAnalyticsPage } from './pages/AlertsAnalyticsPage.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { CropScannerPage } from './pages/CropScannerPage.tsx';
import { DashboardOverview } from './pages/DashboardOverview.tsx';
import { FieldsPage } from './pages/FieldsPage.tsx';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage.tsx';
import { WaterPage } from './pages/WaterPage.tsx';
import { WeatherPage } from './pages/WeatherPage.tsx';

function AgroShell() {
  const {
    user,
    profile,
    authChecked,
    languageCode,
    setLanguageCode,
    ui,
    darkMode,
    toggleDarkMode,
    logout,
    setVoiceDrawerOpen,
  } = useApp();

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-slate-950">
        <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-700" />
          <span>Loading AgroAlert AI...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const navItems = [
    { id: 'overview', label: ui.navOverview, icon: LayoutDashboard },
    { id: 'weather', label: ui.navWeather, icon: CloudSun },
    { id: 'fields', label: ui.navFields, icon: Map },
    { id: 'water', label: ui.navWater, icon: Droplets },
    { id: 'scanner', label: ui.navScanner, icon: ScanLine },
    { id: 'alerts', label: ui.navAlerts, icon: BellRing },
    { id: 'settings', label: ui.navSettings, icon: UserCog },
  ];

  const activeNavLabel = navItems.find((n) => n.id === activeTab)?.label || ui.navOverview;

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col bg-white dark:bg-slate-900 border-r border-stone-200 dark:border-slate-800">
        <div className="px-6 py-5 border-b border-stone-200 dark:border-slate-800 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center text-white shrink-0">
            <Sprout className="w-4 h-4" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
            AgroAlert AI
          </span>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  active
                    ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-stone-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-stone-200 dark:border-slate-800 flex items-center gap-3">
          <img
            src="/src/assets/images/farmer_avatar_default_1795075354149.jpg"
            alt={profile?.full_name || 'Farmer avatar'}
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-full object-cover border border-stone-200 dark:border-slate-700 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold truncate">{profile?.full_name || 'Farmer'}</p>
            <p className="text-[11px] text-slate-500 truncate">{user.email || user.phone}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="p-1.5 text-slate-500 hover:text-red-600 rounded-md hover:bg-stone-100 dark:hover:bg-slate-800"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white dark:bg-slate-900 h-full flex flex-col border-r border-stone-200 dark:border-slate-800 z-10">
            <div className="px-5 py-4 border-b border-stone-200 dark:border-slate-800 flex items-center justify-between">
              <span className="font-display text-lg font-bold">AgroAlert AI</span>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="p-1.5 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium ${
                      active
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-stone-200 dark:border-slate-800">
              <button
                type="button"
                onClick={logout}
                className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium text-red-600 border border-red-200 rounded-lg"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb — Language & Theme — Primary Voice Action */}
        <header className="bg-white dark:bg-slate-900 border-b border-stone-200 dark:border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
              className="lg:hidden p-2 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-stone-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
              AgroAlert AI <span className="text-slate-400 mx-1">/</span>{' '}
              <span className="text-slate-900 dark:text-white font-semibold">{activeNavLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="inline-flex items-center gap-1.5">
              <Languages className="w-4 h-4 text-emerald-700 hidden sm:block" />
              <select
                aria-label="Global Language"
                value={languageCode}
                onChange={(e) => setLanguageCode(e.target.value)}
                className="text-xs px-2.5 py-1.5 bg-stone-50 dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg max-w-[140px] sm:max-w-none"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeLabel} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label="Toggle dark mode"
              className="p-2 text-slate-600 dark:text-slate-300 border border-stone-200 dark:border-slate-700 rounded-lg hover:bg-stone-100 dark:hover:bg-slate-800"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setVoiceDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 whitespace-nowrap shrink-0"
            >
              <Mic className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{ui.askAssistant}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto pb-24">
          {activeTab === 'overview' && <DashboardOverview onNavigate={setActiveTab} />}
          {activeTab === 'weather' && <WeatherPage />}
          {activeTab === 'fields' && <FieldsPage />}
          {activeTab === 'water' && <WaterPage />}
          {activeTab === 'scanner' && <CropScannerPage />}
          {activeTab === 'alerts' && <AlertsAnalyticsPage />}
          {activeTab === 'settings' && <ProfileSettingsPage />}
        </main>
      </div>

      <VoiceAssistantDrawer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AgroShell />
    </AppProvider>
  );
}
