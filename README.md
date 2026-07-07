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
| AI | Supabase **Edge Function** calling any OpenAI-compatible LLM server-side |

The LLM API key lives only in the Edge Function as a secret — it never reaches the
browser. Each user is signed in **anonymously**, so every row is protected by RLS and
scoped to `auth.uid()` with no login friction.

The recipe function talks to any **OpenAI-compatible** chat endpoint, so you can use a
free open-source model. It defaults to **Groq + Gemma** (`gemma2-9b-it`).

---

## Setup

### 0. Prerequisites

- Node 18+
- A [Supabase](https://supabase.com) project
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm i -g supabase`)
- An LLM API key from any OpenAI-compatible provider. A **free [Groq](https://console.groq.com/keys) key** is the easiest — it serves Gemma and other open models.

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
supabase secrets set LLM_API_KEY=your-groq-key
# optional — these are the defaults (Groq + Gemma):
supabase secrets set LLM_BASE_URL=https://api.groq.com/openai/v1
supabase secrets set LLM_MODEL=gemma2-9b-it
```

### 6. Run

```bash
npm run dev
```

Open the printed URL. On first launch you'll complete onboarding, then start getting
suggestions.

---

## Choosing a model / provider

The Edge Function calls any **OpenAI-compatible** `/chat/completions` endpoint, set via
three secrets (defaults shown):

| Secret | Default | Notes |
|---|---|---|
| `LLM_API_KEY` | — (required) | Your provider key |
| `LLM_BASE_URL` | `https://api.groq.com/openai/v1` | Provider base URL |
| `LLM_MODEL` | `gemma2-9b-it` | Model id |

Some ready-made combinations — swap them in with `supabase secrets set`, no code change:

| Provider | `LLM_BASE_URL` | `LLM_MODEL` |
|---|---|---|
| Groq (Gemma) | `https://api.groq.com/openai/v1` | `gemma2-9b-it` |
| Groq (Llama 3.3 70B) | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| OpenRouter (free Gemma) | `https://openrouter.ai/api/v1` | `google/gemma-2-9b-it:free` |
| Google AI Studio (Gemma) | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemma-3-27b-it` |
| Together | `https://api.together.xyz/v1` | `google/gemma-2-27b-it` |

Because it's just an OpenAI-compatible endpoint, you can also point it at a self-hosted
vLLM / LM Studio server (as long as it's reachable from the internet).

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
