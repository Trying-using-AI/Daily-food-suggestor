// Supabase Edge Function: suggest-recipes
//
// Generates meal suggestions with Claude. The Anthropic API key lives here as a
// server-side secret and never reaches the browser. The function reads the
// caller's preferences, pantry, and recent accept/reject history (through their
// own JWT, so Row Level Security applies) and asks Claude for structured recipes.
//
// Deploy:  supabase functions deploy suggest-recipes
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//          (optional) supabase secrets set ANTHROPIC_MODEL=claude-opus-4-8

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type MealType = 'breakfast' | 'lunch' | 'dinner';

interface RequestBody {
  mealType: MealType;
  count?: number;
  usePantry?: boolean;
  excludeTitles?: string[];
  context?: string; // free-form note, e.g. "quick weeknight dinner"
}

const RECIPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    recipes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          meal_type: { type: 'string', enum: ['breakfast', 'lunch', 'dinner'] },
          cuisine: { type: 'string' },
          description: { type: 'string' },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                item: { type: 'string' },
                quantity: { type: 'string' },
              },
              required: ['item', 'quantity'],
            },
          },
          steps: { type: 'array', items: { type: 'string' } },
          tags: { type: 'array', items: { type: 'string' } },
          prep_minutes: { type: 'integer' },
          cook_minutes: { type: 'integer' },
          servings: { type: 'integer' },
          calories: { type: 'integer' },
          uses_pantry_items: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'title',
          'meal_type',
          'cuisine',
          'description',
          'ingredients',
          'steps',
          'tags',
          'prep_minutes',
          'cook_minutes',
          'servings',
          'calories',
          'uses_pantry_items',
        ],
      },
    },
  },
  required: ['recipes'],
};

function list(arr: string[] | null | undefined): string {
  return arr && arr.length ? arr.join(', ') : 'none';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }, 500);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader) {
      return json({ error: 'Missing Authorization header.' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return json({ error: 'Not authenticated.' }, 401);
    }

    const body = (await req.json()) as RequestBody;
    const mealType = body.mealType;
    if (!['breakfast', 'lunch', 'dinner'].includes(mealType)) {
      return json({ error: 'Invalid mealType.' }, 400);
    }
    const count = Math.min(Math.max(body.count ?? 1, 1), 4);
    const usePantry = !!body.usePantry;
    const excludeTitles = (body.excludeTitles ?? []).slice(0, 40);

    // Preferences
    const { data: prefs } = await supabase
      .from('preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    // Pantry
    const { data: pantryRows } = await supabase
      .from('pantry_items')
      .select('name')
      .eq('user_id', user.id);
    const pantry = (pantryRows ?? []).map((r: { name: string }) => r.name);

    // Recent taste signal: last accepted & rejected recipes (title/cuisine/tags)
    const { data: events } = await supabase
      .from('meal_events')
      .select('action, recipes ( title, cuisine, tags )')
      .eq('user_id', user.id)
      .in('action', ['accepted', 'rejected'])
      .order('created_at', { ascending: false })
      .limit(40);

    const accepted: string[] = [];
    const rejected: string[] = [];
    for (const e of events ?? []) {
      const r = (e as any).recipes;
      if (!r) continue;
      const label = `${r.title} (${r.cuisine}${
        r.tags?.length ? ', ' + r.tags.join('/') : ''
      })`;
      if ((e as any).action === 'accepted') accepted.push(label);
      else rejected.push(label);
    }

    const p = prefs ?? {};
    const systemPrompt = [
      'You are a thoughtful personal chef and meal planner.',
      'Generate realistic, appealing home-cooked recipes tailored to one person\'s profile.',
      'Hard rules you must NEVER break:',
      `- Respect ALL allergies. Do not include any allergen or an ingredient derived from it.`,
      `- Respect ALL dietary restrictions (e.g. vegetarian, vegan, halal, keto).`,
      `- Honor health conditions with appropriate choices (e.g. lower sodium for hypertension, lower added sugar / lower glycemic for diabetes).`,
      '- Never include an ingredient the user listed as disliked.',
      'Soft preferences: favor liked cuisines, keep within the max prep time, match the spice level and serving size, and support the user\'s goals.',
      'Return practical ingredient lists with quantities and clear numbered steps. Keep calories a reasonable per-serving estimate.',
    ].join('\n');

    const pantryInstruction = usePantry
      ? `The user has these pantry ingredients on hand: ${list(pantry)}. Strongly prefer recipes that use as many of these as possible, and list which ones each recipe uses in "uses_pantry_items". You may add a few common extra ingredients, but minimize new shopping.`
      : `Ignore pantry contents for this request. Leave "uses_pantry_items" as an empty array.`;

    const userPrompt = [
      `Create ${count} distinct ${mealType} recipe${count > 1 ? 's' : ''}.`,
      '',
      'User profile:',
      `- Diets/restrictions: ${list(p.diets)}`,
      `- Allergies (hard exclude): ${list(p.allergies)}`,
      `- Disliked ingredients (exclude): ${list(p.disliked_ingredients)}`,
      `- Health conditions: ${list(p.health_conditions)}`,
      `- Liked cuisines: ${list(p.cuisines_liked)}`,
      `- Disliked cuisines (avoid): ${list(p.cuisines_disliked)}`,
      `- Goals: ${list(p.goals)}`,
      `- Spice level: ${p.spice_level ?? 'medium'}`,
      `- Max prep time: ${p.max_prep_minutes ?? 45} minutes`,
      `- Servings: ${p.servings ?? 2}`,
      '',
      pantryInstruction,
      '',
      accepted.length
        ? `Meals the user recently ACCEPTED (lean toward this style/variety): ${accepted.slice(0, 12).join('; ')}.`
        : '',
      rejected.length
        ? `Meals the user recently REJECTED (avoid these and similar): ${rejected.slice(0, 12).join('; ')}.`
        : '',
      excludeTitles.length
        ? `Do NOT suggest any of these (already shown): ${excludeTitles.join('; ')}.`
        : '',
      body.context ? `Extra context: ${body.context}` : '',
      '',
      `Every recipe\'s meal_type must be "${mealType}". Make the ${count} recipes varied from each other.`,
    ]
      .filter(Boolean)
      .join('\n');

    // Structured output works on all current models. The `effort` control is
    // only valid on Opus/Sonnet-tier models — it errors on Haiku 4.5 — so add
    // it only when the configured model supports it.
    const outputConfig: Record<string, unknown> = {
      format: { type: 'json_schema', schema: RECIPE_SCHEMA },
    };
    if (!ANTHROPIC_MODEL.includes('haiku')) {
      outputConfig.effort = 'low';
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4096,
        system: systemPrompt,
        output_config: outputConfig,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const detail = await anthropicRes.text();
      return json(
        { error: 'Recipe generation failed.', detail: detail.slice(0, 500) },
        502,
      );
    }

    const data = await anthropicRes.json();
    if (data.stop_reason === 'refusal') {
      return json(
        { error: 'The model declined this request. Try adjusting your preferences.' },
        422,
      );
    }

    const textBlock = (data.content ?? []).find((b: any) => b.type === 'text');
    if (!textBlock?.text) {
      return json({ error: 'Empty response from model.' }, 502);
    }

    let parsed: { recipes: unknown[] };
    try {
      parsed = JSON.parse(textBlock.text);
    } catch {
      return json({ error: 'Could not parse model output.' }, 502);
    }

    return json({ recipes: parsed.recipes ?? [] }, 200);
  } catch (err) {
    return json({ error: 'Unexpected error.', detail: String(err) }, 500);
  }
});

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
