export type ContentPart =
  { type: 'text'; text: string } | { type: 'input_audio'; input_audio: { data: string; format: string } };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  /** Per attempt; defaults to three minutes. Writing a whole scenario takes longer. */
  timeoutMs?: number;
  /**
   * Cap on hidden reasoning tokens, which count against maxTokens. Models that
   * think by default can otherwise spend the whole budget before answering.
   */
  reasoningTokens?: number;
}

export interface AiClient {
  chat(request: ChatRequest): Promise<string>;
}

export interface AiConfig {
  /** Null when no API key is configured; reviews then fail with a clear message. */
  client: AiClient | null;
  reviewModel: string;
  audioModel: string;
}

/** Scoring and scenario writing. Chosen for cost; set AI_REVIEW_MODEL to use a stronger model. */
export const DEFAULT_REVIEW_MODEL = 'google/gemini-3.8-flash';
export const DEFAULT_AUDIO_MODEL = 'google/gemini-3.8-flash';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 180_000;
const RETRIES = 3;

export class AiError extends Error {}

/** OpenRouter's OpenAI-compatible chat API, with a timeout and retries on transient failures. */
export function openRouterClient(apiKey: string, appUrl = 'https://proofwork.local'): AiClient {
  return {
    async chat({ model, messages, maxTokens, temperature = 0.2, timeoutMs = TIMEOUT_MS, reasoningTokens }) {
      let lastError: unknown;
      for (let attempt = 0; attempt < RETRIES; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
        try {
          const res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': appUrl,
              'X-Title': 'Proofwork',
            },
            body: JSON.stringify({
              model,
              messages,
              max_tokens: maxTokens,
              temperature,
              ...(reasoningTokens ? { reasoning: { max_tokens: reasoningTokens } } : {}),
            }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          const body = (await res.json().catch(() => ({}))) as {
            choices?: { message?: { content?: string }; finish_reason?: string }[];
            error?: { message?: string };
          };
          if (!res.ok) {
            const message = `${model}: ${res.status} ${body.error?.message ?? res.statusText}`;
            // Rate limits and server errors are worth retrying; bad requests are not.
            if (res.status === 429 || res.status >= 500) {
              lastError = new AiError(message);
              continue;
            }
            throw new AiError(message);
          }
          const content = body.choices?.[0]?.message?.content;
          // A reply cut off at the token limit would be cut off again; say so instead of retrying.
          if (body.choices?.[0]?.finish_reason === 'length') {
            throw new AiError(`${model}: the reply was cut off at the ${maxTokens}-token limit`);
          }
          if (!content) {
            lastError = new AiError(`${model}: empty response`);
            continue;
          }
          return content;
        } catch (error) {
          // Non-retryable API errors are thrown as AiError; network errors and timeouts retry.
          if (error instanceof AiError) throw error;
          lastError = error;
        }
      }
      throw lastError instanceof Error ? lastError : new AiError('AI request failed');
    },
  };
}

export function aiConfigFromEnv(env = process.env): AiConfig {
  const key = env.OPENROUTER_API_KEY?.trim();
  return {
    client: key ? openRouterClient(key, env.APP_URL) : null,
    reviewModel: env.AI_REVIEW_MODEL || DEFAULT_REVIEW_MODEL,
    audioModel: env.AI_AUDIO_MODEL || DEFAULT_AUDIO_MODEL,
  };
}

/** Pulls the JSON object out of a model reply, tolerating code fences or stray prose. */
export function extractJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const source = fenced ? fenced[1] : text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end <= start) throw new AiError('The model did not return JSON');
  return JSON.parse(source.slice(start, end + 1)) as T;
}
