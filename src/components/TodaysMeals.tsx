import { useState } from 'react';
import { useApp } from '../store';
import { logEvent, suggestRecipes } from '../lib/api';
import { capitalize } from '../lib/mealtime';
import { MEAL_TYPES, type MealType, type Recipe } from '../types';
import RecipeCard from './RecipeCard';
import { RecipeSkeleton } from './NextMeal';
import PantryToggle from './PantryToggle';

type SlotState = {
  recipe: Recipe | null;
  loading: boolean;
  accepted: boolean;
};

const initialSlots: Record<MealType, SlotState> = {
  breakfast: { recipe: null, loading: false, accepted: false },
  lunch: { recipe: null, loading: false, accepted: false },
  dinner: { recipe: null, loading: false, accepted: false },
};

export default function TodaysMeals() {
  const { usePantry } = useApp();
  const [slots, setSlots] = useState<Record<MealType, SlotState>>(initialSlots);
  const [err, setErr] = useState<string | null>(null);
  const [planningAll, setPlanningAll] = useState(false);

  function patch(meal: MealType, next: Partial<SlotState>) {
    setSlots((prev) => ({ ...prev, [meal]: { ...prev[meal], ...next } }));
  }

  async function generate(meal: MealType, replacing: boolean) {
    patch(meal, { loading: true });
    setErr(null);
    try {
      const current = slots[meal].recipe;
      if (replacing && current) {
        await logEvent(current.id, meal, 'rejected');
      }
      const results = await suggestRecipes({
        mealType: meal,
        count: 1,
        usePantry,
        excludeTitles: current ? [current.title] : [],
      });
      patch(meal, { recipe: results[0] ?? null, accepted: false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      patch(meal, { loading: false });
    }
  }

  async function planWholeDay() {
    setPlanningAll(true);
    setErr(null);
    try {
      for (const meal of MEAL_TYPES) {
        patch(meal, { loading: true });
      }
      await Promise.all(MEAL_TYPES.map((m) => generateInto(m)));
    } finally {
      setPlanningAll(false);
    }
  }

  async function generateInto(meal: MealType) {
    try {
      const results = await suggestRecipes({ mealType: meal, count: 1, usePantry });
      patch(meal, { recipe: results[0] ?? null, accepted: false, loading: false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      patch(meal, { loading: false });
    }
  }

  async function accept(meal: MealType) {
    const r = slots[meal].recipe;
    if (!r) return;
    await logEvent(r.id, meal, 'accepted');
    patch(meal, { accepted: true });
  }

  const anyLoaded = MEAL_TYPES.some((m) => slots[m].recipe || slots[m].loading);

  return (
    <div className="container page">
      <div className="page-head">
        <div className="eyebrow">Today's meals</div>
        <h2>Your day, planned</h2>
        <p>Breakfast, lunch and dinner for today — regenerate any you don't fancy.</p>
      </div>

      <PantryToggle />

      {err && <div className="error-box">{err}</div>}

      {!anyLoaded && (
        <button
          className="btn primary block"
          onClick={planWholeDay}
          disabled={planningAll}
          style={{ marginBottom: 20 }}
        >
          {planningAll ? <span className="spinner" /> : '✨'} Plan all three meals
        </button>
      )}

      {MEAL_TYPES.map((meal) => {
        const s = slots[meal];
        return (
          <section key={meal} style={{ marginBottom: 22 }}>
            <div className="row-between" style={{ marginBottom: 10 }}>
              <h3 style={{ fontSize: 18 }}>
                {meal === 'breakfast' ? '🍳' : meal === 'lunch' ? '🥗' : '🍝'}{' '}
                {capitalize(meal)}
              </h3>
              {!s.recipe && !s.loading && (
                <button className="btn sm" onClick={() => generate(meal, false)}>
                  ✨ Suggest
                </button>
              )}
            </div>

            {s.loading && <RecipeSkeleton />}

            {s.recipe && !s.loading && (
              <RecipeCard
                recipe={s.recipe}
                onAccept={() => accept(meal)}
                acceptLabel="Add to today"
                accepted={s.accepted}
                onAnother={() => generate(meal, true)}
              />
            )}

            {!s.recipe && !s.loading && (
              <div className="slot">
                <span className="slot-empty">No {meal} chosen yet.</span>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
