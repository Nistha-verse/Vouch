import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AgentIdentity } from '../agent-identity.js';
import type { AuthorizationPolicy } from '../authorization/types.js';

export interface ActivityRecord {
  readonly id: number;
  readonly userId: string;
  readonly agentId: string;
  readonly event: string;
  readonly transactionId?: string;
  readonly createdAt: string;
  readonly metadata?: Record<string, string>;
}

export interface AgentRepository {
  ensureUser(userId: string): void;
  listAgents(userId: string): AgentIdentity[];
  getAgent(userId: string, agentId: string): AgentIdentity | undefined;
  createAgent(userId: string, agent: AgentIdentity): void;
  updateAgent(userId: string, agent: IdentityUpdate & { agentId: string }): AgentIdentity | undefined;
  getPolicy(userId: string, agentId: string): { policy: AuthorizationPolicy; spentToday: bigint } | undefined;
  upsertPolicy(userId: string, agentId: string, policy: AuthorizationPolicy): void;
  recordSpend(userId: string, agentId: string, amount: bigint): void;
  addActivity(record: Omit<ActivityRecord, 'id' | 'createdAt'> & { createdAt?: string }): void;
  listActivity(userId: string, agentId: string): ActivityRecord[];
  close(): void;
}

export type IdentityUpdate = Partial<Pick<AgentIdentity, 'name' | 'status' | 'authorization'>>;

function json(value: unknown): string {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
}

function parseAgent(row: Record<string, unknown>): AgentIdentity {
  return {
    agentId: String(row.agent_id),
    name: String(row.name),
    type: row.type as AgentIdentity['type'],
    status: row.status as AgentIdentity['status'],
    createdAt: String(row.created_at),
    authorization: JSON.parse(String(row.authorization_json)) as AgentIdentity['authorization'],
  };
}

export class SqliteAgentRepository implements AgentRepository {
  readonly db: DatabaseSync;

  constructor(filename = process.env.VOUCH_DATABASE ?? resolve(process.cwd(), 'data/vouch.sqlite')) {
    if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS agents (
        agent_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(user_id),
        name TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
        created_at TEXT NOT NULL, authorization_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS agents_user_idx ON agents(user_id);
      CREATE TABLE IF NOT EXISTS policies (
        user_id TEXT NOT NULL, agent_id TEXT NOT NULL,
        daily_limit TEXT NOT NULL, per_transaction_limit TEXT NOT NULL,
        allowed_categories_json TEXT, allowed_recipients_json TEXT,
        spent_today TEXT NOT NULL DEFAULT '0',
        PRIMARY KEY (user_id, agent_id),
        FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
      );
      CREATE TABLE IF NOT EXISTS activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL,
        agent_id TEXT NOT NULL, event TEXT NOT NULL, transaction_id TEXT,
        created_at TEXT NOT NULL, metadata_json TEXT,
        FOREIGN KEY (agent_id) REFERENCES agents(agent_id)
      );
      CREATE INDEX IF NOT EXISTS activity_user_agent_idx ON activity(user_id, agent_id, id);
    `);
  }

  ensureUser(userId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO users (user_id, created_at) VALUES (?, ?)').run(userId, new Date().toISOString());
  }

  listAgents(userId: string): AgentIdentity[] {
    return (this.db.prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at').all(userId) as Record<string, unknown>[]).map(parseAgent);
  }

  getAgent(userId: string, agentId: string): AgentIdentity | undefined {
    const row = this.db.prepare('SELECT * FROM agents WHERE user_id = ? AND agent_id = ?').get(userId, agentId) as Record<string, unknown> | undefined;
    return row ? parseAgent(row) : undefined;
  }

  createAgent(userId: string, agent: AgentIdentity): void {
    this.ensureUser(userId);
    this.db.prepare('INSERT INTO agents (agent_id, user_id, name, type, status, created_at, authorization_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      agent.agentId, userId, agent.name, agent.type, agent.status, agent.createdAt, json(agent.authorization),
    );
  }

  updateAgent(userId: string, update: IdentityUpdate & { agentId: string }): AgentIdentity | undefined {
    const current = this.getAgent(userId, update.agentId);
    if (!current) return undefined;
    const next = { ...current, ...update, authorization: update.authorization ?? current.authorization };
    this.db.prepare('UPDATE agents SET name = ?, status = ?, authorization_json = ? WHERE user_id = ? AND agent_id = ?').run(
      next.name, next.status, json(next.authorization), userId, update.agentId,
    );
    return next;
  }

  getPolicy(userId: string, agentId: string) {
    const row = this.db.prepare('SELECT * FROM policies WHERE user_id = ? AND agent_id = ?').get(userId, agentId) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      spentToday: BigInt(String(row.spent_today)),
      policy: {
        dailyLimit: BigInt(String(row.daily_limit)),
        perTransactionLimit: BigInt(String(row.per_transaction_limit)),
        allowedCategories: row.allowed_categories_json ? JSON.parse(String(row.allowed_categories_json)) as string[] : undefined,
        allowedRecipients: row.allowed_recipients_json ? JSON.parse(String(row.allowed_recipients_json)) as string[] : undefined,
      },
    };
  }

  upsertPolicy(userId: string, agentId: string, policy: AuthorizationPolicy): void {
    this.db.prepare(`
      INSERT INTO policies (user_id, agent_id, daily_limit, per_transaction_limit, allowed_categories_json, allowed_recipients_json)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, agent_id) DO UPDATE SET
        daily_limit=excluded.daily_limit, per_transaction_limit=excluded.per_transaction_limit,
        allowed_categories_json=excluded.allowed_categories_json, allowed_recipients_json=excluded.allowed_recipients_json
    `).run(userId, agentId, policy.dailyLimit.toString(), policy.perTransactionLimit.toString(),
      policy.allowedCategories ? json(policy.allowedCategories) : null, policy.allowedRecipients ? json(policy.allowedRecipients) : null);
  }

  recordSpend(userId: string, agentId: string, amount: bigint): void {
    if (amount <= 0n) throw new Error('Spend amount must be positive.');
    const current = this.getPolicy(userId, agentId);
    if (!current) throw new Error('Unable to record spend against policy.');
    this.db.prepare('UPDATE policies SET spent_today = ? WHERE user_id = ? AND agent_id = ?').run(
      (current.spentToday + amount).toString(),
      userId,
      agentId,
    );
  }

  addActivity(record: Omit<ActivityRecord, 'id' | 'createdAt'> & { createdAt?: string }): void {
    this.db.prepare('INSERT INTO activity (user_id, agent_id, event, transaction_id, created_at, metadata_json) VALUES (?, ?, ?, ?, ?, ?)').run(
      record.userId, record.agentId, record.event, record.transactionId ?? null,
      record.createdAt ?? new Date().toISOString(), record.metadata ? json(record.metadata) : null,
    );
  }

  listActivity(userId: string, agentId: string): ActivityRecord[] {
    return (this.db.prepare('SELECT * FROM activity WHERE user_id = ? AND agent_id = ? ORDER BY id DESC').all(userId, agentId) as Record<string, unknown>[]).map((row) => ({
      id: Number(row.id), userId: String(row.user_id), agentId: String(row.agent_id), event: String(row.event),
      ...(row.transaction_id ? { transactionId: String(row.transaction_id) } : {}),
      createdAt: String(row.created_at),
      ...(row.metadata_json ? { metadata: JSON.parse(String(row.metadata_json)) as Record<string, string> } : {}),
    }));
  }

  close(): void { this.db.close(); }
}
