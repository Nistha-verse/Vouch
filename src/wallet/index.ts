import type {
  ConnectedAPI,
  InitialAPI,
  APIError,
} from '@midnight-ntwrk/dapp-connector-api';

export const VOUCH_TARGET_NETWORK_ID = 'preprod' as const;
export type MidnightNetworkId = 'preprod' | 'preview' | 'mainnet' | string;

export type WalletConnectionErrorCode =
  | 'no-wallets-detected'
  | 'wallet-not-available'
  | 'connection-rejected'
  | 'unsupported-wallet-api-version'
  | 'incompatible-network'
  | 'already-connected'
  | 'wallet-selection-required'
  | 'connection-failed';

export interface WalletConnectionError {
  code: WalletConnectionErrorCode;
  message: string;
  details?: unknown;
}

export type WalletConnectionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: WalletConnectionError };

export interface WalletDescriptor {
  readonly id: string;
  readonly rdns: string;
  readonly name: string;
  readonly icon?: string;
  readonly apiVersion: string;
  readonly provider: InitialAPI;
  readonly status: 'available' | 'connected' | 'disconnected';
}

export interface WalletConnection {
  readonly walletId: string;
  readonly walletName: string;
  readonly rdns: string;
  readonly apiVersion: string;
  readonly icon?: string;
  readonly status: 'connected' | 'disconnected';
  readonly networkId?: string;
  readonly api?: ConnectedAPI;
  readonly connectedAt?: string;
  connect(): Promise<WalletConnectionResult<WalletConnection>>;
  disconnect(): Promise<WalletConnectionResult<void>>;
}

export interface WalletDiscoveryState {
  wallets: WalletDescriptor[];
  selectedWalletId: string | null;
  connectedWalletId: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isInitialAPI(value: unknown): value is InitialAPI {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.rdns === 'string' &&
    typeof value.name === 'string' &&
    typeof value.icon === 'string' &&
    typeof value.apiVersion === 'string' &&
    typeof value.connect === 'function'
  );
}

function asWalletId(source: string | undefined, api: InitialAPI): string {
  return source && source.trim() ? source.trim() : `${api.rdns}:${api.apiVersion}`;
}

function reportConnectorError(message: string, error: unknown): WalletConnectionError {
  if (isRecord(error) && error.type === 'DAppConnectorAPIError' && typeof error.code === 'string') {
    const apiError = error as unknown as APIError;

    if (apiError.code === 'Rejected') {
      return {
        code: 'connection-rejected',
        message: message || 'The wallet connection request was rejected by the user.',
        details: apiError.reason,
      };
    }

    return {
      code: 'connection-failed',
      message: message || 'The wallet connector returned an error.',
      details: {
        apiCode: apiError.code,
        reason: apiError.reason,
      },
    };
  }

  if (error instanceof Error) {
    return {
      code: 'connection-failed',
      message: message || error.message,
      details: error.stack ?? error.message,
    };
  }

  return {
    code: 'connection-failed',
    message: message || 'Unknown wallet connector failure.',
    details: error,
  };
}

