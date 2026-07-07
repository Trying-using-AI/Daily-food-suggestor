-- Daily Food Suggestor — initial schema
-- Everything is scoped to the authenticated user via Row Level Security.
-- Users sign in anonymously from the browser, so auth.uid() is always present.

-- ---------------------------------------------------------------------------
-- Preferences (one row per user, gathered during onboarding)
-- ---------------------------------------------------------------------------
create table if not exists public.preferences (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  diets               text[]  not null default '{}',   -- vegetarian, vegan, pescatarian, keto...
  cuisines_liked      text[]  not null default '{}',   -- italian, indian, mexican...
  cuisines_disliked   text[]  not null default '{}',
  allergies           text[]  not null default '{}',   -- peanuts, shellfish, gluten...
  disliked_ingredients text[] not null default '{}',   -- mushrooms, cilantro...
  health_conditions   text[]  not null default '{}',   -- diabetes, hypertension, high cholesterol...
  goals               text[]  not null default '{}',   -- weight loss, muscle gain, more veggies...
  spice_level         text    not null default 'medium', -- mild | medium | spicy
  max_prep_minutes    int     not null default 45,
  servings            int     not null default 2,
  onboarded           boolean not null default false,
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Pantry / kitchen ingredients the user has on hand
-- ---------------------------------------------------------------------------
create table if not exists public.pantry_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  category    text,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists pantry_items_user_idx on public.pantry_items (user_id);

-- ---------------------------------------------------------------------------
-- Recipes (cache of AI-generated recipes, referenced by events and the plan)
-- ---------------------------------------------------------------------------
create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null,
  meal_type     text not null,                 -- breakfast | lunch | dinner
  cuisine       text,
  description   text,
  ingredients   jsonb not null default '[]',   -- [{ item, quantity }]
  steps         jsonb not null default '[]',   -- [ "step one", "step two", ... ]
  tags          text[] not null default '{}',
  prep_minutes  int,
  cook_minutes  int,
  servings      int,
  calories      int,
  created_at    timestamptz not null default now()
);
create index if not exists recipes_user_idx on public.recipes (user_id);

-- ---------------------------------------------------------------------------
-- Meal events — the signal that powers the preference model.
-- Every suggestion shown is logged; accept/reject/skip update the taste profile.
-- ---------------------------------------------------------------------------
create table if not exists public.meal_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  meal_type   text not null,
  action      text not null check (action in ('suggested', 'accepted', 'rejected', 'skipped')),
  created_at  timestamptz not null default now()
);
create index if not exists meal_events_user_idx on public.meal_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Weekly meal plan — one recipe per (date, meal_type)
-- ---------------------------------------------------------------------------
create table if not exists public.meal_plan_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_date   date not null,
  meal_type   text not null,                 -- breakfast | lunch | dinner
  recipe_id   uuid not null references public.recipes (id) on delete cascade,
  status      text not null default 'planned' check (status in ('planned', 'accepted')),
  created_at  timestamptz not null default now(),
  unique (user_id, plan_date, meal_type)
);
create index if not exists meal_plan_user_idx on public.meal_plan_entries (user_id, plan_date);

-- ---------------------------------------------------------------------------
-- Row Level Security: every user sees and writes only their own rows.
-- ---------------------------------------------------------------------------
alter table public.preferences        enable row level security;
alter table public.pantry_items       enable row level security;
alter table public.recipes            enable row level security;
alter table public.meal_events        enable row level security;
alter table public.meal_plan_entries  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'preferences', 'pantry_items', 'recipes', 'meal_events', 'meal_plan_entries'
  ]
  loop
    execute format('drop policy if exists "own rows select" on public.%I;', t);
    execute format('drop policy if exists "own rows insert" on public.%I;', t);
    execute format('drop policy if exists "own rows update" on public.%I;', t);
    execute format('drop policy if exists "own rows delete" on public.%I;', t);

    execute format(
      'create policy "own rows select" on public.%I for select using (user_id = auth.uid());', t);
    execute format(
      'create policy "own rows insert" on public.%I for insert with check (user_id = auth.uid());', t);
    execute format(
      'create policy "own rows update" on public.%I for update using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
    execute format(
      'create policy "own rows delete" on public.%I for delete using (user_id = auth.uid());', t);
  end loop;
end $$;
