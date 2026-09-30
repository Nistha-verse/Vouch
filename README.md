# Vouch

You don't give your AI your wallet. You give it permission.

Vouch is an agent-permission application on Midnight: an AI agent proposes an
action, Vouch checks whether that action is authorized for that agent, and a
ZK-verified Compact contract on Midnight performs the final cryptographic
authorization and spending-policy check. The user keeps sole control of the
wallet and its funds at all times.

> The agent proposes. Vouch decides. Midnight verifies.

A proposal is not a payment. The current Compact contract authorizes a spend
request and verifies policy on-chain; it does not itself transfer or settle
funds.

## Architecture

```text
Agent
  ↓
Vouch Agent Identity (private per-agent secret → commitment)
  ↓
Vouch Authority / Spending Policy (per-transaction + daily limits)
  ↓
Midnight Preprod (ZK-verified authorizeAgent / requestSpend circuits)
```

Transactions use a strict browser-wallet split. The backend never synchronizes,
holds, or submits the user's wallet:

```text
Connected user wallet (Lace / Midnight DApp connector)
        ↓
Vouch backend builds + proves the unbound transaction
        ↓
Unbound transaction returned to the browser
        ↓
USER WALLET balances, signs, and submits it
        ↓
Midnight Preprod
        ↓
Real transaction ID
        ↓
Backend watches the indexer and confirms; application state is persisted
```

The backend builds and proves transactions from server-held private witness
secrets, addressed to the connected wallet's public keys. The connected wallet
balances, signs, and submits every transaction and pays the fees. The backend
then watches the Preprod indexer for the submitted transaction ID and records
the outcome. The backend never sees the user's seed, private keys, or spending
authority, and the HTTP server starts immediately without any wallet
synchronization. If no wallet is connected, the UI simply says: "Connect your
Midnight wallet to continue."

## Privacy model

What is private:

* The owner secret and per-agent secrets are private witnesses; only their
  persistent-hash commitments appear on the ledger.
* Spending policy values (daily limit, per-transaction limit, spentToday) are
  supplied by the application witness to the circuits, not stored publicly.
* Recipient and category are provided as plain validated strings to the
  backend, which hashes them into commitments as transaction inputs; the
  contract treats them as opaque commitment bytes.

What is verified:

* That the transaction was authorized by the contract owner (via the owner
  commitment witness).
* That the spending agent's commitment was previously authorized on-chain.
* That the spend amount is positive and within both the per-transaction and
  daily policy limits, enforced by ZK-checked circuit asserts.

This privacy model is the one actually implemented: agent authorization state
and policy enforcement are verified by the Compact circuits; the application
database (users, agents, policies, activity) is stored off-chain in SQLite.
The policy values themselves are application witnesses rather than on-chain
public state, and the recipient/category commitments are constructed from
values the backend already sees, so they add no restriction beyond what the
application validates. The off-chain application database is not encrypted
beyond the OS filesystem permissions.

## The Midnight contract

`contracts/vouch-policy.compact` exposes, per agent type (Task, Research,
Developer, Custom):

```text
authorize<Task|Research|Developer|Custom>Agent(agentCommitment)
request<Task|Research|Developer|Custom>Spend(amount, recipientCommitment, categoryCommitment)
```

The contract checks:

* Only the owner can authorize an agent (owner commitment witness).
* An agent's commitment must be authorized before any spend request.
* Spend amounts are positive and within the witnessed per-transaction and
  daily limits.

Recipient and category commitments remain transaction inputs for spend
semantics, but they are **not authorization restrictions**. Vouch does not
decide which recipient or category a user is allowed to use; the user decides
what an authorized agent should do, while Vouch enforces wallet-safety limits.
The `VOUCH_ALLOWED_CATEGORY` / recipient-allowlist behaviors are intentionally
not supported.

Each agent type has one independent authorization circuit and one slot.
Authorizing one agent never requires authorizing any other agent. The deployed
contract has one shared ledger commitment slot per agent type, so it cannot
hold multiple simultaneous agents of the same type; the API reserves each type
slot and rejects a second authorization rather than silently replacing the
first identity.

