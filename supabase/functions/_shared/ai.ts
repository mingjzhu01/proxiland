// Spec v4, section 6: "One place to call models." Nothing else in the codebase should
// talk to a model provider directly — switching providers is a change inside this file
// plus the AI_PROVIDER config value.

const AI_PROVIDER = Deno.env.get('AI_PROVIDER') ?? 'anthropic';
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_MODEL = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-haiku-4-5-20251001';

export async function askModel(
  prompt: string,
  opts?: {
    maxTokens?: number;
    enableWebSearch?: boolean;
    // Per-call overrides — lets one function (e.g. draft-bio) use a different model or
    // search budget than the shared default, without touching that default for everyone
    // else. Each still falls back to a sensible shared/hardcoded value when unset.
    webSearchMaxUses?: number;
    model?: string;
    timeoutMs?: number;
  }
): Promise<string> {
  if (AI_PROVIDER !== 'anthropic') {
    throw new Error(`Unsupported AI_PROVIDER: ${AI_PROVIDER}`);
  }
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set');
  }

  const body: Record<string, unknown> = {
    model: opts?.model ?? ANTHROPIC_MODEL,
    max_tokens: opts?.maxTokens ?? 1024,
    messages: [{ role: 'user', content: prompt }],
  };

  // Anthropic's server-side web search tool — the search itself runs on Anthropic's side;
  // we just get search-result blocks interspersed with text in the response.
  if (opts?.enableWebSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: opts?.webSearchMaxUses ?? 3 }];
  }

  const controller = opts?.timeoutMs ? new AbortController() : undefined;
  const timeoutId = controller ? setTimeout(() => controller.abort(), opts!.timeoutMs) : undefined;

  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();
  const content = data.content;
  if (!Array.isArray(content)) {
    throw new Error('Unexpected Anthropic response shape');
  }

  // With web search enabled, content can interleave text/server_tool_use/
  // web_search_tool_result blocks — concatenate only the text blocks, in order, as the
  // final answer.
  const text = content
    .filter((block: { type: string }) => block.type === 'text')
    .map((block: { text: string }) => block.text)
    .join('');

  if (!text) {
    throw new Error('Unexpected Anthropic response shape');
  }
  return text;
}
