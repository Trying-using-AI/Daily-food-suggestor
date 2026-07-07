import { useState } from 'react';
import type { Preferences } from '../types';
import {
  ALLERGY_OPTIONS,
  CUISINE_OPTIONS,
  DIET_OPTIONS,
  GOAL_OPTIONS,
  HEALTH_OPTIONS,
} from '../lib/options';

type Draft = Omit<Preferences, 'user_id' | 'onboarded' | 'updated_at'>;

const EMPTY: Draft = {
  diets: [],
  cuisines_liked: [],
  cuisines_disliked: [],
  allergies: [],
  disliked_ingredients: [],
  health_conditions: [],
  goals: [],
  spice_level: 'medium',
  max_prep_minutes: 45,
  servings: 2,
};

function toDraft(p: Preferences | null): Draft {
  if (!p) return { ...EMPTY };
  return {
    diets: p.diets ?? [],
    cuisines_liked: p.cuisines_liked ?? [],
    cuisines_disliked: p.cuisines_disliked ?? [],
    allergies: p.allergies ?? [],
    disliked_ingredients: p.disliked_ingredients ?? [],
    health_conditions: p.health_conditions ?? [],
    goals: p.goals ?? [],
    spice_level: p.spice_level ?? 'medium',
    max_prep_minutes: p.max_prep_minutes ?? 45,
    servings: p.servings ?? 2,
  };
}

interface Props {
  initial: Preferences | null;
  submitLabel: string;
  onSubmit: (draft: Draft) => Promise<void>;
}

export default function PreferencesForm({ initial, submitLabel, onSubmit }: Props) {
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const [dislikeInput, setDislikeInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(key: keyof Draft, value: string) {
    setD((prev) => {
      const arr = prev[key] as string[];
      const has = arr.includes(value);
      return { ...prev, [key]: has ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }

  function addDislike() {
    const v = dislikeInput.trim();
    if (!v) return;
    if (!d.disliked_ingredients.includes(v)) {
      setD((prev) => ({ ...prev, disliked_ingredients: [...prev.disliked_ingredients, v] }));
    }
    setDislikeInput('');
  }

  async function submit() {
    setSaving(true);
    setErr(null);
    try {
      await onSubmit(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      {err && <div className="error-box">{err}</div>}

      <Group
        label="Dietary style"
        hint="Anything the app must always respect."
        options={DIET_OPTIONS}
        selected={d.diets}
        onToggle={(v) => toggle('diets', v)}
      />

      <Group
        label="Allergies"
        hint="Hard exclusions — these ingredients will never appear."
        options={ALLERGY_OPTIONS}
        selected={d.allergies}
        onToggle={(v) => toggle('allergies', v)}
        danger
      />

      <Group
        label="Health considerations"
        hint="Recipes will be nudged to suit these."
        options={HEALTH_OPTIONS}
        selected={d.health_conditions}
        onToggle={(v) => toggle('health_conditions', v)}
      />

      <Group
        label="Cuisines you love"
        options={CUISINE_OPTIONS}
        selected={d.cuisines_liked}
        onToggle={(v) => toggle('cuisines_liked', v)}
      />

      <Group
        label="Cuisines to avoid"
        options={CUISINE_OPTIONS}
        selected={d.cuisines_disliked}
        onToggle={(v) => toggle('cuisines_disliked', v)}
        danger
      />

      <Group
        label="Your goals"
        options={GOAL_OPTIONS}
        selected={d.goals}
        onToggle={(v) => toggle('goals', v)}
      />

      <div className="field">
        <label>Ingredients you dislike</label>
        <div className="hint">Individual foods to leave out (e.g. cilantro, olives).</div>
        <div className="inline-add">
          <input
            className="text-input"
            placeholder="Type an ingredient…"
            value={dislikeInput}
            onChange={(e) => setDislikeInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addDislike()}
          />
          <button className="btn" onClick={addDislike} type="button">
            Add
          </button>
        </div>
        {d.disliked_ingredients.length > 0 && (
          <div className="pantry-grid">
            {d.disliked_ingredients.map((item) => (
              <span className="pantry-tag" key={item}>
                {item}
                <button
                  type="button"
                  onClick={() =>
                    setD((prev) => ({
                      ...prev,
                      disliked_ingredients: prev.disliked_ingredients.filter((x) => x !== item),
                    }))
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="field">
        <label>Spice level</label>
        <div className="pill-group">
          {(['mild', 'medium', 'spicy'] as const).map((lvl) => (
            <button
              type="button"
              key={lvl}
              className={`pill ${d.spice_level === lvl ? 'on' : ''}`}
              onClick={() => setD((prev) => ({ ...prev, spice_level: lvl }))}
            >
              {lvl === 'mild' ? '🌱 Mild' : lvl === 'medium' ? '🌶 Medium' : '🔥 Spicy'}
            </button>
          ))}
        </div>
      </div>

      <div className="field row-between">
        <div>
          <label>Max prep time</label>
          <div className="hint" style={{ marginBottom: 0 }}>{d.max_prep_minutes} minutes</div>
        </div>
        <div className="stepper">
          <button
            type="button"
            onClick={() =>
              setD((p) => ({ ...p, max_prep_minutes: Math.max(10, p.max_prep_minutes - 5) }))
            }
          >
            −
          </button>
          <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 700 }}>
            {d.max_prep_minutes}
          </span>
          <button
            type="button"
            onClick={() =>
              setD((p) => ({ ...p, max_prep_minutes: Math.min(180, p.max_prep_minutes + 5) }))
            }
          >
            +
          </button>
        </div>
      </div>

      <div className="field row-between">
        <div>
          <label>Servings</label>
          <div className="hint" style={{ marginBottom: 0 }}>How many people you cook for.</div>
        </div>
        <div className="stepper">
          <button
            type="button"
            onClick={() => setD((p) => ({ ...p, servings: Math.max(1, p.servings - 1) }))}
          >
            −
          </button>
          <span style={{ minWidth: 40, textAlign: 'center', fontWeight: 700 }}>{d.servings}</span>
          <button
            type="button"
            onClick={() => setD((p) => ({ ...p, servings: Math.min(12, p.servings + 1) }))}
          >
            +
          </button>
        </div>
      </div>

      <button className="btn primary block" onClick={submit} disabled={saving}>
        {saving ? <span className="spinner" /> : null} {submitLabel}
      </button>
    </div>
  );
}

function Group({
  label,
  hint,
  options,
  selected,
  onToggle,
  danger = false,
}: {
  label: string;
  hint?: string;
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  danger?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {hint && <div className="hint">{hint}</div>}
      <div className="pill-group">
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button
              type="button"
              key={opt}
              className={`pill ${danger ? 'danger' : ''} ${on ? 'on' : ''}`}
              onClick={() => onToggle(opt)}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
