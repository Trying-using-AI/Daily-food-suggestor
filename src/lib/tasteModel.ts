import { supabase } from './supabase';
import type { MealType } from '../types';

/**
 * The preference model.
 *
 * Every accept/reject on a recipe is a labelled example. We aggregate those
 * labels by cuisine, tag, and key ingredient into an affinity score:
 *
 *     affinity = (accepts - rejects) / (accepts + rejects)   in [-1, 1]
 *
 * weighted by how many times the feature was seen (confidence). This is a
 * simple, explainable recommender: positive affinity means "you tend to accept
 * this", negative means "you tend to reject it". The Edge Function also feeds
 * recent accepted/rejected meals to Claude so generation is biased the same way.
 */

export interface Affinity {
  key: string;
  accepts: number;
  rejects: number;
  score: number; // -1..1
}

export interface TasteProfile {
  totalAccepted: number;
  totalRejected: number;
  totalSuggested: number;
  cuisines: Affinity[];
  tags: Affinity[];
  ingredients: Affinity[];
  byMeal: Record<MealType, number>; // accepted counts per meal
}

interface EventRow {
  action: 'suggested' | 'accepted' | 'rejected' | 'skipped';
  meal_type: MealType;
  recipes: {
    cuisine: string | null;
    tags: string[] | null;
    ingredients: { item: string }[] | null;
  } | null;
}

const STOP_WORDS = new Set([
  'salt', 'pepper', 'water', 'oil', 'olive oil', 'butter', 'sugar', 'flour',
  'garlic', 'onion', 'salt and pepper', 'black pepper',
]);

function normalizeIngredient(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^[\d\s./-]+/, '') // strip leading quantities
    .replace(/\b(fresh|dried|chopped|minced|ground|large|small|to taste|cups?|tbsps?|tsps?|tablespoons?|teaspoons?|grams?|g|ml|oz|cloves?)\b/g, '')
    .replace(/[^a-z\s]/g, '')
    .trim();
}

function bump(map: Map<string, Affinity>, key: string, accepted: boolean) {
  const k = key.trim().toLowerCase();
  if (!k) return;
  const cur = map.get(k) ?? { key: k, accepts: 0, rejects: 0, score: 0 };
  if (accepted) cur.accepts += 1;
  else cur.rejects += 1;
  map.set(k, cur);
}

function finalize(map: Map<string, Affinity>, minSeen = 1): Affinity[] {
  const out: Affinity[] = [];
  for (const a of map.values()) {
    const total = a.accepts + a.rejects;
    if (total < minSeen) continue;
    a.score = total === 0 ? 0 : (a.accepts - a.rejects) / total;
    out.push(a);
  }
  // Sort by score, then by confidence (times seen).
  return out.sort((x, y) => y.score - x.score || y.accepts + y.rejects - (x.accepts + x.rejects));
}

export async function computeTasteProfile(): Promise<TasteProfile> {
  const { data, error } = await supabase
    .from('meal_events')
    .select('action, meal_type, recipes ( cuisine, tags, ingredients )')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;

  const rows = (data ?? []) as unknown as EventRow[];

  const cuisines = new Map<string, Affinity>();
  const tags = new Map<string, Affinity>();
  const ingredients = new Map<string, Affinity>();
  const byMeal: Record<MealType, number> = { breakfast: 0, lunch: 0, dinner: 0 };

  let totalAccepted = 0;
  let totalRejected = 0;
  let totalSuggested = 0;

  for (const row of rows) {
    if (row.action === 'suggested') totalSuggested += 1;
    if (row.action !== 'accepted' && row.action !== 'rejected') continue;
    const accepted = row.action === 'accepted';
    if (accepted) {
      totalAccepted += 1;
      byMeal[row.meal_type] = (byMeal[row.meal_type] ?? 0) + 1;
    } else {
      totalRejected += 1;
    }

    const r = row.recipes;
    if (!r) continue;
    if (r.cuisine) bump(cuisines, r.cuisine, accepted);
    for (const t of r.tags ?? []) bump(tags, t, accepted);
    for (const ing of r.ingredients ?? []) {
      const norm = normalizeIngredient(ing.item);
      if (norm && !STOP_WORDS.has(norm) && norm.length > 2) {
        bump(ingredients, norm, accepted);
      }
    }
  }

  return {
    totalAccepted,
    totalRejected,
    totalSuggested,
    byMeal,
    cuisines: finalize(cuisines),
    tags: finalize(tags),
    ingredients: finalize(ingredients, 2),
  };
}
