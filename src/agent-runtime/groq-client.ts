import { GroqRuntimeError } from './errors.js';
import type { AgentTask } from './types.js';

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';

const SYSTEM_PROMPT = [
  'You propose actions for Vouch; you do not execute financial actions.',
  'Return only a JSON object representing a proposal. Never claim it is authorized.',
  'For spend proposals, action must be "spend" and amount must be a positive integer decimal string.',
  'Never invent authorization state or return API keys, secrets, private keys, seed phrases, or wallet credentials.',
].join(' ');

export interface GroqChatRequest {
  readonly model: string;
  readonly messages: readonly [
    { readonly role: 'system'; readonly content: string },
    { readonly role: 'user'; readonly content: string },
  ];
  readonly temperature: 0;
  readonly response_format: { readonly type: 'json_object' };
}

export interface GroqClient {
  complete(request: GroqChatRequest): Promise<string>;
}

function taskForModel(task: AgentTask): string {
  if (task.action === 'spend') {
    return JSON.stringify({
      action: task.action,
      amount: typeof task.amount === 'bigint' ? task.amount.toString() : task.amount,
      recipient: task.recipient,
      category: task.category,
      reason: task.reason,
    });
  }

  return JSON.stringify(task);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractContent(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) {
    return undefined;
  }

  const firstChoice = value.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return undefined;
  }

  const content = firstChoice.message.content;
  return typeof content === 'string' ? content : undefined;
}

function sanitizeProviderText(value: string, secret: string): string {
  return value
    .split(secret)
    .join('[redacted]')
    .replace(/bearer\s+[^\s]+/gi, '[redacted]')
    .replace(/\b(?:gsk|sk)-[A-Za-z0-9_-]+\b/gi, '[redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

function extractProviderError(value: unknown, secret: string): string | undefined {
  if (!isRecord(value) || !isRecord(value.error)) {
    return undefined;
  }

  const providerError = value.error;
  const parts: string[] = [];
  if (typeof providerError.code === 'string') {
    const code = sanitizeProviderText(providerError.code, secret);
    if (code) {
      parts.push(`code=${code}`);
    }
  }
  if (typeof providerError.message === 'string') {
    const message = sanitizeProviderText(providerError.message, secret);
    if (message) {
      parts.push(`message=${message}`);
    }
  }

  return parts.length > 0 ? parts.join(', ') : undefined;
}

export function createGroqClient(): GroqClient {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new GroqRuntimeError(
      'missing-api-key',
      'GROQ_API_KEY is required for the Groq-backed agent runtime.',
    );
  }

  return {
    async complete(request: GroqChatRequest): Promise<string> {
      let response: Response;
      try {
        response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature,
            response_format: request.response_format,
          }),
        });
      } catch {
        throw new GroqRuntimeError('groq-request-failed', 'The Groq request failed.');
      }

      if (!response.ok) {
        let providerError: unknown;
        try {
          providerError = await response.json();
        } catch {
          providerError = undefined;
        }
        const providerSummary = extractProviderError(providerError, apiKey);
        const detail = providerSummary ? ` Provider error: ${providerSummary}.` : '';
        throw new GroqRuntimeError(
          'groq-request-failed',
          `The Groq request failed with status ${response.status}.${detail}`,
        );
      }

      let responseBody: unknown;
      try {
        responseBody = await response.json();
      } catch {
        throw new GroqRuntimeError('groq-request-failed', 'The Groq response was not valid JSON.');
      }

      const content = extractContent(responseBody);
      if (content === undefined) {
        throw new GroqRuntimeError('groq-request-failed', 'The Groq response did not contain model content.');
      }

      return content;
    },
  };
}

export function createGroqChatRequest(task: AgentTask, model: string): GroqChatRequest {
  return {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Propose an action for this task:\n${taskForModel(task)}` },
    ],
    temperature: 0,
    response_format: { type: 'json_object' },
  };
}