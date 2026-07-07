import { useState } from 'react';
import type { Recipe } from '../types';
import { capitalize } from '../lib/mealtime';

interface Props {
  recipe: Recipe;
  /** Primary action, e.g. accept this meal. */
  onAccept?: () => void;
  acceptLabel?: string;
  accepted?: boolean;
  /** Ask for a different suggestion. */
  onAnother?: () => void;
  anotherBusy?: boolean;
  /** Optional secondary action (e.g. add to a plan slot). */
  onSecondary?: () => void;
  secondaryLabel?: string;
}

export default function RecipeCard({
  recipe,
  onAccept,
  acceptLabel = 'Accept',
  accepted = false,
  onAnother,
  anotherBusy = false,
  onSecondary,
  secondaryLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const totalTime =
    (recipe.prep_minutes ?? 0) + (recipe.cook_minutes ?? 0) || null;
  const pantryUsed = recipe.uses_pantry_items ?? [];

  return (
    <div className="card recipe-card">
      <div className="rc-body">
        {recipe.cuisine && <div className="rc-cuisine">{recipe.cuisine}</div>}
        <div className="rc-title">{recipe.title}</div>
        {recipe.description && <p className="rc-desc">{recipe.description}</p>}

        <div className="meta-row">
          {totalTime && <span className="chip">⏱ {totalTime} min</span>}
          {recipe.calories ? (
            <span className="chip">🔥 {recipe.calories} kcal</span>
          ) : null}
          {recipe.servings ? (
            <span className="chip">🍽 {recipe.servings} serving{recipe.servings > 1 ? 's' : ''}</span>
          ) : null}
          {pantryUsed.slice(0, 3).map((p) => (
            <span className="chip pantry" key={p}>
              ✓ {p}
            </span>
          ))}
          {recipe.tags?.slice(0, 2).map((t) => (
            <span className="chip tag" key={t}>
              {t}
            </span>
          ))}
        </div>

        <button className="link-btn" onClick={() => setOpen((v) => !v)}>
          {open ? '▲ Hide recipe' : '▼ Show ingredients & steps'}
        </button>

        {open && (
          <div className="details">
            <h4>Ingredients</h4>
            <ul className="ing-list">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>
                  <span>{capitalize(ing.item)}</span>
                  <span className="q">{ing.quantity}</span>
                </li>
              ))}
            </ul>
            <h4>Steps</h4>
            <ol className="steps">
              {recipe.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}

        {(onAccept || onAnother || onSecondary) && (
          <div className="actions">
            {onAccept &&
              (accepted ? (
                <button className="btn accept" disabled>
                  ✓ {acceptLabel.replace(/^(Accept|Add).*/, 'Accepted')}
                </button>
              ) : (
                <button className="btn accept" onClick={onAccept}>
                  ✓ {acceptLabel}
                </button>
              ))}
            {onSecondary && secondaryLabel && (
              <button className="btn ghost" onClick={onSecondary}>
                {secondaryLabel}
              </button>
            )}
            {onAnother && (
              <button className="btn" onClick={onAnother} disabled={anotherBusy}>
                {anotherBusy ? <span className="spinner dark" /> : '🔄'} Another idea
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
