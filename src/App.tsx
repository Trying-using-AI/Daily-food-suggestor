import { useState } from 'react';
import { AppProvider, useApp } from './store';
import { isSupabaseConfigured } from './lib/supabase';
import Onboarding from './components/Onboarding';
import NextMeal from './components/NextMeal';
import TodaysMeals from './components/TodaysMeals';
import WeeklyPlanner from './components/WeeklyPlanner';
import Kitchen from './components/Kitchen';
import Insights from './components/Insights';
import Settings from './components/Settings';

type Tab = 'next' | 'today' | 'week' | 'kitchen' | 'tastes' | 'settings';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'next', label: 'Next', icon: '✨' },
  { id: 'today', label: 'Today', icon: '📅' },
  { id: 'week', label: 'Week', icon: '🗓️' },
  { id: 'kitchen', label: 'Kitchen', icon: '🧺' },
  { id: 'tastes', label: 'Tastes', icon: '📊' },
];

export default function App() {
  if (!isSupabaseConfigured) return <SetupScreen />;
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}

function Shell() {
  const { loading, prefs, error } = useApp();
  const [tab, setTab] = useState<Tab>('next');

  if (loading) {
    return (
      <div className="center-screen">
        <div>
          <div className="logo" style={{ justifyContent: 'center', marginBottom: 12 }}>
            <span>🍲</span> Daily Food Suggestor
          </div>
          <span className="spinner dark" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="center-screen">
        <div className="setup-card">
          <h2>Something went wrong</h2>
          <p className="muted">{error}</p>
          <p className="muted">
            Check that your Supabase project is reachable, the migration has been run,
            and anonymous sign-ins are enabled (Authentication → Providers → Anonymous).
          </p>
          <button className="btn primary" onClick={() => location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!prefs?.onboarded) {
    return <Onboarding />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="logo">
            🍲 Daily <span className="dot">Food</span>
          </div>
          <span className="spacer" />
          <button
            className="icon-btn"
            title="Preferences"
            onClick={() => setTab('settings')}
          >
            ⚙️
          </button>
        </div>
      </header>

      <main>
        {tab === 'next' && <NextMeal />}
        {tab === 'today' && <TodaysMeals />}
        {tab === 'week' && <WeeklyPlanner />}
        {tab === 'kitchen' && <Kitchen />}
        {tab === 'tastes' && <Insights />}
        {tab === 'settings' && <Settings />}
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            <span className="ico">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function SetupScreen() {
  return (
    <div className="center-screen">
      <div className="setup-card">
        <div className="logo" style={{ marginBottom: 14 }}>
          🍲 Daily Food Suggestor
        </div>
        <h2>Almost there — connect Supabase</h2>
        <p className="muted">
          This app stores your data in Supabase and generates recipes through a Supabase
          Edge Function. Add your project keys to a <code>.env</code> file:
        </p>
        <pre>
{`VITE_SUPABASE_URL=https://YOUR-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}
        </pre>
        <p className="muted">
          Then run the migration in <code>supabase/migrations</code>, deploy the{' '}
          <code>suggest-recipes</code> function, and set the{' '}
          <code>ANTHROPIC_API_KEY</code> secret. Full steps are in the{' '}
          <strong>README</strong>.
        </p>
        <button className="btn primary" onClick={() => location.reload()}>
          I've added my keys — reload
        </button>
      </div>
    </div>
  );
}
