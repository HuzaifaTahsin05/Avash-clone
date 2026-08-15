import { z } from 'zod';

/** `GEMINI_MODEL_ID` (§14) — the one value to change when swapping Gemini models. */
export const GEMINI_MODEL_ID = 'gemini-2.5-flash';
/** `GEMINI_REQUEST_TIMEOUT_MS` (§14) — bounds a hung Gemini call inside the Worker's request budget. */
export const GEMINI_REQUEST_TIMEOUT_MS = 5000;

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface CallGeminiStructuredOptions<T> {
  apiKey: string;
  /** Fixed system instruction supplied by the caller as a constant — never interpolated from user input. */
  systemInstruction: string;
  /** Untrusted free text — wrapped in a delimited data block, never role-elevated. */
  userContent: string;
  /** Validates and shapes the model's structured output; also generates the API-facing JSON schema. */
  responseSchema: z.ZodType<T>;
  signal?: AbortSignal;
}

export type CallGeminiStructuredResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Strips HTML/markdown/control characters before the untrusted text ever reaches the prompt. */
function sanitizeUserContent(input: string): string {
  return input
    .replace(/<[^>]*>/g, ' ')
    .replace(/[*_`#[\]()]/g, ' ')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ' ')
    .trim();
}

/**
 * Every §5.4 prompt-injection defense lives in this one function so no
 * route can forget one: fixed system instruction, a clearly delimited
 * untrusted-data block, sanitized input, structured output always
 * enforced, a bounded timeout, and the caller's own zod schema
 * re-validating the response before it is ever trusted. Never throws,
 * never returns unvalidated model output (ADR-004 — the LLM's output is
 * never the decision, only structured input to a deterministic engine
 * downstream).
 */
export async function callGeminiStructured<T>(
  options: CallGeminiStructuredOptions<T>
): Promise<CallGeminiStructuredResult<T>> {
  const { apiKey, systemInstruction, userContent, responseSchema, signal } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);
  signal?.addEventListener('abort', () => controller.abort());

  try {
    const sanitized = sanitizeUserContent(userContent);
    const url = `${GEMINI_API_BASE}/${GEMINI_MODEL_ID}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: `--- BEGIN UNTRUSTED USER DATA ---\n${sanitized}\n--- END UNTRUSTED USER DATA ---` }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: z.toJSONSchema(responseSchema, { target: 'draft-07' }),
        },
      }),
    });

    if (!response.ok) {
      return { ok: false, reason: `gemini_http_${response.status}` };
    }

    const payload = await response.json().catch(() => undefined);
    const text = (payload as { candidates?: { content?: { parts?: { text?: string }[] } }[] } | undefined)
      ?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== 'string') {
      return { ok: false, reason: 'gemini_malformed_response' };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      return { ok: false, reason: 'gemini_invalid_json' };
    }

    const validated = responseSchema.safeParse(parsedJson);
    if (!validated.success) {
      return { ok: false, reason: 'gemini_schema_mismatch' };
    }

    return { ok: true, data: validated.data };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, reason: 'gemini_timeout' };
    }
    return { ok: false, reason: 'gemini_request_failed' };
  } finally {
    clearTimeout(timeout);
  }
}
