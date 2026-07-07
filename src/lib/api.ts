import { supabase } from './supabase';
import type {
  GeneratedRecipe,
  MealAction,
  MealType,
  PlanEntry,
  Preferences,
  Recipe,
} from '../types';

/** Ensure there is an authenticated (anonymous) user; returns the user id. */
export async function ensureAuth(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: signIn, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return signIn.user!.id;
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------
export async function getPreferences(): Promise<Preferences | null> {
  const { data, error } = await supabase
    .from('preferences')
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return data as Preferences | null;
}

export async function savePreferences(
  userId: string,
  prefs: Partial<Preferences>,
): Promise<Preferences> {
  const row = { ...prefs, user_id: userId, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('preferences')
    .upsert(row, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as Preferences;
}

// ---------------------------------------------------------------------------
// Pantry
// ---------------------------------------------------------------------------
export async function listPantry() {
  const { data, error } = await supabase
    .from('pantry_items')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function addPantryItem(name: string, category?: string) {
  const clean = name.trim();
  if (!clean) return null;
  const { data, error } = await supabase
    .from('pantry_items')
    .upsert(
      { name: clean, category: category ?? null },
      { onConflict: 'user_id,name', ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function removePantryItem(id: string) {
  const { error } = await supabase.from('pantry_items').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// AI generation + persistence
// ---------------------------------------------------------------------------
export interface SuggestArgs {
  mealType: MealType;
  count?: number;
  usePantry?: boolean;
  excludeTitles?: string[];
  context?: string;
}

/** Calls the Edge Function, then persists each recipe and logs a 'suggested' event. */
export async function suggestRecipes(args: SuggestArgs): Promise<Recipe[]> {
  const { data, error } = await supabase.functions.invoke('suggest-recipes', {
    body: args,
  });
  if (error) {
    // Supabase wraps non-2xx into FunctionsHttpError; surface the server message.
    let message = error.message;
    try {
      const ctx = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        const j = await ctx.json();
        if (j?.error) message = j.error;
      }
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const generated = (data?.recipes ?? []) as GeneratedRecipe[];
  if (!generated.length) return [];

  const saved: Recipe[] = [];
  for (const g of generated) {
    const recipe = await saveRecipe(g);
    await logEvent(recipe.id, recipe.meal_type, 'suggested');
    saved.push({ ...recipe, uses_pantry_items: g.uses_pantry_items ?? [] });
  }
  return saved;
}

async function saveRecipe(g: GeneratedRecipe): Promise<Recipe> {
  const { data, error } = await supabase
    .from('recipes')
    .insert({
      title: g.title,
      meal_type: g.meal_type,
      cuisine: g.cuisine,
      description: g.description,
      ingredients: g.ingredients,
      steps: g.steps,
      tags: g.tags,
      prep_minutes: g.prep_minutes,
      cook_minutes: g.cook_minutes,
      servings: g.servings,
      calories: g.calories,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Recipe;
}

// ---------------------------------------------------------------------------
// Meal events (the preference model's raw signal)
// ---------------------------------------------------------------------------
export async function logEvent(
  recipeId: string,
  mealType: MealType,
  action: MealAction,
) {
  const { error } = await supabase.from('meal_events').insert({
    recipe_id: recipeId,
    meal_type: mealType,
    action,
  });
  if (error) throw error;
}

/** Recent accepted titles, newest first — used to avoid immediate repeats. */
export async function recentTitles(mealType?: MealType, limit = 30): Promise<string[]> {
  let query = supabase
    .from('recipes')
    .select('title, meal_type, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (mealType) query = query.eq('meal_type', mealType);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r: { title: string }) => r.title);
}

// ---------------------------------------------------------------------------
// Weekly plan
// ---------------------------------------------------------------------------
export async function getPlan(dateKeys: string[]): Promise<PlanEntry[]> {
  if (!dateKeys.length) return [];
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .select('*, recipe:recipes(*)')
    .in('plan_date', dateKeys);
  if (error) throw error;
  return (data ?? []) as PlanEntry[];
}

export async function setPlanEntry(
  planDate: string,
  mealType: MealType,
  recipeId: string,
) {
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .upsert(
      { plan_date: planDate, meal_type: mealType, recipe_id: recipeId, status: 'planned' },
      { onConflict: 'user_id,plan_date,meal_type' },
    )
    .select('*, recipe:recipes(*)')
    .single();
  if (error) throw error;
  return data as PlanEntry;
}

export async function acceptPlanEntry(id: string) {
  const { error } = await supabase
    .from('meal_plan_entries')
    .update({ status: 'accepted' })
    .eq('id', id);
  if (error) throw error;
}

export async function clearPlanEntry(planDate: string, mealType: MealType) {
  const { error } = await supabase
    .from('meal_plan_entries')
    .delete()
    .eq('plan_date', planDate)
    .eq('meal_type', mealType);
  if (error) throw error;
}
