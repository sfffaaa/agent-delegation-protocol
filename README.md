# Agent Delegation Protocol

On-chain agent-to-agent permission delegation chain with DID identity integration.

## What is this?

A protocol that lets AI agents delegate sub-permissions to other agents in a chain. Each level can only **shrink** permissions (lower spending cap, subset of whitelisted contracts). Revoking any node invalidates the entire downstream chain.

## Key Features

- **Delegation Chain**: Agent A → Agent B → Agent C, permissions only shrink
- **Cascade Revocation**: Revoke A, and B+C become inactive automatically
- **DID Identity**: Use DID attributes to resolve agent identity, wallet-agnostic
- **Audit Trail**: All actions emit events for on-chain accountability
- **Access Control**: Only authorized proxies can record spending and emit events

## Architecture

```
PolicyRegistry  ← policy CRUD + delegation chain management
     ↓
AgentProxy      ← execution entry point, checks policy before forwarding calls
```

## Quick Start

```bash
npm install
npx hardhat compile
npx hardhat test
```

## Example Flow

```
Owner sets policy: Agent A can spend 10 ETH/hr on [DEX, Lending]
Agent A delegates to B: 3 ETH/hr on [DEX] only
Agent B delegates to C: 1 ETH/hr on [DEX] only

C calls AgentProxy.execute(DEX, 0.5 ETH, swapData)
→ PolicyRegistry checks C's policy ✓
→ PolicyRegistry walks chain: C→B→A, all active ✓
→ AgentProxy forwards call to DEX ✓
→ Emits ActionApproved event
```

## How is this different from RBAC / ERC-4337?

|  | Traditional RBAC | ERC-4337 Session Keys | Agent Delegation Protocol |
|--|------------------|-----------------------|---------------------------|
| Permission model | Static roles (admin/editor/viewer) — yes/no access | Per-account validation with spending limits | **Chained delegation** — each level can only shrink permissions (cap, whitelist, period) |
| Delegation | No native delegation between roles | No agent-to-agent delegation. Session keys are granted by the account owner only | **Multi-level**: A→B→C→D. Any agent with a policy can sub-delegate, permissions converge monotonically |
| Revocation | Remove role from user. No cascade | Revoke session key. No downstream impact | **Cascade**: revoke any node, the entire downstream chain becomes inactive automatically |
| Spending tracking | None — RBAC is boolean access control | Per-session-key spending limits, but no cross-key awareness | Per-agent spending cap with period reset. Each level tracks independently |
| Identity | Address or role ID | Bound to a single smart account | **DID-based** — resolve agent identity via DID, wallet-agnostic |
| Infrastructure | Application-level logic | Requires Bundler + EntryPoint + Paymaster ecosystem | Direct contract calls via AgentProxy. No extra infra needed |
| Best for | Human users with fixed roles | Single account with multiple session keys | **AI agent swarms** — autonomous agents that need to coordinate permissions across a hierarchy |

### The key insight

RBAC answers "can this role do X?" (boolean). ERC-4337 session keys answer "can this key spend up to Y?" (single level). This protocol answers **"how much trust flows through a chain of autonomous agents, and how do we revoke it cleanly?"** (multi-level, monotonically shrinking).

## Why DID?

Without DID, policies are bound to a wallet address. If an agent changes its wallet (redeployment, key rotation, switching from EOA to smart account), the policy breaks — the owner has to manually re-set it.

DID adds an abstraction layer that separates **identity** from **wallet**:

```
Agent identity (DID): 0xDDD  ← never changes, represents "who this agent is"
Agent wallet:         0xAAA  ← can change, represents "which address the agent uses now"
```

Think of DID as the agent's ID card, and the wallet as its bank card. The ID card stays the same; the bank card can be replaced.

The DID contract is a simple key-value store per account:

```
DID Account (0xDDD)
  ├── "wallet" → "0xAAA"
  ├── "name"   → "AgentA"
  └── "role"   → "trader"
```

When the owner sets a policy via DID, the contract resolves the wallet address automatically:

```
Owner: setPolicyByDID(didContract, 0xDDD, "wallet", 10 ETH, ...)

Contract internally:
  1. didContract.readAttribute(0xDDD, "wallet") → "0xAAA"
  2. parseAddress("0xAAA") → address 0xAAA
  3. Create policy for 0xAAA
```

The owner doesn't need to know the agent's wallet address — just its DID account and attribute name.

> **Note:** The current implementation resolves the address once at policy creation time. Dynamic resolution (re-checking DID on every transaction) is a future improvement.

## Test Scenarios

- **Scenario A**: Single agent policy — cap enforcement, whitelist, period reset
- **Scenario B**: Delegation chain — subset validation, cascade revocation, multi-level
- **Scenario C**: DID integration — resolve DID to agent address

## Security Features

- `recordSpend` and `emitActionApproved` restricted to authorized proxies only
- Delegation cannot overwrite existing active policies (prevents hostile takeover)
- Circular delegation prevented
- Chain depth capped at 10 levels
- Address parsing validates `0x` prefix and hex characters

## License

MIT
