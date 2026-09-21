import {
  AGENT_STATUSES,
  AGENT_TYPES,
  createAgentIdentity,
  type AgentAuthorization,
  type AgentIdentity,
  type AgentStatus,
  type AgentType,
} from './agent-identity.js';
import type { AgentRepository, IdentityUpdate } from './persistence/database.js';

export type AgentManagerErrorCode =
  | 'invalid-name'
  | 'invalid-type'
  | 'invalid-authorization'
  | 'agent-not-found'
  | 'duplicate-agent-id'
  | 'already-active'
  | 'already-inactive'
  | 'already-revoked'
  | 'agent-revoked'
  | 'invalid-status-transition';

export interface AgentManagerError {
  readonly code: AgentManagerErrorCode;
  readonly message: string;
  readonly details?: unknown;
}

export type AgentManagerResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AgentManagerError };

export interface AgentCreateInput {
  readonly name: string;
  readonly type?: AgentType;
  readonly ownerId?: string;
}

export class AgentManager {
  private readonly ownerId?: string;
  private readonly agents = new Map<string, AgentIdentity>();
  private readonly repository?: AgentRepository;

  constructor(ownerId?: string, repository?: AgentRepository) {
    this.ownerId = ownerId;
    this.repository = repository;
  }

  getOwnerId(): string | undefined {
    return this.ownerId;
  }

  listAgents(): AgentIdentity[] {
    if (this.repository && this.ownerId) return this.repository.listAgents(this.ownerId);
    return [...this.agents.values()];
  }

  getAgent(agentId: string): AgentIdentity | undefined {
    if (this.repository && this.ownerId) return this.repository.getAgent(this.ownerId, agentId);
    return this.agents.get(agentId);
  }

  forUser(ownerId: string): AgentManager {
    return new AgentManager(ownerId, this.repository);
  }

  private validateName(name: string): AgentManagerResult<string> {
    const trimmed = name.trim();
    if (!trimmed) {
      return {
        ok: false,
        error: {
          code: 'invalid-name',
          message: 'Agent name is required.',
        },
      };
    }

    return { ok: true, value: trimmed };
  }

  private validateType(type: AgentType): AgentManagerResult<AgentType> {
    if (!AGENT_TYPES.includes(type)) {
      return {
        ok: false,
        error: {
          code: 'invalid-type',
          message: `Unsupported agent type: ${String(type)}`,
          details: { type },
        },
      };
    }

    return { ok: true, value: type };
  }

  private validateAuthorizationCommitment(commitment: string): AgentManagerResult<string> {
    const trimmed = commitment.trim();
    if (!trimmed) {
      return {
        ok: false,
        error: {
          code: 'invalid-authorization',
          message: 'Authorization requires a non-empty commitment.',
          details: { commitment },
        },
      };
    }

    return { ok: true, value: trimmed };
  }

  private assertAgentExists(agentId: string): AgentManagerResult<AgentIdentity> {
    const agent = this.getAgent(agentId);
    if (!agent) {
      return {
        ok: false,
        error: {
          code: 'agent-not-found',
          message: `Agent ${agentId} was not found.`,
          details: { agentId },
        },
      };
    }

    return { ok: true, value: agent };
  }

  create(input: AgentCreateInput): AgentManagerResult<AgentIdentity> {
    const nameResult = this.validateName(input.name);
    if (!nameResult.ok) {
      return nameResult;
    }

    const typeResult = input.type
      ? this.validateType(input.type)
      : { ok: true as const, value: 'custom' as const };
    if (!typeResult.ok) {
      return typeResult;
    }

    const identity = createAgentIdentity({
      name: nameResult.value,
      type: typeResult.value,
      status: 'inactive',
    });

    if (this.agents.has(identity.agentId)) {
      return {
        ok: false,
        error: {
          code: 'duplicate-agent-id',
          message: `Agent ID ${identity.agentId} already exists.`,
          details: { agentId: identity.agentId },
        },
      };
    }

    if (this.repository && this.ownerId) {
      this.repository.ensureUser(this.ownerId);
      this.repository.createAgent(this.ownerId, identity);
    } else {
      this.agents.set(identity.agentId, identity);
    }
    return { ok: true, value: identity };
  }

