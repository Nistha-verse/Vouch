# Vouch

## Private AI Agent Wallet with Enforced Spending Rules on Midnight

> Give your AI the ability to act, not the ability to take.

Vouch is a privacy-preserving authorization wallet for autonomous AI agents.

Instead of giving an AI agent unrestricted access to a user's wallet, Vouch gives the agent a limited set of permissions. Spending rules are designed to be enforced through Midnight's privacy-preserving smart contract infrastructure.

The goal is simple:

An AI agent should be able to act on your behalf without being given unrestricted control of your money.

---

## The Problem

Autonomous AI agents are becoming capable of performing tasks independently, including:

- Purchasing API credits
- Paying for digital services
- Acquiring resources
- Completing tasks that require payments
- Interacting with other autonomous systems

Giving an autonomous agent direct access to a wallet creates a fundamental trust problem.

If an agent has unrestricted wallet access, the user has to trust it not to:

- Spend more than intended
- Send funds to unauthorized recipients
- Exceed a daily budget
- Continue spending after its permission expires

Traditional wallets primarily answer:

"Who controls the wallet?"

Vouch focuses on a different question:

"What is the agent allowed to do?"

---

## The Vouch Approach

Vouch separates wallet ownership from agent authority.

The user remains the owner of the wallet while an autonomous agent receives restricted spending authority.

For example:

User
  |
  | owns wallet
  v
Vouch
  |
  | grants limited permissions
  v
AI Agent
  |
  +-- Daily spending limit
  +-- Per-transaction limit
  +-- Allowed categories
  +-- Authorized recipients
  +-- Expiration

If the agent requests a valid payment, the authorization policy can allow it.

If the request violates the policy, it is rejected.

The agent never needs the user's wallet private key.

---

## Why Midnight?

Vouch is designed around Midnight's privacy-preserving architecture.

Financial information and authorization policies can contain sensitive information. Users should not necessarily have to expose their complete financial state simply to prove that an individual action is permitted.

Vouch therefore uses Midnight for the privacy-critical authorization layer:

- Private policy information
- Agent authorization
- Spending authorization
- Privacy-preserving state
- Proof-based authorization logic

The application infrastructure can manage agent configuration and application metadata, while Midnight provides the authorization layer.

### Core Principle

Off-chain infrastructure manages agents; Midnight enforces their authority.

---

## Agent Model

Vouch is designed so that users do not need to already have their own autonomous AI agent.

Users can create an agent from a predefined type and give that agent a custom name.

An agent is an instance of an agent type with its own permissions and authorization policy.

The same authorization mechanism can be used across different types of agents.

---

## Agent Types

### Developer Agent

Designed for development-related autonomous tasks.

### Research Agent

Designed for autonomous research and information-gathering tasks.

### Task Agent

Designed for general task-oriented autonomous workflows.

### Connect Custom Agent

Developers can connect an autonomous agent they have built themselves.

This is intended for developers who already have their own autonomous agent implementation rather than simply connecting a normal chat interface.

All agent types use the same underlying authorization concept.

---

## Spending Policies

A Vouch agent can be restricted by policies such as:

- Daily spending limit
- Per-transaction spending limit
- Allowed spending categories
- Whitelisted recipients
- Permission expiration

For example:

Agent Policy

Daily limit: $20
Per-transaction limit: $5
Category: API services
Recipients: Approved providers
Expiration: Configured by user

The important distinction is that these rules are intended to be enforced by the authorization layer rather than simply being UI restrictions.

---

## Example Flow

A simplified Vouch transaction flow looks like this:

1. User connects wallet
2. User creates an agent
3. User selects an agent type
4. User gives the agent a name
5. User defines a spending policy
6. Agent receives limited authority
7. Agent requests a payment
8. Vouch checks the authorization policy
9. The request is either allowed or rejected

The Compact contract is the authorization primitive for the request. It
verifies the agent secret against the stored commitment and checks the amount
against private policy witnesses, including the configured recipient and
category commitments. The current contract does not transfer funds, and its
private `spentToday` transition is local private state rather than a
globally-concurrent accounting ledger. A successful authorization circuit
must therefore not be described as a payment.

### Example

Suppose an agent has:

Daily limit: $20
Per-transaction limit: $5

The agent requests $4.

The request satisfies the configured limits and can be authorized.

Later, the agent requests $8.

The request exceeds the per-transaction limit and is rejected.

The user does not need to manually approve every individual action.

The policy defines the boundaries beforehand.


## REST API (local development)

