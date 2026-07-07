import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import {
  acceptPlanEntry,
  clearPlanEntry,
  getPlan,
  logEvent,
  setPlanEntry,
  suggestRecipes,
} from '../lib/api';
import { capitalize, dayLabel, toDateKey, weekDates } from '../lib/mealtime';
import { MEAL_TYPES, type MealType, type PlanEntry, type Recipe } from '../types';
import RecipeCard from './RecipeCard';
import PantryToggle from './PantryToggle';

function slotKey(dateKey: string, meal: MealType) {
  return `${dateKey}|${meal}`;
}

export default function WeeklyPlanner() {
  const { usePantry } = useApp();
  const days = useMemo(() => weekDates(), []);
  const dateKeys = useMemo(() => days.map(toDateKey), [days]);

  const [plan, setPlan] = useState<Record<string, PlanEntry>>({});
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [generatingWeek, setGeneratingWeek] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const entries = await getPlan(dateKeys);
        const map: Record<string, PlanEntry> = {};
        for (const e of entries) map[slotKey(e.plan_date, e.meal_type)] = e;
        setPlan(map);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoaded(true);
      }
    })();
  }, [dateKeys]);

  function setBusy(key: string, on: boolean) {
    setBusyKeys((prev) => {
      const next = new Set(prev);
      on ? next.add(key) : next.delete(key);
      return next;
    });
  }

  /** Generate a batch of distinct recipes for one meal type across the week. */
  async function batchForMeal(meal: MealType, needed: number): Promise<Recipe[]> {
    const collected: Recipe[] = [];
    const exclude: string[] = [];
    let guard = 0;
    while (collected.length < needed && guard < 3) {
      guard += 1;
      const batch = await suggestRecipes({
        mealType: meal,
        count: Math.min(4, needed - collected.length),
        usePantry,
        excludeTitles: exclude,
      });
      if (!batch.length) break;
      for (const r of batch) {
        collected.push(r);
        exclude.push(r.title);
      }
    }
    return collected;
  }

  async function decideWeek() {
    setGeneratingWeek(true);
    setErr(null);
    try {
      const next: Record<string, PlanEntry> = { ...plan };
      for (const meal of MEAL_TYPES) {
        setProgress(`Choosing ${meal}s…`);
        const recipes = await batchForMeal(meal, days.length);
        for (let i = 0; i < days.length; i++) {
          const recipe = recipes[i % recipes.length];
          if (!recipe) continue;
          const dateKey = dateKeys[i];
          const entry = await setPlanEntry(dateKey, meal, recipe.id);
          next[slotKey(dateKey, meal)] = { ...entry, recipe };
        }
        setPlan({ ...next });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setGeneratingWeek(false);
      setProgress('');
    }
  }

  async function regenerate(dateKey: string, meal: MealType) {
    const key = slotKey(dateKey, meal);
    setBusy(key, true);
    setErr(null);
    try {
      const current = plan[key]?.recipe;
      if (current) await logEvent(current.id, meal, 'rejected');
      const results = await suggestRecipes({
        mealType: meal,
        count: 1,
        usePantry,
        excludeTitles: current ? [current.title] : [],
      });
      const recipe = results[0];
      if (recipe) {
        const entry = await setPlanEntry(dateKey, meal, recipe.id);
        setPlan((prev) => ({ ...prev, [key]: { ...entry, recipe } }));
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(key, false);
    }
  }

  async function accept(dateKey: string, meal: MealType) {
    const key = slotKey(dateKey, meal);
    const entry = plan[key];
    if (!entry) return;
    await acceptPlanEntry(entry.id);
    if (entry.recipe) await logEvent(entry.recipe.id, meal, 'accepted');
    setPlan((prev) => ({ ...prev, [key]: { ...entry, status: 'accepted' } }));
  }

  async function remove(dateKey: string, meal: MealType) {
    const key = slotKey(dateKey, meal);
    await clearPlanEntry(dateKey, meal);
    setPlan((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (expanded === key) setExpanded(null);
  }

  async function acceptWholeWeek() {
    const planned = Object.values(plan).filter((e) => e.status === 'planned');
    for (const e of planned) {
      await acceptPlanEntry(e.id);
      if (e.recipe) await logEvent(e.recipe.id, e.meal_type, 'accepted');
    }
    setPlan((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = { ...next[k], status: 'accepted' };
      return next;
    });
  }

  const hasPlan = Object.keys(plan).length > 0;
  const hasPlanned = Object.values(plan).some((e) => e.status === 'planned');

  return (
    <div className="container page">
      <div className="page-head">
        <div className="eyebrow">Weekly meal decider</div>
        <h2>Sort your whole week</h2>
        <p>Generate 7 days of meals in one go, then tweak anything you like.</p>
      </div>

      <PantryToggle />

      {err && <div className="error-box">{err}</div>}

      <div className="actions" style={{ marginTop: 0, marginBottom: 18 }}>
        <button className="btn primary" onClick={decideWeek} disabled={generatingWeek}>
          {generatingWeek ? <span className="spinner" /> : '🗓️'}{' '}
          {hasPlan ? 'Re-plan the week' : 'Decide my week'}
        </button>
        {hasPlanned && (
          <button className="btn accept" onClick={acceptWholeWeek} disabled={generatingWeek}>
            ✓ Accept all
          </button>
        )}
      </div>

      {generatingWeek && progress && (
        <div className="notice">🍳 {progress} building your week…</div>
      )}

      {!loaded && <p className="muted">Loading your plan…</p>}

      {loaded && !hasPlan && !generatingWeek && (
        <div className="empty">
          <div className="big">🗓️</div>
          <p>No plan yet. Hit “Decide my week” and we'll fill all 21 meals.</p>
        </div>
      )}

      {days.map((day, i) => {
        const dateKey = dateKeys[i];
        const daysMeals = MEAL_TYPES.map((m) => plan[slotKey(dateKey, m)]).filter(Boolean);
        if (!hasPlan && !generatingWeek) return null;
        return (
          <div className="week-day" key={dateKey}>
            <h3 className="day-title">
              {dayLabel(day)}
              <span className="date">
                {day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </h3>

            {MEAL_TYPES.map((meal) => {
              const key = slotKey(dateKey, meal);
              const entry = plan[key];
              const busy = busyKeys.has(key);
              const isOpen = expanded === key;
              return (
                <div key={meal}>
                  <div className="slot">
                    <span className="slot-meal">{capitalize(meal)}</span>
                    <div
                      className="slot-main"
                      onClick={() => entry?.recipe && setExpanded(isOpen ? null : key)}
                      style={{ cursor: entry?.recipe ? 'pointer' : 'default' }}
                    >
                      {busy ? (
                        <span className="slot-empty">Finding something…</span>
                      ) : entry?.recipe ? (
                        <>
                          <div className="slot-title">
                            {entry.status === 'accepted' ? '✓ ' : ''}
                            {entry.recipe.title}
                          </div>
                          <div className="slot-sub">
                            {entry.recipe.cuisine}
                            {entry.recipe.calories ? ` · ${entry.recipe.calories} kcal` : ''}
                          </div>
                        </>
                      ) : (
                        <span className="slot-empty">— empty —</span>
                      )}
                    </div>
                    <div className="slot-actions">
                      {entry?.recipe && entry.status !== 'accepted' && (
                        <button
                          className="icon-btn"
                          title="Accept"
                          onClick={() => accept(dateKey, meal)}
                        >
                          ✓
                        </button>
                      )}
                      <button
                        className="icon-btn"
                        title="Regenerate"
                        onClick={() => regenerate(dateKey, meal)}
                        disabled={busy}
                      >
                        🔄
                      </button>
                      {entry && (
                        <button
                          className="icon-btn"
                          title="Remove"
                          onClick={() => remove(dateKey, meal)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && entry?.recipe && (
                    <div style={{ margin: '2px 0 12px' }}>
                      <RecipeCard recipe={entry.recipe} />
                    </div>
                  )}
                </div>
              );
            })}

            {hasPlan && daysMeals.length === 0 && (
              <div className="slot">
                <span className="slot-empty">No meals for this day.</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
