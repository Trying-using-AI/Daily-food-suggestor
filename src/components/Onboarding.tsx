import { useApp } from '../store';
import PreferencesForm from './PreferencesForm';

export default function Onboarding() {
  const { savePreferences } = useApp();

  return (
    <div className="app-shell">
      <div className="container page" style={{ paddingBottom: 40 }}>
        <div className="page-head">
          <div className="eyebrow">Welcome 👋</div>
          <h2>Let's learn your taste</h2>
          <p>
            Tell us a little about how you eat. We'll use this to suggest meals you'll
            actually want — and it gets smarter every time you accept a dish.
          </p>
        </div>
        <PreferencesForm
          initial={null}
          submitLabel="Start suggesting meals"
          onSubmit={(draft) => savePreferences({ ...draft, onboarded: true })}
        />
      </div>
    </div>
  );
}