This repository includes a Fastify-based HTTP server providing a boundary around the existing Vouch domain services. It is intended for local development and integrates with the project's existing AuthorizationService, AgentManager, runtimes, and VouchExecutionService.

Start the server:

- Install dependencies: corepack pnpm install
- Start: pnpm run server OR npm run server (the project includes a script alias when developing)
- Default address: http://127.0.0.1:3000

Endpoints

- GET /health
  - Returns: { "status": "ok", "service": "vouch-api" }

- GET /ready
  - Returns whether the application server is initialized. This is distinct from network/Midnight readiness.

Agents

- POST /api/agents
  - Create an agent
  - Body: { "name": "Srishti", "type": "developer" }
  - Returns 201 and the created agent object

- GET /api/agents
  - List agents

- GET /api/agents/:agentId
  - Get a specific agent

- POST /api/agents/:agentId/activate
  - Activate agent (uses AgentManager.activateAgent)

- POST /api/agents/:agentId/deactivate
  - Deactivate agent

- POST /api/agents/:agentId/revoke
  - Revoke agent

- POST /api/agents/:agentId/rename
  - Body: { "name": "New Name" }

Authorization

- POST /api/authorization/check
  - Application pre-validation using AuthorizationService.authorize
  - Spend amounts must be decimal integer strings (no decimals, exponents, or whitespace). Positive non-zero only.
  - Response distinguishes "allowed" (application pre-validation) from final Midnight authorization.

- POST /api/authorization/execute
  - Executes an allowed spend via VouchExecutionService -> Midnight
  - Requires recipientCommitment and categoryCommitment (64 hex chars each representing 32 bytes)
  - This endpoint performs pre-validation and then delegates to VouchExecutionService; it will return the confirmed execution result from that service when successful.

Runtime

- POST /api/agents/:agentId/propose
  - Runs the Groq-backed built-in runtime for the agent and returns a proposal (AgentIntent). This is a proposal only; it is not an authorization or transaction.

Notes

- Proposals (agent runtime outputs), pre-validation checks (AuthorizationService.authorize), and Midnight execution are distinct phases. A runtime proposal does not imply authorization; an "allowed" pre-validation is application-level UX feedback only and is not a transaction. Midnight remains authoritative for cryptographic authorization and final acceptance.



---

## Privacy Model

Vouch is being designed so that sensitive authorization information does not become ordinary public application data.

The intended model separates application data from privacy-critical authorization state.

### Application Data

Examples include:

- Agent name
- Agent type
- Agent status
- Application metadata

### Privacy-Critical Authorization State

Examples include:

- Spending policy
- Private spending state
- Agent authorization secrets
- Authorization information required to prove that a request satisfies the policy

The current implementation uses Midnight's private DApp/client-side state through witnesses rather than treating policy data as a public ledger field.

---

## Architecture

The current architecture is built around three major layers.

Vouch UI
|
+-- Agent creation
+-- Agent configuration
+-- Wallet connection
+-- Activity dashboard
|
v
Agent / Application Infrastructure
|
+-- Agent instances
+-- Agent runtime
+-- Application metadata
+-- Custom agent integration
|
v
Midnight Authorization Layer
|
+-- Agent authorization
+-- Spending policies
+-- Spend verification
+-- Private state
+-- Proof-based authorization

The application database is not intended to replace Midnight as the source of truth for protected authorization state.

The database can manage application-level information such as agent records, while privacy-critical authorization state remains part of the Midnight authorization layer.

---

## Current Implementation

Vouch is currently being developed as a Level 4 MVP for the Rise In "New Moon to Full: Monthly Moonshots on Midnight" program.

### Implemented

#### Spending Policy

The current Compact contract implements:

- Daily spending limits
- Per-transaction spending limits
- Private policy values supplied through a witness
- Spending-state advancement for successful requests
- Rejection of requests that violate configured limits

#### Agent Authorization

The current implementation also includes:

- Owner authorization
- Authorized agent commitment
- Private owner and agent secrets
- Agent authorization checks before spending
- Rejection of unauthorized agents

The current implementation has been locally compiled and simulated successfully.

#### Agent Runtime and Groq Proposal Layer

The built-in runtime has a provider-neutral `AgentRuntime` interface and a
server-side Groq implementation. `GROQ_API_KEY` is read only from the server
environment, and `GROQ_MODEL` optionally selects the model for the Groq
implementation. Neither value belongs in an agent identity or an intent.

Groq returns an untrusted proposed action. Vouch validates the structured
response and creates an `AgentIntent` with the trusted runtime `agentId`.
That intent remains a proposal and must still pass through Vouch's
authorization layer before any financial action can be considered.

---

## In Progress

