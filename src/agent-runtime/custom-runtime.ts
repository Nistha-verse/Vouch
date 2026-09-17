import { createAgentIntent, type AgentIntent, type AgentIntentInput, type AgentRuntimeMetadata, type AgentTask } from './types.js';
import type { AgentRuntime } from './runtime.js';

/** Application-level boundary for an existing agent; it performs no network or code execution. */
export interface CustomAgentAdapter {
  propose(task: AgentTask): Promise<AgentIntentInput>;
}

export class CustomAgentRuntime implements AgentRuntime {
  readonly kind = 'custom' as const;
  private currentStatus: 'ready' | 'processing' | 'stopped' = 'ready';

  constructor(
    readonly agentId: string,
    private readonly adapter: CustomAgentAdapter,
  ) {
    if (!agentId.trim()) {
      throw new Error('Agent ID is required.');
    }
  }

  get status(): 'ready' | 'processing' | 'stopped' {
    return this.currentStatus;
  }

  getMetadata(): AgentRuntimeMetadata {
    return {
      kind: this.kind,
      provider: 'external-adapter',
      status: this.status,
    };
  }

  async receiveTask(task: AgentTask): Promise<AgentIntent> {
    if (this.status === 'stopped') {
      throw new Error('Agent runtime is stopped.');
    }

    this.currentStatus = 'processing';
    try {
      const proposedIntent = await this.adapter.propose(task);
      return createAgentIntent(this.agentId, proposedIntent);
    } finally {
      this.currentStatus = 'ready';
    }
  }

  stop(): void {
    this.currentStatus = 'stopped';
  }
}