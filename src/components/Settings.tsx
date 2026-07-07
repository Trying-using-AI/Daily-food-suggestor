import { useState } from 'react';
import { useApp } from '../store';
import PreferencesForm from './PreferencesForm';

export default function Settings() {
  const { prefs, savePreferences } = useApp();
  const [saved, setSaved] = useState(false);

  return (
    <div className="container page">
      <div className="page-head">
        <div className="eyebrow">Preferences</div>
        <h2>Fine-tune your profile</h2>
        <p>Update your diet, allergies, and cooking preferences any time.</p>
      </div>

      {saved && <div className="notice">Saved! Your next suggestions will use this. ✅</div>}

      <PreferencesForm
        initial={prefs}
        submitLabel="Save preferences"
        onSubmit={async (draft) => {
          await savePreferences({ ...draft, onboarded: true });
          setSaved(true);
          setTimeout(() => setSaved(false), 2500);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />
    </div>
  );
}