The following parts are still being developed:

- Lace wallet connection
- Agent creation interface
- Agent naming
- Agent type selection
- Policy configuration UI
- Agent runtime
- Spend request interface
- Dashboard
- Transaction/activity display
- Rejected transaction explanations
- Preprod deployment
- Automated tests
- CI/CD

---

## Tech Stack

Vouch currently uses:

- Midnight Network
- Compact
- Midnight.js
- TypeScript
- Node.js
- pnpm
- Docker
- WSL
- GitHub

The project uses Midnight's local development environment for contract compilation, proof generation, and local testing during development.

---

## Getting Started

### Requirements

Make sure you have:

- Node.js 22+
- pnpm
- Docker
- Docker Compose
- WSL/Linux environment

Vouch currently uses Node.js 22.14.0.

### Clone the Repository

git clone https://github.com/Nistha-verse/Vouch.git
cd Vouch

### Use the Project Node Version

nvm use

If necessary:

nvm install
nvm use

### Install Dependencies

pnpm install

### Compile the Compact Contract

pnpm run compile

### Start the Local Environment

pnpm run setup

This initializes the local Midnight development environment and prepares the application for local interaction.

Set the Vouch private-state configuration before deployment or execution. These
values must be supplied through the environment and are never printed by the
Vouch scripts:

```bash
export PRIVATE_STATE_PASSWORD='use-at-least-16-characters'
export VOUCH_OWNER_SECRET='64-hex-characters'
export VOUCH_AGENT_SECRET='64-hex-characters'
export VOUCH_ALLOWED_RECIPIENT_COMMITMENT='64-hex-characters'
export VOUCH_ALLOWED_CATEGORY_COMMITMENT='64-hex-characters'
```

`pnpm run setup` deploys the Vouch Compact contract. After deployment,
`pnpm run execution:demo` invokes the generated Vouch circuits through the real
Midnight.js wallet, proof server, node, and indexer providers. It reports
success only after Midnight finalizes the authorization transaction. This is
authorization only, not payment settlement. The current private `spentToday`
state remains client-private and is not globally concurrency-safe.

### Run the real authorization execution demo

pnpm run execution:demo

---

## Project Structure

vouch/
|
+-- contracts/
|   +-- vouch-policy.compact
|   +-- managed/
|
+-- src/
|   +-- vouch-policy.ts
|   +-- vouch-policy-witnesses.ts
|
+-- scripts/
|
+-- package.json
+-- pnpm-lock.yaml
+-- tsconfig.json
+-- README.md

---

## Development Roadmap

Vouch is being developed incrementally.

### Phase 1 — Core Authorization

- [x] Initialize Midnight project
- [x] Implement spending policy
- [x] Implement agent authorization
- [x] Compile and locally simulate authorization logic

### Phase 2 — User Experience

- [ ] Connect Lace wallet
- [ ] Create agent
- [ ] Choose agent type
- [ ] Name agent
- [ ] Configure spending policy
- [ ] Activate agent

### Phase 3 — Autonomous Agent

- [x] Built-in agent runtime with deterministic and Groq-backed proposal implementations
- [ ] Spend request interface
- [ ] Policy verification flow
- [ ] Allow/reject results
- [ ] Custom Agent interface

### Phase 4 — Dashboard

- [ ] Agent dashboard
- [ ] Private activity view
- [ ] Transaction/request history
- [ ] Rejected request explanations

### Phase 5 — Level 4 Delivery

- [ ] Preprod deployment
- [ ] Automated tests
- [ ] CI/CD pipeline
- [ ] Complete documentation
- [ ] Public demo
- [ ] Demo video
- [ ] Product X profile

---

## Future Direction

The initial MVP focuses on demonstrating the authorization primitive.

Future versions can explore:

- Multiple simultaneous agents
- More granular spending categories
- Recipient allowlists
- Time-based permissions
- Agent-specific budgets
- Selective transaction disclosure
- Auditor and tax-tool integrations
- More advanced autonomous agents
- Custom agent integrations

The long-term goal is to make autonomous agents capable of interacting with financial systems while keeping user control and privacy at the center.

---

## Built for Midnight

Vouch is being developed as part of the Rise In "New Moon to Full: Monthly Moonshots on Midnight" program.

The project is currently targeting the Level 4 MVP stage and is being developed publicly.

---

## Level 4 Goals

The Level 4 MVP is being developed toward the following goals:

- Working MVP on Midnight Preprod
- Public GitHub repository
- Documentation
- CI/CD pipeline
- Public product profile
- Demo video
- Continued public development

---

## License

License information will be added as the project progresses.