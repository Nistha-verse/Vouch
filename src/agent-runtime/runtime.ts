import type {
  AgentIntent,
  AgentRuntimeMetadata,
  AgentRuntimeStatus,
  AgentTask,
} from './types.js';

export interface AgentRuntime {
  readonly agentId: string;
  readonly kind: 'built-in' | 'custom';
  readonly status: AgentRuntimeStatus;
  receiveTask(task: AgentTask): Promise<AgentIntent>;
  getMetadata(): AgentRuntimeMetadata;
  stop(): void;
}