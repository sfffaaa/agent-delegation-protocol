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
