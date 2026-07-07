// Supabase Edge Function: suggest-recipes
//
// Generates meal suggestions from an LLM. The API key lives here as a
// server-side secret and never reaches the browser. The function reads the
// caller's preferences, pantry, and recent accept/reject history (through their
// own JWT, so Row Level Security applies) and asks the model for structured
// recipes.
//
// Works with ANY OpenAI-compatible chat-completions endpoint, so you can run an
// open-source model. Defaults to Groq + Gemma (free & fast). Configure with:
//   LLM_API_KEY   (required)  e.g. your Groq / OpenRouter / Together key
//   LLM_BASE_URL  (optional)  default https://api.groq.com/openai/v1
//   LLM_MODEL     (optional)  default gemma2-9b-it
//
// Examples:
//   Groq + Gemma   : LLM_BASE_URL=https://api.groq.com/openai/v1        LLM_MODEL=gemma2-9b-it
//   Groq + Llama   : LLM_BASE_URL=https://api.groq.com/openai/v1        LLM_MODEL=llama-3.3-70b-versatile
//   OpenRouter     : LLM_BASE_URL=https://openrouter.ai/api/v1          LLM_MODEL=google/gemma-2-9b-it:free
//   Google AI (Gemma): LLM_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai  LLM_MODEL=gemma-3-27b-it
//   Together        : LLM_BASE_URL=https://api.together.xyz/v1          LLM_MODEL=google/gemma-2-27b-it
//
// Deploy:  supabase functions deploy suggest-recipes
// Secrets: supabase secrets set LLM_API_KEY=...

import { createClient } from 'jsr:@supabase/supabase-js@2';

const LLM_API_KEY = Deno.env.get('LLM_API_KEY') ?? '';
const LLM_BASE_URL =
  (Deno.env.get('LLM_BASE_URL') ?? 'https://api.groq.com/openai/v1').replace(/\/$/, '');
const LLM_MODEL = Deno.env.get('LLM_MODEL') ?? 'gemma2-9b-it';
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

// Human-readable JSON contract embedded in the prompt. Open models honor a
// clear shape description reliably when combined with JSON response mode.
const JSON_SHAPE = `{
  "recipes": [
    {
      "title": "string",
      "meal_type": "breakfast | lunch | dinner",
      "cuisine": "string",
      "description": "one appetizing sentence",
      "ingredients": [{ "item": "string", "quantity": "string" }],
      "steps": ["step 1", "step 2"],
      "tags": ["string"],
      "prep_minutes": 0,
      "cook_minutes": 0,
      "servings": 0,
      "calories": 0,
      "uses_pantry_items": ["string"]
    }
  ]
}`;

function list(arr: string[] | null | undefined): string {
  return arr && arr.length ? arr.join(', ') : 'none';
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!LLM_API_KEY) {
      return json({ error: 'LLM_API_KEY is not configured on the server.' }, 500);
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
      '- Respect ALL allergies. Do not include any allergen or an ingredient derived from it.',
      '- Respect ALL dietary restrictions (e.g. vegetarian, vegan, halal, keto).',
      '- Honor health conditions with appropriate choices (e.g. lower sodium for hypertension, lower added sugar / lower glycemic for diabetes).',
      '- Never include an ingredient the user listed as disliked.',
      'Soft preferences: favor liked cuisines, keep within the max prep time, match the spice level and serving size, and support the user\'s goals.',
      'Return practical ingredient lists with quantities and clear numbered steps. Keep calories a reasonable per-serving estimate.',
      '',
      'Respond with a single valid JSON object only — no markdown, no code fences, no commentary.',
      'Use exactly this JSON shape:',
      JSON_SHAPE,
    ].join('\n');

    const pantryInstruction = usePantry
      ? `The user has these pantry ingredients on hand: ${list(pantry)}. Strongly prefer recipes that use as many of these as possible, and list which ones each recipe uses in "uses_pantry_items". You may add a few common extra ingredients, but minimize new shopping.`
      : `Ignore pantry contents for this request. Leave "uses_pantry_items" as an empty array.`;

    const userPrompt = [
      `Create ${count} distinct ${mealType} recipe${count > 1 ? 's' : ''} as JSON.`,
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
      `Every recipe's meal_type must be "${mealType}". Make the ${count} recipes varied from each other.`,
    ]
      .filter(Boolean)
      .join('\n');

    const llmRes = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.8,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!llmRes.ok) {
      const detail = await llmRes.text();
      return json(
        { error: 'Recipe generation failed.', detail: detail.slice(0, 500) },
        502,
      );
    }

    const data = await llmRes.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content) {
      return json({ error: 'Empty response from model.' }, 502);
    }

    const parsed = parseRecipes(content);
    if (!parsed) {
      return json({ error: 'Could not parse model output.', detail: content.slice(0, 300) }, 502);
    }

    return json({ recipes: parsed }, 200);
  } catch (err) {
    return json({ error: 'Unexpected error.', detail: String(err) }, 500);
  }
});

/** Defensive JSON extraction — tolerates code fences or stray prose. */
function parseRecipes(raw: string): unknown[] | null {
  const tryParse = (s: string): unknown[] | null => {
    try {
      const obj = JSON.parse(s);
      if (Array.isArray(obj)) return obj;
      if (obj && Array.isArray(obj.recipes)) return obj.recipes;
      return null;
    } catch {
      return null;
    }
  };

  let text = raw.trim();
  // Strip ```json ... ``` fences if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  let out = tryParse(text);
  if (out) return out;

  // Fall back to the outermost { ... } block.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) {
    out = tryParse(text.slice(first, last + 1));
    if (out) return out;
  }
  return null;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });
}
