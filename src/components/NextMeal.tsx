import { useEffect, useRef, useState } from 'react';
import { useApp } from '../store';
import { logEvent, suggestRecipes } from '../lib/api';
import { currentMealType, capitalize } from '../lib/mealtime';
import { MEAL_TYPES, type MealType, type Recipe } from '../types';
import RecipeCard from './RecipeCard';
import PantryToggle from './PantryToggle';

export default function NextMeal() {
  const { usePantry } = useApp();
  const [mealType, setMealType] = useState<MealType>(() => currentMealType());
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [another, setAnother] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const shownTitles = useRef<string[]>([]);

  async function generate(replacing: boolean) {
    replacing ? setAnother(true) : setLoading(true);
    setErr(null);
    try {
      // A rejected "another" is a soft negative signal for the model.
      if (replacing && recipe) {
        await logEvent(recipe.id, recipe.meal_type, 'rejected');
      }
      const results = await suggestRecipes({
        mealType,
        count: 1,
        usePantry,
        excludeTitles: shownTitles.current,
      });
      if (results.length) {
        setRecipe(results[0]);
        setAccepted(false);
        shownTitles.current = [...shownTitles.current, results[0].title].slice(-25);
      } else {
        setErr('No suggestion came back. Try again.');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setAnother(false);
    }
  }

  async function accept() {
    if (!recipe) return;
    await logEvent(recipe.id, recipe.meal_type, 'accepted');
    setAccepted(true);
  }

  // Reset the shown-titles memory when switching meal type.
  useEffect(() => {
    shownTitles.current = [];
    setRecipe(null);
    setAccepted(false);
  }, [mealType]);

  return (
    <div className="container page">
      <div className="page-head">
        <div className="eyebrow">Next meal</div>
        <h2>What should I eat?</h2>
        <p>Pick a meal and get a suggestion tailored to you.</p>
      </div>

      <div className="field">
        <div className="pill-group">
          {MEAL_TYPES.map((m) => (
            <button
              key={m}
              className={`pill ${mealType === m ? 'on' : ''}`}
              onClick={() => setMealType(m)}
            >
              {m === 'breakfast' ? '🍳' : m === 'lunch' ? '🥗' : '🍝'} {capitalize(m)}
            </button>
          ))}
        </div>
      </div>

      <PantryToggle />

      {err && <div className="error-box">{err}</div>}

      {!recipe && !loading && (
        <div className="empty">
          <div className="big">🍽️</div>
          <p>Ready when you are.</p>
          <button className="btn primary" onClick={() => generate(false)}>
            ✨ Suggest my {mealType}
          </button>
        </div>
      )}

      {loading && <RecipeSkeleton />}

      {recipe && !loading && (
        <>
          <RecipeCard
            recipe={recipe}
            onAccept={accept}
            acceptLabel="Sounds good"
            accepted={accepted}
            onAnother={() => generate(true)}
            anotherBusy={another}
          />
          {accepted && (
            <div className="notice">
              Nice choice! We'll remember you liked this and lean into it next time. 🎯
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function RecipeSkeleton() {
  return (
    <div className="card recipe-card">
      <div className="rc-body">
        <div className="skeleton" style={{ height: 14, width: 80, marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 24, width: '70%', marginBottom: 10 }} />
        <div className="skeleton" style={{ height: 14, width: '100%', marginBottom: 6 }} />
        <div className="skeleton" style={{ height: 14, width: '85%', marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 32, width: '100%' }} />
      </div>
    </div>
  );
}
