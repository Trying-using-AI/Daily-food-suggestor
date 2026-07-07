# 🍲 Daily Food Suggestor

An AI-powered recipe app that suggests **breakfast, lunch and dinner** ideas tailored
to your tastes, dietary needs, and what's in your kitchen — and gets smarter every time
you accept a meal.

## Features

- **Next Meal suggestor** — one tailored idea for the meal that's coming up, with a
  one-tap **“Another idea”** button and accept/skip.
- **Today's meals** — plan breakfast, lunch and dinner for today; regenerate any slot.
- **Weekly meal decider** — fill all 21 meals for the week in one go, then tweak
  individual slots or accept the whole plan.
- **My Kitchen** — track pantry ingredients, and a **“Cook from my kitchen” toggle**
  that biases every decider toward recipes using what you already have.
- **Your Tastes** — a live preference model built from every meal you accept or skip,
  showing your cuisine / ingredient / style affinities. That same signal is fed back
  into the AI so suggestions keep improving.
- **Onboarding** captures food preferences, cuisines, dietary restrictions, allergies,
  health considerations, spice level, prep-time and servings before you start.

## How it works

| Layer | Tech |
|---|---|
| Frontend | Vite + React + TypeScript |
| Data & auth | Supabase (Postgres + Row Level Security + anonymous auth) |
| AI | Supabase **Edge Function** calling the Claude API server-side |

Your Claude API key lives only in the Edge Function as a secret — it never reaches the
browser. Each user is signed in **anonymously**, so every row is protected by RLS and
scoped to `auth.uid()` with no login friction.

---

## Setup

### 0. Prerequisites

- Node 18+
- A [Supabase](https://supabase.com) project
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm i -g supabase`)
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Install

```bash
npm install
```

### 2. Configure the frontend

```bash
cp .env.example .env
```

Fill in from **Supabase → Project Settings → API**:

```
VITE_SUPABASE_URL=https://YOUR-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. Create the database

Run the migration in `supabase/migrations/0001_init.sql`. Either:

```bash
supabase link --project-ref YOUR-ref
supabase db push
```

…or paste the file's contents into **Supabase → SQL Editor** and run it.

### 4. Enable anonymous sign-in

**Supabase → Authentication → Providers → Anonymous → enable.**
(The app signs users in anonymously on first load.)

### 5. Deploy the recipe function + set secrets

```bash
supabase functions deploy suggest-recipes
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
# optional — defaults to claude-haiku-4-5. Use claude-opus-4-8 for higher quality.
supabase secrets set ANTHROPIC_MODEL=claude-haiku-4-5
```

### 6. Run

```bash
npm run dev
```

Open the printed URL. On first launch you'll complete onboarding, then start getting
suggestions.

---

## Choosing a model

The Edge Function reads `ANTHROPIC_MODEL` (default `claude-haiku-4-5` — fast and
cost-effective, well-suited to recipe generation). For higher-quality suggestions set
`ANTHROPIC_MODEL=claude-opus-4-8`. No code change needed. Note that `effort` tuning is
applied automatically only for Opus/Sonnet-tier models (Haiku doesn't support it).

## Data model

| Table | Purpose |
|---|---|
| `preferences` | One row per user — diet, allergies, cuisines, health, spice, servings. |
| `pantry_items` | Ingredients you have on hand. |
| `recipes` | Every AI-generated recipe (referenced by events and the plan). |
| `meal_events` | Every `suggested` / `accepted` / `rejected` / `skipped` action — the raw signal behind “Your Tastes”. |
| `meal_plan_entries` | The weekly plan: one recipe per `(date, meal_type)`. |

All tables have Row Level Security; users only ever see their own rows.

## Scripts

```bash
npm run dev        # start dev server
npm run build      # typecheck + production build
npm run typecheck  # types only
```

## Notes & edge cases handled

- Allergies and disliked ingredients are enforced as **hard exclusions** in the prompt.
- “Another idea” logs a soft rejection and excludes already-shown titles so you don't
  see repeats.
- The weekly decider batches AI calls (a few requests fill the whole week) and shows
  progress as it goes.
- The pantry toggle is disabled until you've added at least one ingredient.
- Empty states, loading skeletons, and error messages are shown throughout.