export function discoverWalletsFromRuntime(runtime: unknown): WalletConnectionResult<WalletDescriptor[]> {
  const maybeGlobal = isRecord(runtime) ? runtime : undefined;
  const wallets: WalletDescriptor[] = [];

  if (!maybeGlobal) {
    return {
      ok: false,
      error: {
        code: 'no-wallets-detected',
        message: 'No Midnight wallet runtime was found.',
      },
    };
  }

  const candidateMap = maybeGlobal.midnight;

  if (candidateMap === undefined) {
    return {
      ok: false,
      error: {
        code: 'no-wallets-detected',
        message: 'No Midnight wallet providers were detected.',
      },
    };
  }

  const candidateEntries: Array<[string, unknown]> = [];

  if (Array.isArray(candidateMap)) {
    candidateMap.forEach((value, index) => {
      candidateEntries.push([`wallet-${index}`, value]);
    });
  } else if (isRecord(candidateMap)) {
    Object.entries(candidateMap).forEach(([key, value]) => {
      candidateEntries.push([key, value]);
    });
  } else {
    candidateEntries.push(['default', candidateMap]);
  }

  for (const [walletId, value] of candidateEntries) {
    if (!isInitialAPI(value)) {
      continue;
    }

    const apiVersion = value.apiVersion ?? 'unknown';
    const sinon = apiVersion.split('.');
    const isSupported = sinon.length > 0 && sinon[0] !== '0';

    if (!isSupported) {
      wallets.push({
        id: asWalletId(walletId, value),
        rdns: value.rdns,
        name: value.name,
        icon: value.icon,
        apiVersion,
        provider: value,
        status: 'available',
      });
      continue;
    }

    wallets.push({
      id: asWalletId(walletId, value),
      rdns: value.rdns,
      name: value.name,
      icon: value.icon,
      apiVersion,
      provider: value,
      status: 'available',
    });
  }

  if (wallets.length === 0) {
    return {
      ok: false,
      error: {
        code: 'no-wallets-detected',
        message: 'No compatible Midnight wallet providers were detected.',
      },
    };
  }

  return { ok: true, value: wallets };
}

export function discoverWallets(): WalletConnectionResult<WalletDescriptor[]> {
  if (typeof globalThis === 'undefined') {
    return {
      ok: false,
      error: {
        code: 'no-wallets-detected',
        message: 'Wallet discovery is only available in a runtime exposing the Midnight connector API.',
      },
    };
  }

  const runtime = (globalThis as typeof globalThis & { midnight?: unknown }).midnight;
  return discoverWalletsFromRuntime(runtime ?? {});
}

export function isSupportedConnectorVersion(apiVersion: string): boolean {
  if (!apiVersion || apiVersion.trim() === '') {
    return false;
  }

  const [major] = apiVersion.split('.').map((part) => Number.parseInt(part, 10));
  return Number.isFinite(major) && major >= 4;
}

export class WalletConnectionManager {
  private readonly wallets = new Map<string, WalletDescriptor>();
  private selectedWalletId: string | null = null;
  private connectedWalletId: string | null = null;
  private connectedApi: ConnectedAPI | null = null;
  private connectedNetworkId: string | null = null;

  constructor(wallets?: WalletDescriptor[]) {
    if (wallets) {
      for (const wallet of wallets) {
        this.wallets.set(wallet.id, wallet);
      }
    }
  }

  getWallets(): WalletDescriptor[] {
    return [...this.wallets.values()];
  }

  listAvailableWallets(): WalletDescriptor[] {
    return this.getWallets();
  }

  getSelection(): string | null {
    return this.selectedWalletId;
  }

  getConnectedWallet(): WalletDescriptor | null {
    if (!this.connectedWalletId) {
      return null;
    }

    return this.wallets.get(this.connectedWalletId) ?? null;
  }

  getState(): WalletDiscoveryState {
    return {
      wallets: this.getWallets(),
      selectedWalletId: this.selectedWalletId,
      connectedWalletId: this.connectedWalletId,
    };
  }

  selectWallet(walletId: string): WalletConnectionResult<WalletDescriptor> {
    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return {
        ok: false,
        error: {
          code: 'wallet-not-available',
          message: `Wallet ${walletId} is not available.`,
          details: { walletId },
        },
      };
    }

    if (!isSupportedConnectorVersion(wallet.apiVersion)) {
      return {
        ok: false,
        error: {
          code: 'unsupported-wallet-api-version',
          message: `Wallet ${wallet.name} uses an unsupported connector API version (${wallet.apiVersion}).`,
          details: { walletId, apiVersion: wallet.apiVersion },
        },
      };
    }

    this.selectedWalletId = walletId;

