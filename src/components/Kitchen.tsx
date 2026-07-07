import { useState } from 'react';
import { useApp } from '../store';
import { addPantryItem, removePantryItem } from '../lib/api';
import { COMMON_INGREDIENTS } from '../lib/options';
import PantryToggle from './PantryToggle';

export default function Kitchen() {
  const { pantry, refreshPantry } = useApp();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const existing = new Set(pantry.map((p) => p.name.toLowerCase()));

  async function add(name: string) {
    const clean = name.trim();
    if (!clean || existing.has(clean.toLowerCase())) {
      setInput('');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await addPantryItem(clean);
      await refreshPantry();
      setInput('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await removePantryItem(id);
    await refreshPantry();
  }

  const suggestions = COMMON_INGREDIENTS.filter((c) => !existing.has(c.toLowerCase()));

  return (
    <div className="container page">
      <div className="page-head">
        <div className="eyebrow">My kitchen</div>
        <h2>What's in your pantry?</h2>
        <p>
          Add what you have on hand. Flip on “Cook from my kitchen” in any decider and
          we'll build meals around these.
        </p>
      </div>

      <PantryToggle />

      {err && <div className="error-box">{err}</div>}

      <div className="field" style={{ marginTop: 4 }}>
        <label>Add an ingredient</label>
        <div className="inline-add">
          <input
            className="text-input"
            placeholder="e.g. chickpeas, spinach, salmon…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add(input)}
          />
          <button className="btn primary" onClick={() => add(input)} disabled={busy}>
            {busy ? <span className="spinner" /> : 'Add'}
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="field">
          <div className="hint">Quick add:</div>
          <div className="suggestion-row">
            {suggestions.slice(0, 12).map((s) => (
              <button key={s} className="pill" onClick={() => add(s)}>
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label>
          Your pantry {pantry.length > 0 && <span className="muted">({pantry.length})</span>}
        </label>
        {pantry.length === 0 ? (
          <div className="empty" style={{ padding: '24px 0' }}>
            <div className="big">🧺</div>
            <p>Empty for now — add a few staples above.</p>
          </div>
        ) : (
          <div className="pantry-grid">
            {pantry.map((item) => (
              <span className="pantry-tag" key={item.id}>
                {item.name}
                <button onClick={() => remove(item.id)} title="Remove">
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
