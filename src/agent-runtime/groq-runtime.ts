import { GroqRuntimeError } from './errors.js';
import {
  createGroqChatRequest,
  createGroqClient,
  DEFAULT_GROQ_MODEL,
  type GroqClient,
} from './groq-client.js';
import { createAgentIntent, type AgentIntent, type AgentIntentInput, type AgentRuntimeMetadata, type AgentTask } from './types.js';
import type { AgentRuntime } from './runtime.js';

const MAX_RECIPIENT_LENGTH = 256;
const MAX_CATEGORY_LENGTH = 64;
const MAX_REASON_LENGTH = 500;
const MAX_SUBJECT_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function boundedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new GroqRuntimeError('invalid-spend-intent', `${field} is invalid.`);
  }
  return value;
}

function parseModelProposal(modelOutput: string): AgentIntentInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(modelOutput);
  } catch {
    throw new GroqRuntimeError('invalid-model-response', 'The Groq response was not a valid proposal object.');
  }

  if (!isRecord(parsed) || typeof parsed.action !== 'string') {
    throw new GroqRuntimeError('invalid-model-response', 'The Groq response did not contain a supported action.');
  }

  if (parsed.action === 'spend') {
    if (typeof parsed.amount !== 'string') {
      throw new GroqRuntimeError('invalid-spend-intent', 'Spend amount must be a decimal integer string.');
    }

    return {
      action: 'spend',
      amount: parsed.amount,
      recipient: boundedText(parsed.recipient, 'Recipient', MAX_RECIPIENT_LENGTH),
      category: boundedText(parsed.category, 'Category', MAX_CATEGORY_LENGTH),
      reason: boundedText(parsed.reason, 'Reason', MAX_REASON_LENGTH),
    };
  }

  if (parsed.action === 'observe') {
    return {
      action: 'observe',
      subject: boundedText(parsed.subject, 'Subject', MAX_SUBJECT_LENGTH),
    };
  }

  throw new GroqRuntimeError('invalid-model-response', 'The Groq response contained an unsupported action.');
}

export class GroqBuiltInAgentRuntime implements AgentRuntime {
  readonly kind = 'built-in' as const;
  private currentStatus: 'ready' | 'processing' | 'stopped' = 'ready';

  constructor(
    readonly agentId: string,
    private readonly client: GroqClient = createGroqClient(),
    private readonly model: string = process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL,
  ) {
    if (!agentId.trim()) {
      throw new Error('Agent ID is required.');
    }
    if (!model.trim()) {
      throw new Error('Groq model is required.');
    }
  }

  get status(): 'ready' | 'processing' | 'stopped' {
    return this.currentStatus;
  }

  getMetadata(): AgentRuntimeMetadata {
    return {
      kind: this.kind,
      provider: 'groq',
      status: this.status,
    };
  }

  async receiveTask(task: AgentTask): Promise<AgentIntent> {
    if (this.status === 'stopped') {
      throw new Error('Agent runtime is stopped.');
    }

    this.currentStatus = 'processing';
    try {
      let modelOutput: string;
      try {
        modelOutput = await this.client.complete(createGroqChatRequest(task, this.model));
      } catch (error: unknown) {
        if (error instanceof GroqRuntimeError) {
          throw error;
        }
        throw new GroqRuntimeError('groq-request-failed', 'The Groq request failed.');
      }

      const proposedInput = parseModelProposal(modelOutput);
      try {
        return createAgentIntent(this.agentId, proposedInput);
      } catch {
        throw new GroqRuntimeError('invalid-spend-intent', 'The proposed intent failed Vouch validation.');
      }
    } finally {
      this.currentStatus = 'ready';
    }
  }

  stop(): void {
    this.currentStatus = 'stopped';
  }
}