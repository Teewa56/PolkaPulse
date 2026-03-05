### 1. Prerequisites

**Install tools:**

- **Node.js**: v18+  
- **Package manager**: `npm` or `pnpm`  
- **Rust toolchain**: `rustup` + `cargo`  
- **Chopsticks**: for Polkadot/Asset Hub fork simulation  
  ```bash
  npm install -g @acala-network/chopsticks
  ```
- **Git** and a modern browser/Metamask (or any EVM wallet) for the frontend.

---

### 2. Environment setup

#### 2.1. Smart contracts (`smart-contracts/`)

1. Go to the contracts folder and install deps:

   ```bash
   cd smart-contracts
   npm install
   ```

2. Create `.env` from the example:

   ```bash
   cp .env.example .env
   ```

3. Fill in at least:

   - `PRIVATE_KEY=` – dev wallet key for deployments (funded in the local fork).
   - `ASSET_HUB_RPC=` – RPC URL of your local Chopsticks fork, e.g. `http://127.0.0.1:8545`.
   - `HYDRAX_RPC=`, `INTERLAY_RPC=` – if you have local endpoints or want to mock; for basic unit tests these may be unused.
   - `PVM_MODULE_ADDRESS=` – address of the PVM module precompile (can be a placeholder for pure Hardhat tests; needed when you actually wire PVM calls).

#### 2.2. Frontend (`frontend/`)

1. Install deps:

   ```bash
   cd frontend
   npm install
   ```

2. Create `.env.local` from the example:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in:

   - `NEXT_PUBLIC_CHAIN_ID=` – chain ID you use in Hardhat/Chopsticks (e.g. `31337` or the custom one).
   - `NEXT_PUBLIC_ASSET_HUB_RPC=` – same RPC as in `ASSET_HUB_RPC`.
   - Contract addresses from your deployment:
     - `NEXT_PUBLIC_POLKAPULSE_CORE_ADDRESS=`
     - `NEXT_PUBLIC_PPDOT_TOKEN_ADDRESS=`
     - `NEXT_PUBLIC_PVM_MODULE_ADDRESS=`
     - `NEXT_PUBLIC_CORETIME_ARBITRAGE_ADDRESS=`
     - `NEXT_PUBLIC_REWARD_MONITOR_ADDRESS=`
   - WalletConnect + parachain RPCs as needed:
     - `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=`
     - `NEXT_PUBLIC_HYDRAX_RPC=`
     - `NEXT_PUBLIC_INTERLAY_RPC=`

---

### 3. Run test suites layer by layer

#### 3.1. Rust PVM modules

From `pvm-modules/`:

```bash
cd pvm-modules
cargo test
```

This exercises `math_lib.rs` and `yield_optimizer.rs` logic: compound yield math, annualization, fee-adjusted yields, allocation splits, etc.

#### 3.2. Smart-contract unit tests (Hardhat)

From `smart-contracts/`:

```bash
cd smart-contracts
npx hardhat test
```

This should run Solidity tests and any Node/viem tests defined in `test/` (e.g. `PolkaPulseCore.test.ts`, `CoretimeArbitrage.test.ts`, fuzz tests) on the in-memory Hardhat network.

---

### 4. Simulate the full yield loop with Chopsticks

This uses `scripts/simulate-yield-loop.ts` to run:

> Harvest → Optimizer → XCM dispatch (simulated) → ppDOT rebase

#### 4.1. Start Chopsticks fork

From your project root (or wherever `chopsticks.yml` lives):

```bash
npx @acala-network/chopsticks --config chopsticks.yml
```

- Ensure it’s listening on `http://127.0.0.1:8545` (matches `localhost` network in `hardhat.config.ts`).
- `ASSET_HUB_RPC` in `smart-contracts/.env` should point to this URL.

#### 4.2. Deploy contracts to the fork

From `smart-contracts/`:

```bash
cd smart-contracts
npx hardhat ignition deploy ignition/modules/PolkaPulse.ts --network localhost
```

- After this, note the deployed **PolkaPulseCore proxy address**.
- Put that in your `smart-contracts/.env` as:

  ```env
  POLKAPULSE_CORE_ADDRESS=0x...   # from deploy logs
  ```

(If `POLKAPULSE_CORE_ADDRESS` is not in `.env.example`, just add it; `simulate-yield-loop.ts` reads it via `process.env.POLKAPULSE_CORE_ADDRESS`.)

#### 4.3. Run the yield loop simulation script

Still in `smart-contracts/`:

```bash
npx hardhat run scripts/simulate-yield-loop.ts --network localhost
```

This script will:

- Check `harvestReady()`; if not, it uses `evm_increaseTime` + `evm_mine` to fast-forward.
- Log **before/after**:
  - `totalDOT`
  - `exchangeRate`
- Execute `executeYieldLoop()` and parse:
  - `YieldLoopExecuted` event (HydraDX amount, Interlay amount, projected APY, expected yield).
  - `Rebased` event (old vs new rate, yield in DOT).
- Assert invariants:
  - `exchangeRate` non-decreasing,
  - `totalDOT` non-decreasing.

If it finishes with the ✅ messages, the core protocol loop behaves correctly on the fork.

---

### 5. Run the frontend against your local deployment

1. Make sure Chopsticks + contracts are still running and reachable.

2. In `frontend/`:

   ```bash
   cd frontend
   npm run dev
   ```

3. Open `http://localhost:3000`:

   - Connect your wallet (configured to the same chain ID as your local fork).
   - Use the **dashboard** page to:
     - Deposit some DOT (whatever is available from your dev wallet in the fork),
     - Check `ppDOT` balance, yield stats, allocation chart.
   - Use the **vault** and **coretime** pages to confirm data is loading correctly via the hooks (`useppDOTBalance`, `useYieldStats`, `useCoretimeData`, etc.), assuming your RPC + addresses are wired.

---

### 6. Suggested `LOCAL_TESTING.md` content

You can create `LOCAL_TESTING.md` in the root with something like:

```markdown
# Local Testing Guide — PolkaPulse

## 1. Prerequisites

- Node.js v18+
- npm or pnpm
- Rust toolchain (`rustup`, `cargo`)
- Chopsticks (`npm install -g @acala-network/chopsticks`)
- Git, browser + EVM wallet

## 2. Smart Contracts

```bash
cd smart-contracts
npm install
cp .env.example .env
# Fill in PRIVATE_KEY, ASSET_HUB_RPC, etc.
npx hardhat test
```

## 3. PVM Modules (Rust)

```bash
cd pvm-modules
cargo test
```

## 4. Chopsticks Yield Loop Simulation

```bash
# In project root (with chopsticks.yml)
npx @acala-network/chopsticks --config chopsticks.yml
```

```bash
cd smart-contracts
npx hardhat ignition deploy ignition/modules/PolkaPulse.ts --network localhost
# Set POLKAPULSE_CORE_ADDRESS in .env
npx hardhat run scripts/simulate-yield-loop.ts --network localhost
```

## 5. Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
# Fill NEXT_PUBLIC_* values (RPC, chain ID, contract addresses)
npm run dev
# Open http://localhost:3000
```
```
