import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getDeployment, STATE_FILE_NAME, type DeploymentRecord } from '../src/network.js';

// Tests run in throwaway temp dirs via the `cwd` option so the developer's
// real .midnight-state.json (which holds wallet secrets) is never touched.
function makeStateDir(state: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'vouch-network-test-'));
  if (state !== null) writeFileSync(join(dir, STATE_FILE_NAME), `${JSON.stringify(state, null, 2)}\n`);
  return dir;
}

// Save/restore any pre-existing VOUCH_* env so cases stay hermetic.
const ENV_KEYS = ['VOUCH_CONTRACT_ADDRESS', 'VOUCH_DEPLOYMENT_TX', 'VOUCH_DEPLOYER', 'VOUCH_DEPLOYED_AT'] as const;
const savedEnv = new Map(ENV_KEYS.map((k) => [k, process.env[k]]));
function setEnv(values: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const k of ENV_KEYS) {
    const v = values[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function run(): void {
  const fileRecord: DeploymentRecord = {
    address: '0xfile-backed-address',
    transactionId: '0xfile-tx',
    deployedAt: '2026-01-01T00:00:00.000Z',
    deployer: '0xfile-deployer',
  };

  // 1. File-backed deployment wins, even when env fallback vars are also set.
  const fileDir = makeStateDir({
    version: 1,
    activeNetwork: 'preprod',
    wallets: {},
    deployments: { preprod: fileRecord },
  });
  try {
    setEnv({ VOUCH_CONTRACT_ADDRESS: '0xenv-address' });
    const dep = getDeployment('preprod', { cwd: fileDir });
    assert.ok(dep, 'file-backed deployment should resolve');
    assert.equal(dep.address, '0xfile-backed-address');
    assert.equal(dep.transactionId, '0xfile-tx');
    assert.equal(dep.deployer, '0xfile-deployer');
    assert.equal(dep.deployedAt, '2026-01-01T00:00:00.000Z');

    // Networks with no file-backed record still return null (env fallback is
    // Preprod-only).
    assert.equal(getDeployment('preview', { cwd: fileDir }), null);
  } finally {
    rmSync(fileDir, { recursive: true, force: true });
  }

  // 2. Env-backed deployment when the state file has no deployment for the
  //    network (Railway's situation: no state file at all).
  const emptyDir = makeStateDir(null);
  try {
    setEnv({
      VOUCH_CONTRACT_ADDRESS: ' 0xenv-contract-address ',
      VOUCH_DEPLOYMENT_TX: ' 0xenv-tx ',
      VOUCH_DEPLOYER: ' 0xenv-deployer ',
      VOUCH_DEPLOYED_AT: '2026-06-01T12:00:00.000Z',
    });
    const dep = getDeployment('preprod', { cwd: emptyDir });
    assert.ok(dep, 'env-backed deployment should resolve');
    assert.equal(dep.address, '0xenv-contract-address', 'address must be trimmed');
    assert.equal(dep.transactionId, '0xenv-tx');
    assert.equal(dep.deployer, '0xenv-deployer');
    assert.equal(dep.deployedAt, '2026-06-01T12:00:00.000Z');

    // Optional vars omitted → record still resolves with just the address.
    setEnv({ VOUCH_CONTRACT_ADDRESS: '0xenv-contract-address' });
    const minimal = getDeployment('preprod', { cwd: emptyDir });
    assert.ok(minimal, 'minimal env-backed deployment should resolve');
    assert.equal(minimal.address, '0xenv-contract-address');
    assert.equal(minimal.transactionId, undefined);
    assert.equal(typeof minimal.deployedAt, 'string');
    assert.notEqual(minimal.deployedAt, '');
    assert.equal(typeof minimal.deployer, 'string');
    assert.notEqual(minimal.deployer, '');
  } finally {
    rmSync(emptyDir, { recursive: true, force: true });
  }

  // 3. Missing (or blank) VOUCH_CONTRACT_ADDRESS returns no deployment rather
  //    than inventing one — never a placeholder address.
  const noEnvDir = makeStateDir(null);
  try {
    setEnv({});
    assert.equal(getDeployment('preprod', { cwd: noEnvDir }), null);

    setEnv({ VOUCH_CONTRACT_ADDRESS: '   ' });
    assert.equal(getDeployment('preprod', { cwd: noEnvDir }), null);

    setEnv({ VOUCH_CONTRACT_ADDRESS: '', VOUCH_DEPLOYMENT_TX: '0xlonely-tx' });
    assert.equal(getDeployment('preprod', { cwd: noEnvDir }), null);
  } finally {
    rmSync(noEnvDir, { recursive: true, force: true });
  }

  console.log('Deployment resolution tests passed (file-backed, env-backed, missing-contract)');
}

try {
  run();
} finally {
  setEnv(Object.fromEntries(ENV_KEYS.map((k) => [k, savedEnv.get(k)]).filter(([, v]) => v !== undefined)) as Partial<Record<(typeof ENV_KEYS)[number], string>>);
}
