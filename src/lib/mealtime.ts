import type { MealType } from '../types';

/** Which meal makes sense right now, based on the local clock. */
export function currentMealType(date = new Date()): MealType {
  const h = date.getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  return 'dinner';
}

/** A friendly label for the upcoming meal, e.g. "Dinner tonight". */
export function nextMealLabel(date = new Date()): string {
  const meal = currentMealType(date);
  const when =
    meal === 'breakfast' ? 'this morning' : meal === 'lunch' ? 'today' : 'tonight';
  return `${capitalize(meal)} ${when}`;
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Local YYYY-MM-DD (avoids UTC off-by-one from toISOString). */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The 7 dates starting today. */
export function weekDates(start = new Date()): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
}

export function dayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return target.toLocaleDateString(undefined, { weekday: 'long' });
}
