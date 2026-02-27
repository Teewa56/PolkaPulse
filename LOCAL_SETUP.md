# PolkaPulse — Local Setup Guide

> Full stack: PVM Rust modules → Smart Contracts → Frontend  
> Target network: Asset Hub (testnet)

---

## Prerequisites

Install all of these before starting. Versions listed are minimum tested.

| Tool | Version | Install |
|------|---------|---------|
| Rust + Cargo | 1.78+ | `curl https://sh.rustup.rs -sSf \| sh` |
| Node.js | 20+ | [nodejs.org](https://nodejs.org) |
| pnpm or npm | 9+ | `npm i -g pnpm` |
| Foundry (forge + cast) | latest | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` |
| resolc (PVM Solidity compiler) | latest | `npm i -g @parity/revive` |
| Chopsticks (local fork) | latest | `npm i -g @acala-network/chopsticks` |
| Git | 2.40+ | system package manager |

Verify everything is installed:

```bash
rustc --version
node --version
forge --version
cast --version
resolc --version
chopsticks --version
```

---

## Repository Structure

```
polkapulse/
├── pvm-modules/          # Rust PVM precompiles
├── smart-contracts/      # Solidity contracts + tests
└── frontend/             # Next.js application
```

---

## Part 1 — PVM Rust Modules

### Step 1.1 — Compute Function Selectors

Before building Rust, you must replace all `SEL_*` placeholder constants with real 4-byte ABI selectors. Run these `cast sig` commands and note each output:

```bash
# Staking Precompile (0x0000000000000000000000000000000000000800)
cast sig "bond(uint128)"
cast sig "bondExtra(uint128)"
cast sig "unbond(uint128)"
cast sig "nominationPools_pendingRewards(uint32)"
cast sig "delegationDash_pendingRewards(address)"

# XCM Precompile (0x0000000000000000000000000000000000000808)
cast sig "xcmSend(bytes32,bytes)"
cast sig "xcmExecute(bytes,uint64)"

# Assets Precompile (0x0000000000000000000000000000000000000806)
cast sig "balanceOf(address,uint128)"
cast sig "transfer(uint128,address,uint256)"
```

### Step 1.2 — Paste Selectors into Rust Source

Open `pvm-modules/src/precompiles/yield_optimizer_precompile.rs` and replace each placeholder:

```rust
// BEFORE (placeholders)
const SEL_PENDING_REWARDS: [u8; 4] = [0x00, 0x00, 0x00, 0x01];
const SEL_XCM_SEND:        [u8; 4] = [0x00, 0x00, 0x00, 0x02];

// AFTER (real values from cast sig output)
// Example — yours will differ based on exact signatures
const SEL_PENDING_REWARDS: [u8; 4] = [0xf9, 0x40, 0xe3, 0x85];
const SEL_XCM_SEND:        [u8; 4] = [0xb6, 0x56, 0x08, 0x1e];
```

Do the same in `math_lib_precompile.rs` for any staking precompile calls it makes.

### Step 1.3 — Confirm Precompile Addresses

The custom precompile addresses (`0x1001`, `0x1002`) must be confirmed available on your target runtime. For Westend Asset Hub check the runtime source or ask in the Parity Discord `#asset-hub` channel. If different addresses are assigned, update these files:

- `pvm-modules/src/precompile_set.rs` — the address range registration
- `pvm-modules/src/abi.rs` — any self-referential address constants  
- `smart-contracts/contracts/AtomicYieldExecutor.sol` — `MATH_LIB_PRECOMPILE` and `YIELD_OPTIMIZER` constants
- `frontend/constants/index.ts` — `MATH_LIB_PRECOMPILE_ADDRESS` and `YIELD_OPTIMIZER_ADDRESS`

### Step 1.4 — Build and Test the Rust Modules

```bash
cd pvm-modules

# Run all 32 unit tests first
cargo test

# Build release binary
cargo build --release
```

Expected output:
```
running 32 tests
test math_lib::tests::... ok
...
test result: ok. 32 passed; 0 failed
```

### Step 1.5 — Register Precompiles in Runtime (Westend Asset Hub)

This step requires either:

**Option A — Local Chopsticks fork with state override (recommended for testing)**

Create `chopsticks.yml` in the project root:

```yaml
endpoint: wss://westend-asset-hub-rpc.polkadot.io
port: 8000
db: ./chopsticks-db
mock-signature-host: true
block: latest
```

Start the fork:

```bash
chopsticks --config chopsticks.yml
```

The fork runs at `ws://localhost:8000`. Your precompile Rust code does not need to be injected into the Chopsticks fork — the fork mirrors the live runtime. You can test contract-level behaviour against existing system precompiles (`0x0800`, `0x0808`) on the fork. For the custom precompiles (`0x1001`, `0x1002`) to actually execute on a fork, you would need a custom runtime build (see Option B).

**Option B — Custom runtime build (for full end-to-end testing)**

This is out of scope for a typical local dev setup. For full integration you would:
1. Clone the Westend Asset Hub runtime
2. Add your `PolkaPulsePrecompileSet` to the runtime's `PrecompileSet` config
3. Build a local node: `cargo build --release -p asset-hub-westend-runtime`
4. Run a local node with your custom runtime
5. Use that node's RPC endpoint throughout

For most development work, **Option A** (Chopsticks) is sufficient since contracts can be tested with mock precompile addresses.

---

## Part 2 — Smart Contracts

### Step 2.1 — Install Dependencies

```bash
cd smart-contracts
npm install
```

### Step 2.2 — Set Up Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```bash
# Your deployer private key (never commit this)
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# Westend Asset Hub RPC (HTTP for hardhat, WSS for polkadot.js)
ASSET_HUB_RPC=https://westend-asset-hub-eth-rpc.polkadot.io

# Governance signers (can be the same key for local testing)
SIGNER_1=0xADDRESS_1
SIGNER_2=0xADDRESS_2
SIGNER_3=0xADDRESS_3

# Stash account (your DOT staking stash, as 20-byte EVM address)
STASH_ACCOUNT=0xYOUR_STASH_EVM_ADDRESS

# Sovereign accounts of partner parachains (ask HydraDX/Interlay teams)
HYDRADX_SOVEREIGN=0xHYDRADX_SOVEREIGN_EVM_ADDRESS
INTERLAY_SOVEREIGN=0xINTERLAY_SOVEREIGN_EVM_ADDRESS

# Leave blank until deployed
POLKAPULSE_CORE_ADDRESS=
```

To get WND (Westend testnet tokens) for gas:
- Go to [faucet.polkadot.io](https://faucet.polkadot.io)
- Select Westend Asset Hub
- Paste your EVM address (the faucet accepts both SS58 and 0x formats)

### Step 2.3 — Compile Contracts

```bash
# Standard Hardhat compile (for local testing with hardhat network)
npx hardhat compile

# PVM compile via resolc (required for actual Asset Hub deployment)
resolc --target pvm contracts/**/*.sol -o artifacts-pvm/
```

> If `resolc` reports unsupported opcodes, check that `viaIR: true` is set in `hardhat.config.ts`. The PVM does not support all EVM opcodes — `viaIR` routes through Yul which resolc handles correctly.

### Step 2.4 — Run Unit Tests (Local Hardhat Network)

```bash
# Hardhat + TypeScript tests
npx hardhat test

# With gas report
REPORT_GAS=true npx hardhat test

# Foundry fuzz tests (10,000 runs)
forge test --fuzz-runs 10000 -v
```

All tests run against the local Hardhat EVM — no network connection needed. Expected output:
```
  PolkaPulseCore
    Initialization
      ✓ sets admin correctly
      ✓ sets protocolFeeBps to 200
      ...
  CoretimeArbitrage
    ...
  Governance
    ...

  47 passing (8s)

[fuzz] Ran 10000 tests for FuzzPolkaPulseCore
  [PASS] testFuzz_DepositIncreasesTotalDOT
  ...
```

### Step 2.5 — Run Local Fork Simulation

With Chopsticks running on port 8000 from Part 1:

```bash
# Point hardhat at local Chopsticks fork
npx hardhat run scripts/simulate-yield-loop.ts --network localhost
```

This simulates a full harvest → optimizer → XCM dispatch → rebase cycle and validates all invariants.

### Step 2.6 — Deploy to Westend Asset Hub Testnet

```bash
npx hardhat ignition deploy ./ignition/modules/PolkaPulse.ts --network assetHub
```

Watch the output — each contract address is printed as it deploys. The full deployment sequence takes 2-4 minutes depending on block time. When complete:

```
PolkaPulseMultisig:    0x...
PolkaPulseTimelock:    0x...
ppDOT:                 0x...
RewardMonitor:         0x...
AtomicYieldExecutor:   0x...
CoretimeArbitrage:     0x...
PolkaPulseCore (impl): 0x...
PolkaPulseProxy:       0x...
```

Alternatively use the manual deploy script for more verbose logging:

```bash
npx hardhat run scripts/deploy.ts --network assetHub
```

This also writes all addresses to `deployed-addresses.json` in the project root.

### Step 2.7 — Verify Deployment

Check the proxy implementation slot is set correctly:

```bash
cast call <PROXY_ADDRESS> "implementation()" --rpc-url https://westend-asset-hub-eth-rpc.polkadot.io
# Should return the PolkaPulseCore impl address
```

Check the exchange rate is live:

```bash
cast call <PROXY_ADDRESS> "exchangeRate()" --rpc-url https://westend-asset-hub-eth-rpc.polkadot.io
# Should return 1000000000000000000 (1e18 = 1:1 initial rate)
```

---

## Part 3 — Frontend

### Step 3.1 — Install Dependencies

```bash
cd frontend
npm install
```

### Step 3.2 — Set Up Environment

```bash
cp .env.example .env.local
```

Edit `.env.local` with the addresses from Step 2.6:

```bash
NEXT_PUBLIC_CHAIN_ID=420420421
NEXT_PUBLIC_ASSET_HUB_RPC=wss://westend-asset-hub-rpc.polkadot.io

NEXT_PUBLIC_POLKAPULSE_CORE_ADDRESS=0x<PROXY_ADDRESS>
NEXT_PUBLIC_PPDOT_TOKEN_ADDRESS=0x<PPDOT_ADDRESS>
NEXT_PUBLIC_CORETIME_ARBITRAGE_ADDRESS=0x<CORETIME_ADDRESS>
NEXT_PUBLIC_REWARD_MONITOR_ADDRESS=0x<REWARD_MONITOR_ADDRESS>

# Get a free project ID at cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### Step 3.3 — Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app connects to Westend Asset Hub via the configured RPC.

### Step 3.4 — Type Check

```bash
npm run typecheck
```

### Step 3.5 — Production Build

```bash
npm run build
npm run start
```

---

## Wallets for Testing

You need a wallet that supports the Asset Hub Westend EVM chain. The easiest options:

**MetaMask** — Add the network manually:
- Network Name: `Asset Hub Westend`
- RPC URL: `https://westend-asset-hub-eth-rpc.polkadot.io`
- Chain ID: `420420421`
- Currency Symbol: `WND`
- Block Explorer: `https://assethub-westend.subscan.io`

**Talisman** — Natively supports all Polkadot parachains including Asset Hub EVM. Recommended for the best experience.

**SubWallet** — Also supports Asset Hub EVM out of the box.

---

## Common Issues

**`resolc: unsupported opcode PUSH0`**  
The PVM does not support PUSH0 (EIP-3855). Add `--evm-version paris` to your resolc command or set `evmVersion: "paris"` in `hardhat.config.ts` under `settings`.

**`Error: nonce too low` on Asset Hub**  
Asset Hub Westend has a different nonce model than Ethereum mainnet. If a transaction gets stuck, wait 2-3 blocks and retry. Do not manually increment nonces.

**`HarvestNotReady` when calling `executeYieldLoop`**  
The `RewardMonitor` enforces a 1-hour cooldown between harvests. On the Chopsticks fork, advance time with `await ethers.provider.send("evm_increaseTime", [3600])` then `evm_mine`.

**Frontend shows `0x` as contract address**  
Your `.env.local` values are not being picked up. Confirm the file is named `.env.local` (not `.env`) and restart the dev server with `npm run dev`.

**`Cannot read properties of undefined (reading 'result')`**  
The contract addresses in `.env.local` are wrong or the contracts are not deployed to the configured chain ID. Cross-check with `deployed-addresses.json`.

---

## Full Startup Sequence (Quick Reference)

```bash
# Terminal 1 — Chopsticks fork
chopsticks --config chopsticks.yml

# Terminal 2 — Contracts
cd smart-contracts
npm install
npx hardhat compile
npx hardhat test
npx hardhat ignition deploy ./ignition/modules/PolkaPulse.ts --network assetHub
# copy addresses to frontend/.env.local

# Terminal 3 — Frontend
cd frontend
npm install
npm run dev
```