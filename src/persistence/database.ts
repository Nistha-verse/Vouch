import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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
  findAuthorizedAgentByType(type: AgentIdentity['type']): { userId: string; agent: AgentIdentity } | undefined;
  claimContractAgentSlot(type: AgentIdentity['type'], userId: string, agentId: string): boolean;
  releaseContractAgentSlot(type: AgentIdentity['type'], userId: string, agentId: string): void;
  getAgent(userId: string, agentId: string): AgentIdentity | undefined;
  createAgent(userId: string, agent: AgentIdentity): void;
  createAgentCredential(userId: string, agent: AgentIdentity, secret: Uint8Array): void;
  getAgentSecret(userId: string, agentId: string): Uint8Array | undefined;
  setAgentCredentialHash(userId: string, agentId: string, credentialHash: string): boolean;
  findAgentByCredentialHash(credentialHash: string): { userId: string; agent: AgentIdentity } | undefined;
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
        created_at TEXT NOT NULL, authorization_json TEXT NOT NULL, secret_hex TEXT,
        api_credential_hash TEXT
      );
      CREATE INDEX IF NOT EXISTS agents_user_idx ON agents(user_id);
      CREATE TABLE IF NOT EXISTS contract_agent_slots (
        agent_type TEXT PRIMARY KEY, user_id TEXT NOT NULL, agent_id TEXT NOT NULL
      );
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
    const columns = this.db.prepare('PRAGMA table_info(agents)').all() as { name: string }[];
    if (!columns.some((column) => column.name === 'secret_hex')) {
      this.db.exec('ALTER TABLE agents ADD COLUMN secret_hex TEXT');
    }
    if (!columns.some((column) => column.name === 'api_credential_hash')) {
      this.db.exec('ALTER TABLE agents ADD COLUMN api_credential_hash TEXT');
    }
    const legacyAgents = this.db.prepare('SELECT agent_id FROM agents WHERE secret_hex IS NULL').all() as { agent_id: string }[];
    const updateSecret = this.db.prepare('UPDATE agents SET secret_hex = ? WHERE agent_id = ?');
    for (const agent of legacyAgents) updateSecret.run(randomBytes(32).toString('hex'), agent.agent_id);
  }

  ensureUser(userId: string): void {
    this.db.prepare('INSERT OR IGNORE INTO users (user_id, created_at) VALUES (?, ?)').run(userId, new Date().toISOString());
  }

  listAgents(userId: string): AgentIdentity[] {
    return (this.db.prepare('SELECT * FROM agents WHERE user_id = ? ORDER BY created_at').all(userId) as Record<string, unknown>[]).map(parseAgent);
  }

  findAuthorizedAgentByType(type: AgentIdentity['type']): { userId: string; agent: AgentIdentity } | undefined {
    const rows = this.db.prepare('SELECT * FROM agents WHERE type = ?').all(type) as Record<string, unknown>[];
    for (const row of rows) {
      const agent = parseAgent(row);
      if (agent.authorization.status === 'authorized') {
        return { userId: String(row.user_id), agent };
      }
    }
    return undefined;
  }

  claimContractAgentSlot(type: AgentIdentity['type'], userId: string, agentId: string): boolean {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const slot = this.db.prepare('SELECT user_id, agent_id FROM contract_agent_slots WHERE agent_type = ?').get(type) as { user_id: string; agent_id: string } | undefined;
      if (slot) {
        this.db.exec('COMMIT');
        return slot.user_id === userId && slot.agent_id === agentId;
      }
      const authorized = this.findAuthorizedAgentByType(type);
      if (authorized && (authorized.userId !== userId || authorized.agent.agentId !== agentId)) {
        this.db.exec('COMMIT');
        return false;
      }
      this.db.prepare('INSERT INTO contract_agent_slots (agent_type, user_id, agent_id) VALUES (?, ?, ?)').run(type, userId, agentId);
      this.db.exec('COMMIT');
      return true;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  releaseContractAgentSlot(type: AgentIdentity['type'], userId: string, agentId: string): void {
    this.db.prepare('DELETE FROM contract_agent_slots WHERE agent_type = ? AND user_id = ? AND agent_id = ?').run(type, userId, agentId);
  }

  getAgent(userId: string, agentId: string): AgentIdentity | undefined {
    const row = this.db.prepare('SELECT * FROM agents WHERE user_id = ? AND agent_id = ?').get(userId, agentId) as Record<string, unknown> | undefined;
    return row ? parseAgent(row) : undefined;
  }

  createAgent(userId: string, agent: AgentIdentity): void {
    this.createAgentCredential(userId, agent, randomBytes(32));
  }

  createAgentCredential(userId: string, agent: AgentIdentity, secret: Uint8Array): void {
    if (secret.length !== 32) throw new Error('Agent secret must be exactly 32 bytes.');
    this.ensureUser(userId);
    this.db.prepare('INSERT INTO agents (agent_id, user_id, name, type, status, created_at, authorization_json, secret_hex) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      agent.agentId, userId, agent.name, agent.type, agent.status, agent.createdAt, json(agent.authorization), Buffer.from(secret).toString('hex'),
    );
  }

  getAgentSecret(userId: string, agentId: string): Uint8Array | undefined {
    const row = this.db.prepare('SELECT secret_hex FROM agents WHERE user_id = ? AND agent_id = ?').get(userId, agentId) as { secret_hex?: string } | undefined;
    if (!row?.secret_hex) return undefined;
    return Uint8Array.from(Buffer.from(row.secret_hex, 'hex'));
  }

  setAgentCredentialHash(userId: string, agentId: string, credentialHash: string): boolean {
    const result = this.db.prepare(
      'UPDATE agents SET api_credential_hash = ? WHERE user_id = ? AND agent_id = ? AND type = ?',
    ).run(credentialHash, userId, agentId, 'custom');
    return result.changes === 1;
  }

  findAgentByCredentialHash(credentialHash: string): { userId: string; agent: AgentIdentity } | undefined {
    const row = this.db.prepare(
      'SELECT user_id, agent_id FROM agents WHERE api_credential_hash = ? AND type = ?',
    ).get(credentialHash, 'custom') as { user_id: string; agent_id: string } | undefined;
    if (!row) return undefined;
    const agent = this.getAgent(row.user_id, row.agent_id);
    return agent ? { userId: row.user_id, agent } : undefined;
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
    `).run(userId, agentId, policy.dailyLimit.toString(), policy.perTransactionLimit.toString(), null, null);
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
