# Vouch

Vouch is a privacy-preserving authorization wallet for autonomous AI agents on
Midnight.

> The AI proposes an action. Vouch checks whether the action is authorized by
> the agent's spending policy. Midnight performs the final authorization check
> privately.

Vouch gives agents bounded authority without giving them wallet private keys.
The application manages agent configuration and policy metadata; Midnight is
the authoritative layer for protected authorization and policy enforcement.

## Core flow

```text
Agent proposal
    -> Vouch application policy validation
    -> Midnight authorization proof and circuit execution
    -> approved or rejected authorization transaction
```

A proposal is not a payment. The current Compact contract authorizes a spend
request but does not transfer or settle funds.

## Current capabilities

- Multiple agent identities and lifecycle states
- Agent authorization using a real Midnight circuit
- Spending policies with daily and per-transaction limits
- Allowed recipient and category restrictions
- Groq-backed built-in agent runtime with a provider-neutral runtime interface
- Custom-agent runtime architecture
- Browser wallet connection layer
- Persistent backend/API storage for users, agents, policies, and activity
- Real Midnight wallet/provider execution
- Deployed Vouch contract on Midnight Preview
- CLI flow for agent authorization and spend authorization

The Groq runtime is server-side only. `GROQ_API_KEY` and `GROQ_MODEL` are never
exposed to the frontend. Groq output is untrusted proposal input; the trusted
server attaches the agent identity and validates the proposal before any
Midnight execution.

## Midnight contract

The deployed `vouch-policy` contract exposes:

```text
authorizeAgent(agentCommitment)
requestSpend(amount, recipientCommitment, categoryCommitment)
```

The contract checks agent authorization, spending limits, and the configured
recipient/category commitments using private witness state. Its successful
authorization circuit is not a funds transfer.

## Preview deployment

| Field | Value |
| --- | --- |
| Network | Preview |
| Contract address | `5b2a8a8af8f6115b119913d469a8380c5f4fb40343d6d5d901123118aa30cab7` |

The deployment address is resolved from the repository's network state. Preview
execution requires the corresponding wallet, proof server, indexer, node, and
private-state configuration.

## Verified on Preview

The following flow was completed with real Midnight transactions:

- `authorizeAgent` succeeded on Preview.
- `requestSpend` succeeded with amount `1`, recipient `demo-vendor`, and
  category `developer-service`.
- An invalid category, `devloper-service`, was rejected by Midnight with
  `Category is not allowed`.

Successful transaction IDs:

```text
authorizeAgent: 007e4fbcb61a4d04b6b4710f1847804619bcd51ae920e0009818014fdfde050ec4
requestSpend:   00f89473a43c4b53721ab67d0ffdbaedd876cbbde8ba007dd2455950c69d8a7053
```

No private secrets, recovery phrases, private-state passwords, or wallet seed
material are documented here.

## Backend and API

The Fastify backend stores application data in SQLite at
`data/vouch.sqlite` by default. Set `VOUCH_DATABASE` to use another database
path. The database stores users, agents, lifecycle state, policies, and audit
activity. It does not store Midnight private state, wallet recovery phrases,
private keys, Groq API keys, or fabricated transaction state.

The browser authenticates with the installed Midnight DApp Connector. It
requests a one-time challenge, asks the wallet to sign it with its unshielded
key, and sends the signature and verifying key to the backend. The backend
verifies the BIP-340 signature with Midnight Ledger primitives and issues a
short-lived bearer session. Every agent, policy, activity, proposal, and
authorization lookup is scoped to the verifying key from that session; the
client cannot choose an identity header.

Important routes include:

```text
GET  /health
GET  /ready
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

POST /api/agents/:agentId/propose
POST /api/authorization/check
POST /api/authorization/execute
```

`/api/authorization/check` is application pre-validation only. The execution
route derives recipient/category commitments server-side from the canonical
validated values; clients and LLM output cannot supply independent commitment
bytes.

## Setup

### Requirements

- Node.js 22+
- Corepack
- Docker and Docker Compose for the local Midnight environment
- Linux, WSL, or another supported development environment

Install dependencies with pnpm:

```bash
corepack pnpm install
```

Compile the Compact contract:

```bash
corepack pnpm exec compact compile \
  contracts/vouch-policy.compact \
  contracts/managed/vouch-policy
```

Initialize the local development environment:

```bash
corepack pnpm setup
```

The local setup and execution paths use the real Midnight node, indexer, proof
server, wallet, and generated contract circuits. Preprod deployment is handled
separately through Midnight's recommended deployment tooling.

## Environment

The following values are supplied through the environment when running the
Vouch execution path:

```text
PRIVATE_STATE_PASSWORD
VOUCH_OWNER_SECRET
VOUCH_AGENT_SECRET
VOUCH_ALLOWED_RECIPIENT
VOUCH_ALLOWED_CATEGORY
VOUCH_DAILY_LIMIT
VOUCH_PER_TRANSACTION_LIMIT
GROQ_API_KEY
GROQ_MODEL
```

Do not commit secrets or print them in logs. The application canonicalizes the
configured recipient/category values and derives the 32-byte commitments used
by the existing Compact witness. The same canonical representation is used
when a spend request is executed.

## Running locally

Start the backend:

```bash
corepack pnpm server
```

Start the frontend in another terminal:

```bash
corepack pnpm frontend:dev
```

Run the Vouch operator CLI against the configured deployment:

```bash
corepack pnpm exec tsx src/cli.ts --network preview
```

The CLI:

1. Connects and synchronizes the configured wallet.
2. Displays the wallet's tNIGHT and DUST balances.
3. Connects to the deployed `vouch-policy` contract.
4. Submits `authorizeAgent` using the configured private witness.
5. Prompts for amount, recipient, and category and submits `requestSpend`.
6. Displays real Midnight transaction IDs or a clear failure.

The CLI does not print private secrets, recovery phrases, or private-state
passwords.

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
```

The Vouch E2E harness always runs the local authenticated API, ownership,
structured proposal, policy rejection, and commitment-rejection checks. It
does not fabricate a network result. To exercise a real running Preview-backed
API, set `VOUCH_E2E_LIVE=1`, `E2E_API_URL`, `VOUCH_E2E_SIGNING_KEY_HEX`,
`E2E_AMOUNT`, `E2E_RECIPIENT`, `E2E_CATEGORY`, and `E2E_REASON`; the live path
requires an existing authenticated agent and reports the real transaction ID.

## Architecture boundary

```text
Built-in or custom agent runtime
    -> trusted agent identity
    -> Vouch application policy validation
    -> Vouch execution service
    -> Midnight wallet/providers
    -> vouch-policy authorizeAgent/requestSpend circuits
```

Off-chain infrastructure manages users, agents, policies, proposals, and audit
records. Midnight protects the authorization state and performs the final
cryptographic policy check. The current contract does not settle or transfer
funds.

Custom agents are an adapter boundary for developer integrations. The product
does not claim to connect arbitrary third-party agents automatically: custom
agents remain unavailable in the HTTP runtime until a trusted
`CustomAgentAdapter` is registered by the application.

## Current status

The Preview MVP is deployed. The core authorization flow has been verified
with real Midnight transactions, including successful agent authorization,
successful policy-compliant spend authorization, and rejection of an invalid
category by the Midnight circuit.