    return { ok: true, value: wallet };
  }

  async connectSelectedWallet(): Promise<WalletConnectionResult<WalletConnection>> {
    if (!this.selectedWalletId) {
      return {
        ok: false,
        error: {
          code: 'wallet-selection-required',
          message: 'A wallet must be selected before connecting.',
        },
      };
    }

    return this.connectWallet(this.selectedWalletId);
  }

  async connectWallet(walletId: string): Promise<WalletConnectionResult<WalletConnection>> {
    if (this.connectedWalletId === walletId) {
      return {
        ok: false,
        error: {
          code: 'already-connected',
          message: `Wallet ${walletId} is already connected.`,
          details: { walletId },
        },
      };
    }

    const wallet = this.wallets.get(walletId);
    if (!wallet) {
      return {
        ok: false,
        error: {
          code: 'wallet-not-available',
          message: `Wallet ${walletId} is not available in the current runtime.`,
          details: { walletId },
        },
      };
    }

    if (!isSupportedConnectorVersion(wallet.apiVersion)) {
      return {
        ok: false,
        error: {
          code: 'unsupported-wallet-api-version',
          message: `Wallet ${wallet.name} uses an unsupported connector API version (${wallet.apiVersion}).`,
          details: { walletId, apiVersion: wallet.apiVersion },
        },
      };
    }

    try {
      const api = await wallet.provider.connect(VOUCH_TARGET_NETWORK_ID);
      const config = await api.getConfiguration();

      if (config.networkId !== VOUCH_TARGET_NETWORK_ID) {
        return {
          ok: false,
          error: {
            code: 'incompatible-network',
            message: `Wallet ${wallet.name} is connected to network ${config.networkId}, expected ${VOUCH_TARGET_NETWORK_ID}.`,
            details: {
              walletId,
              connectedNetwork: config.networkId,
              expectedNetwork: VOUCH_TARGET_NETWORK_ID,
            },
          },
        };
      }

      const connection: WalletConnection = {
        walletId: wallet.id,
        walletName: wallet.name,
        rdns: wallet.rdns,
        apiVersion: wallet.apiVersion,
        icon: wallet.icon,
        status: 'connected',
        networkId: config.networkId,
        api,
        connectedAt: new Date().toISOString(),
        connect: async () => this.connectWallet(wallet.id),
        disconnect: async () => this.disconnectWallet(),
      };

      this.selectedWalletId = wallet.id;
      this.connectedWalletId = wallet.id;
      this.connectedApi = api;
      this.connectedNetworkId = config.networkId;

      return { ok: true, value: connection };
    } catch (error) {
      const connectorError = reportConnectorError(`Wallet ${wallet.name} could not connect.`, error);
      return { ok: false, error: connectorError };
    }
  }

  async disconnectWallet(): Promise<WalletConnectionResult<void>> {
    if (!this.connectedWalletId) {
      return {
        ok: false,
        error: {
          code: 'wallet-not-available',
          message: 'No active wallet connection to disconnect.',
        },
      };
    }

    this.connectedWalletId = null;
    this.connectedApi = null;
    this.connectedNetworkId = null;

    return { ok: true, value: undefined };
  }

  static createFromRuntime(runtime: unknown): WalletConnectionResult<WalletConnectionManager> {
    const discovery = discoverWalletsFromRuntime(runtime);
    if (!discovery.ok) {
      return discovery as WalletConnectionResult<WalletConnectionManager>;
    }

    return {
      ok: true,
      value: new WalletConnectionManager(discovery.value),
    };
  }

  static create(): WalletConnectionResult<WalletConnectionManager> {
    const discovery = discoverWallets();
    if (!discovery.ok) {
      return discovery as WalletConnectionResult<WalletConnectionManager>;
    }

    return {
      ok: true,
      value: new WalletConnectionManager(discovery.value),
    };
  }
}

export function createWalletConnectionManager(
  runtime: unknown = globalThis,
): WalletConnectionResult<WalletConnectionManager> {
  return WalletConnectionManager.createFromRuntime(runtime);
}
