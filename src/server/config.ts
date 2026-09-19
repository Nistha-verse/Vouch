export interface ServerConfig {
  host: string;
  port: number;
  nodeEnv: string;
}

function parsePort(v: unknown): number {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isInteger(n)) return n;
  }
  throw new Error('PORT must be an integer');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const host = (env.HOST || '127.0.0.1').trim();
  const nodeEnv = (env.NODE_ENV || 'development').trim();
  const port = parsePort(env.PORT ?? '3000');
  if (port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port (1-65535)');

  return { host, port, nodeEnv };
}