## Preprod deployment

| Field                  | Value                                                                |
| ---------------------- | -------------------------------------------------------------------- |
| Network                | Midnight Preprod                                                     |
| Contract address       | `c514871ed020c1de791316d8956a0131d7fa1d6f57fda365ca294e915f2bdad3`   |
| Deployment transaction | `0098b882e3fe3940bbd10c097846457248c0e1171118813b6966863962fdecd30a` |
| Deployed at            | 2026-09-28T20:31:40Z                                                 |

The deployment address is resolved at runtime from `.midnight-state.json`
(see `getDeployment` in `src/network.ts`); it is not hardcoded in the browser
or backend. The frontend reads the same shared state via `GET /api/network`.
An earlier Preprod deployment (`8f3fa07c…`, owner secret since lost) is no
longer active anywhere; the deployment above is the single active Preprod
deployment.

Preprod uses:

* RPC: `https://rpc.preprod.midnight.network`
* GraphQL indexer: `https://indexer.preprod.midnight.network/api/v4/graphql`
* Faucet: `https://midnight-tmnight-preprod.nethermind.dev/`
* Local proof server: `http://127.0.0.1:6300`

## Verified on Preprod

All of the following were executed live against the deployment above, using
the browser-wallet split (backend-built unbound transactions balanced, signed,
and submitted by the wallet, then confirmed via the indexer):

```text
Contract deployment:
0098b882e3fe3940bbd10c097846457248c0e1171118813b6966863962fdecd30a

authorizeAgent — Task agent:
0062e05125b6fd6f2a3ec78afc94910423a16439fa99daa539d0ca3ba790d88fc8
(authorizeTaskAgent circuit; confirmed on the indexer)

authorizeAgent — Research agent:
00863cd4c35bc8f13fc5c0b9f9fe9b6e2d9e41740295442838c08a8de610c6a569
(authorizeResearchAgent circuit; independent of the task agent)

Valid requestSpend — task agent, amount 1:
authorize leg:  00434f2ac61c37443c63ab1f1af70671dcc1a9207459ee132c4ca451589a6feeee
requestSpend:   00a58bf2c52f8ab7e149415a4ae6d12b0e51561f8d1e10e91aa6da6010c710db5e
(requestTaskSpend circuit; policy verified on-chain, no funds transferred)

Invalid request — amount 100 over the 25 per-transaction limit:
Application pre-validation rejects it with HTTP 403 per-transaction-limit
before any transaction is built.

The same over-limit request, submitted past application pre-validation in a
direct circuit probe, is rejected by Midnight itself during proving:
"failed assert: Amount exceeds per-transaction limit" (requestTaskSpend).
```

After the confirmed authorizations, the on-chain ledger state read back from
the Preprod indexer contains exactly: the owner commitment matching the
configured owner secret, the task and research agent commitments matching the
authorized agents' secrets, and unset developer/custom slots.

No private secrets, recovery phrases, private-state passwords, or wallet seed
material are documented here.

## Backend and API

The Fastify backend stores application data in SQLite at:

```text
data/vouch.sqlite
```

Set `VOUCH_DATABASE` to use another database path.

The database stores users, agents, agent lifecycle state, policies, and audit
activity. It does not store Midnight private state, wallet recovery phrases,
private keys, or API keys. Custom Agent API credentials are stored as hashes;
the raw credential is returned only when issued and should be saved by the
agent operator.

The browser authenticates with the installed Midnight DApp Connector: it
requests a one-time challenge, asks the wallet to sign it with its unshielded
key, and sends the signature and verifying key to the backend, which verifies
the BIP-340 signature with Midnight Ledger primitives and issues a short-lived
bearer session. This proves control of the signing key for app authentication
only. Every agent, policy, activity, proposal, and authorization lookup is
scoped to the verifying key from that session; the client cannot choose an
identity header.

