import { createAgentIntent, type AgentIntent, type AgentRuntimeMetadata, type AgentTask } from './types.js';
import type { AgentRuntime } from './runtime.js';

/** Development-only deterministic behavior. A future Groq adapter belongs behind AgentRuntime. */
export class BuiltInAgentRuntime implements AgentRuntime {
  readonly kind = 'built-in' as const;
  private currentStatus: 'ready' | 'processing' | 'stopped' = 'ready';

  constructor(readonly agentId: string) {
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
      provider: 'deterministic-development',
      status: this.status,
    };
  }

  async receiveTask(task: AgentTask): Promise<AgentIntent> {
    if (this.status === 'stopped') {
      throw new Error('Agent runtime is stopped.');
    }

    this.currentStatus = 'processing';
    try {
      return createAgentIntent(this.agentId, task);
    } finally {
      this.currentStatus = 'ready';
    }
  }

  stop(): void {
    this.currentStatus = 'stopped';
  }
}