  authorizeAgent(agentId: string, commitment: string): AgentManagerResult<AgentIdentity> {
    const existing = this.assertAgentExists(agentId);
    if (!existing.ok) {
      return existing;
    }

    const commitmentResult = this.validateAuthorizationCommitment(commitment);
    if (!commitmentResult.ok) {
      return commitmentResult;
    }

    if (existing.value.status === 'revoked') {
      return {
        ok: false,
        error: {
          code: 'agent-revoked',
          message: `Agent ${agentId} is revoked and cannot be authorized.`,
          details: { agentId },
        },
      };
    }

    if (existing.value.authorization.status === 'authorized') {
      return {
        ok: false,
        error: {
          code: 'invalid-authorization',
          message: `Agent ${agentId} is already authorized.`,
          details: { agentId },
        },
      };
    }

    const next: AgentIdentity = {
      ...existing.value,
      authorization: {
        status: 'authorized',
        commitment: commitmentResult.value,
      },
    };

    this.persist(agentId, next);
    return { ok: true, value: next };
  }

  renameAgent(agentId: string, newName: string): AgentManagerResult<AgentIdentity> {
    const existing = this.assertAgentExists(agentId);
    if (!existing.ok) {
      return existing;
    }

    const nameResult = this.validateName(newName);
    if (!nameResult.ok) {
      return nameResult;
    }

    const next = {
      ...existing.value,
      name: nameResult.value,
    };

    this.persist(agentId, next);
    return { ok: true, value: next };
  }

  activateAgent(agentId: string): AgentManagerResult<AgentIdentity> {
    const existing = this.assertAgentExists(agentId);
    if (!existing.ok) {
      return existing;
    }

    if (existing.value.status === 'revoked') {
      return {
        ok: false,
        error: {
          code: 'agent-revoked',
          message: `Agent ${agentId} is revoked and cannot be reactivated.`,
          details: { agentId },
        },
      };
    }

    if (existing.value.status === 'active') {
      return {
        ok: false,
        error: {
          code: 'already-active',
          message: `Agent ${agentId} is already active.`,
          details: { agentId },
        },
      };
    }

    const updated: AgentIdentity = {
      ...existing.value,
      status: 'active',
    };

    this.persist(agentId, updated);
    return { ok: true, value: updated };
  }

  deactivateAgent(agentId: string): AgentManagerResult<AgentIdentity> {
    const existing = this.assertAgentExists(agentId);
    if (!existing.ok) {
      return existing;
    }

    if (existing.value.status === 'revoked') {
      return {
        ok: false,
        error: {
          code: 'agent-revoked',
          message: `Agent ${agentId} is revoked and cannot be deactivated.`,
          details: { agentId },
        },
      };
    }

    if (existing.value.status === 'inactive') {
      return {
        ok: false,
        error: {
          code: 'already-inactive',
          message: `Agent ${agentId} is already inactive.`,
          details: { agentId },
        },
      };
    }

    const updated: AgentIdentity = {
      ...existing.value,
      status: 'inactive',
    };

    this.persist(agentId, updated);
    return { ok: true, value: updated };
  }

  revokeAgent(agentId: string): AgentManagerResult<AgentIdentity> {
    const existing = this.assertAgentExists(agentId);
    if (!existing.ok) {
      return existing;
    }

    if (existing.value.status === 'revoked') {
      return {
        ok: false,
        error: {
          code: 'already-revoked',
          message: `Agent ${agentId} is already revoked.`,
          details: { agentId },
        },
      };
    }

    const updated: AgentIdentity = {
      ...existing.value,
      status: 'revoked',
    };

    this.persist(agentId, updated);
    return { ok: true, value: updated };
  }

  private persist(agentId: string, next: AgentIdentity): void {
    if (this.repository && this.ownerId) {
      this.repository.updateAgent(this.ownerId, { agentId, name: next.name, status: next.status, authorization: next.authorization });
    } else {
      this.agents.set(agentId, next);
    }
  }
}

export class AgentRegistry extends AgentManager {}

export function createAgentManager(ownerId?: string): AgentManager {
  return new AgentManager(ownerId);
}