Important routes include:

```text
GET  /health
GET  /ready
GET  /api/network

POST /api/auth/challenge
POST /api/auth/verify

POST /api/agents
GET  /api/agents
GET  /api/agents/:agentId

POST /api/agents/:agentId/activate
POST /api/agents/:agentId/deactivate
POST /api/agents/:agentId/revoke
POST /api/agents/:agentId/rename

GET  /api/agents/:agentId/policy
PUT  /api/agents/:agentId/policy
GET  /api/agents/:agentId/activity

POST /api/agents/:agentId/authorize          (returns an unbound transaction)
POST /api/agents/:agentId/authorize/confirm  (wallet-submitted tx ID)

POST /api/agents/:agentId/propose
POST /api/agents/:agentId/credential
POST /api/custom-agent/connect
POST /api/custom-agent/propose

POST /api/authorization/check
POST /api/authorization/execute              (returns an unbound transaction)
POST /api/authorization/execute/confirm      (wallet-submitted tx ID)
```

`GET /api/network` reports the active network, the active deployment
(address, deployer, deployment transaction), and whether the Midnight
transaction service is ready. The frontend uses this to display the active
contract and never hardcodes the address.

`/api/authorization/check` is application pre-validation only; Midnight
remains authoritative for final transaction acceptance.

The authorization flow is the browser-wallet split:

1. `POST /api/agents/:agentId/authorize` builds and proves the
   `authorize*Agent` unbound transaction server-side and returns it.
2. The connected wallet balances (`balanceUnsealedTransaction`), signs, and
   submits it, and the frontend reports the derived transaction ID to
   `POST /api/agents/:agentId/authorize/confirm`.
3. The backend watches the Preprod indexer for that transaction, checks its
   execution status, persists the Compact private state, and updates the
   agent's authorization status.

The spend flow keeps its two-transaction shape: `POST
/api/authorization/execute` returns the authorize-leg unbound transaction;
after the wallet submits it and it confirms, `POST
/api/authorization/execute/confirm` returns the `request*Spend` unbound
transaction for a second wallet approval, then confirms against the indexer
and records the spend. Recipient and category commitments are derived
server-side from the canonical validated values; clients and LLM output
cannot supply independent commitment bytes.

Custom Agents authenticate with their issued credential at
`/api/custom-agent/connect`, then submit proposals with the short-lived
`Vouch-Agent` session token. They receive no user-wallet keys. The API starts
immediately; the Midnight transaction service attaches asynchronously and
`/api/network` reports it as `ready` when available. No backend wallet
synchronization is ever required to use the UI, because transactions are
balanced and submitted by the connected user wallet.

## Setup

### Requirements

* Node.js 22+
* Corepack
* Docker and Docker Compose (for the local proof server)
* A wallet funded via the Preprod faucet for deployment tooling

Install dependencies:

```bash
corepack pnpm install
```

Compile the Compact contract:

```bash
corepack pnpm exec compact compile \
  contracts/vouch-policy.compact \
  contracts/managed/vouch-policy
```

Start the local proof server:

```bash
corepack pnpm proof-server:start
```

## Environment

Secrets are supplied through the environment (this repository keeps them in
`.env.midnight`, which is gitignored; source it before running deployment
tooling). None of the values are ever printed or committed:

```text
VOUCH_NETWORK=preprod

PRIVATE_STATE_PASSWORD          # ≥16 chars; encrypts the Level private-state store

VOUCH_OWNER_SECRET              # 64 hex chars; contract owner witness

VOUCH_AGENT_SECRET_0            # 64 hex chars; task agent witness
VOUCH_AGENT_SECRET_1            # research agent witness
VOUCH_AGENT_SECRET_2            # developer agent witness
VOUCH_AGENT_SECRET_3            # custom agent witness
VOUCH_AGENT_SECRET              # legacy alias for slot 0

VOUCH_DAILY_LIMIT               # default 100
VOUCH_PER_TRANSACTION_LIMIT     # default 25
```

