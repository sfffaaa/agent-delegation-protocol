# Agent Delegation Protocol

On-chain agent-to-agent permission delegation chain with DID identity integration.

## What is this?

A protocol that lets AI agents delegate sub-permissions to other agents in a chain. Each level can only **shrink** permissions (lower spending cap, subset of whitelisted contracts). Revoking any node invalidates the entire downstream chain.

## Key Features

- **Delegation Chain**: Agent A → Agent B → Agent C, permissions only shrink
- **Cascade Revocation**: Revoke A, and B+C become inactive automatically
- **DID Identity**: Use peaq DID attributes instead of raw addresses
- **Audit Trail**: All actions emit events for on-chain accountability
- **Access Control**: Only authorized proxies can record spending and emit events

## Architecture

```
PolicyRegistry  ← policy CRUD + delegation chain management
     ↓
AgentProxy      ← execution entry point, checks policy before forwarding calls
     ↓
DID Mock        ← peaq DID precompile mock for identity resolution
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

## Test Scenarios

- **Scenario A**: Single agent policy — cap enforcement, whitelist, period reset
- **Scenario B**: Delegation chain — subset validation, cascade revocation, multi-level
- **Scenario C**: DID integration — resolve peaq DID to agent address

## Security Features

- `recordSpend` and `emitActionApproved` restricted to authorized proxies only
- Delegation cannot overwrite existing active policies (prevents hostile takeover)
- Circular delegation prevented
- Chain depth capped at 10 levels
- Address parsing validates `0x` prefix and hex characters

## License

MIT