The owner and agent secrets are private witness material used by the deployed
Vouch policy. They must never be exposed to the frontend or committed to the
repository. Recipient and category commitments are derived from each spend
request and are transaction inputs, not allowlists.

## Running

Start the backend:

```bash
VOUCH_NETWORK=preprod corepack pnpm server
```

The server binds `http://127.0.0.1:3000` by default and starts immediately;
it does not wait for any wallet synchronization.

Start the frontend in another terminal:

```bash
corepack pnpm frontend:dev
```

Open the app, connect your Midnight wallet (Lace or any DApp-connector
wallet), and authenticate. Authorization and spend transactions then appear
as approvals in your wallet; the resulting transaction IDs are shown in the
UI and recorded in the activity log.

Deployment tooling (deploys `contracts/vouch-policy.compact` with the
configured owner secret and records the result in `.midnight-state.json`):

```bash
set -a; . ./.env.midnight; set +a
VOUCH_NETWORK=preprod corepack pnpm run deploy
```

The operator CLI connects a server-held wallet, shows balances, and can
submit `authorizeTaskAgent` and `requestTaskSpend` directly from the
terminal, printing real Midnight transaction IDs:

```bash
set -a; . ./.env.midnight; set +a
VOUCH_NETWORK=preprod corepack pnpm exec tsx src/cli.ts
```

The CLI is an operator tool for the infrastructure wallet, not the user
product flow; the product flow is the browser-wallet split described above.

## Agent setup

Vouch supports four agent types, each with its own authorization circuit and
slot:

* **Task Agent** — focused, repeatable work with clear intent.
* **Research Agent** — finding, comparing, and distilling information.
* **Developer Agent** — building, testing, and maintaining systems.
* **Custom Agent** — an autonomous agent you built yourself, connected via an
  issued API credential.

Create agents in the app (or `POST /api/agents`), activate them, set their
spending-safety policy, then authorize each agent from the UI with your
connected wallet. Each agent type authorizes independently; authorizing one
agent does not require or affect any other. A Custom Agent additionally gets
a one-time credential for `/api/custom-agent/connect` and proposes through
`/api/custom-agent/propose` with its scoped token.

## Testing and validation

```bash
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test
corepack pnpm test:api
corepack pnpm test:e2e
corepack pnpm exec compact compile \
  contracts/vouch-policy.compact \
  contracts/managed/vouch-policy
git diff --check
```

The E2E harness runs the local authenticated API, ownership, structured
proposal, policy rejection, and commitment checks against the real route
handlers. It does not fabricate network results. The live Preprod flows
documented in "Verified on Preprod" above were executed with the real
browser-wallet split against the real deployment.

## Limitations

* `requestSpend()` verifies and authorizes policy on-chain but does **not**
  transfer or settle funds. There is no transfer circuit in the current
  contract; a real payment leg would be a separate contract feature.
* The deployed contract has one agent slot per type; multiple simultaneous
  agents of the same type require a different deployment.
* The owner commitment is fixed at deployment; contract ownership cannot be
  transferred to an end-user wallet after the fact.
* Policy accounting (`spentToday`) is witnessed application state; the
  application repository remains the authoritative accounting record, and
  concurrent spend checks are not reservations.
* Spend transactions are balanced and paid for by the connected user wallet;
  the stand-in used for automated verification was the deployment wallet
  exercising the same connector API surface.
* This is a **Preprod** deployment, not production. Preprod tokens (tNIGHT)
  have no value.

## Current status

Vouch is deployed on Midnight Preprod with a real `vouch-policy` contract
(address and transaction IDs above), with real agent authorizations, a real
policy-compliant `requestSpend`, and real policy rejections verified against
that deployment. The backend resolves the deployment from shared state, the
frontend reads it from `/api/network`, and no contract address is hardcoded
in either.

Product X profile: **[TODO: add the official Product X profile link]**

Live demo: **[TODO: add the live demo link]**
