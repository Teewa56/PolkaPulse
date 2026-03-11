# Local Testing Guide — PolkaPulse

## 1. Prerequisites

- **Node.js v20** (required — v22 has ESM/CJS conflicts with Chopsticks)
- **npm** or **pnpm**
- **Rust toolchain** (`rustup`, `cargo`)
- **Docker Desktop** (required for Chopsticks — see Section 4)
- **Git** and a browser EVM wallet (MetaMask, etc.)

> ⚠️ Do **not** use Node.js v22. Use nvm to pin v20:
> ```bash
> nvm install 20
> nvm use 20
> node --version  # should print v20.x.x
> ```

---

## 2. Smart Contracts

```bash
cd smart-contracts
npm install --legacy-peer-deps
cp .env.example .env
```

Fill in `.env`:

```env
PRIVATE_KEY=           # dev wallet key (funded in local fork)
ASSET_HUB_RPC=         # http://127.0.0.1:8000 (Chopsticks Asset Hub port)
HYDRAX_RPC=            # http://127.0.0.1:8001 (optional for unit tests)
INTERLAY_RPC=          # http://127.0.0.1:8002 (optional for unit tests)
PVM_MODULE_ADDRESS=    # placeholder OK for pure Hardhat tests
POLKAPULSE_CORE_ADDRESS= # fill after deployment in step 5
```

Run the test suite (71 tests, all passing):

```bash
npx hardhat test
```

Expected output:
```
71 passing (12 solidity, 59 nodejs)
```

---

## 3. PVM Modules (Rust)

```bash
cd pvm-modules
cargo test
```

This exercises `math_lib.rs` and `yield_optimizer.rs`: compound yield math,
annualization, fee-adjusted yields, and allocation splits.

---

## 4. Chopsticks Fork (via Docker)

Chopsticks must be run via Docker on Windows. The global npm install
(`npm install -g @acala-network/chopsticks`) has known ESM/CJS breakage
on both Node v20 and v22 on Windows.

### 4.1. Install Docker Desktop

Download from https://www.docker.com/products/docker-desktop/ and install.
After installation, open Docker Desktop and wait for the whale icon in the
system tray to show "Engine running".

Verify:
```bash
docker info   # should print system info, not an error
```

If you get a pipe error, run Docker Desktop as Administrator and wait for the
engine to fully start before retrying.

### 4.2. Build the Chopsticks image (one-time)

From the project root:

```bash
cat > Dockerfile.chopsticks << 'EOF'
FROM node:20-alpine
RUN apk add --no-cache python3 make g++ \
    && npm install -g @acala-network/chopsticks@0.14.2
WORKDIR /app
ENTRYPOINT ["chopsticks"]
EOF

docker build -f Dockerfile.chopsticks -t chopsticks-local .
```

This takes 2–3 minutes on the first run. You only need to do it once.

### 4.3. Create per-chain config files

> ⚠️ Chopsticks XCM mode does **not** accept a single unified config file.
> It requires a separate `.yml` per chain, each passed with its own
> `--parachain` flag. The `--config` flag only works for single-chain mode.

From the project root, create the four config files:

```bash
mkdir -p chopsticks-db

cat > chopsticks-assethub.yml << 'EOF'
endpoint: wss://paseo-asset-hub-rpc.polkadot.io
port: 8000
mock-signature-host: true
db: ./chopsticks-db/assethub.db
import-storage:
  System.Account:
    - - - "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
      - data:
          free: "10000000000000000000000"
    - - - "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
      - data:
          free: "10000000000000000000000"
    - - - "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
      - data:
          free: "10000000000000000000000"
    - - - "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
      - data:
          free: "10000000000000000000000"
EOF

cat > chopsticks-hydradx.yml << 'EOF'
endpoint: wss://rpc.hydradx.cloud
port: 8001
mock-signature-host: true
db: ./chopsticks-db/hydradx.db
EOF

cat > chopsticks-interlay.yml << 'EOF'
endpoint: wss://api.interlay.io/parachain
port: 8002
mock-signature-host: true
db: ./chopsticks-db/interlay.db
EOF

cat > chopsticks-coretime.yml << 'EOF'
endpoint: wss://paseo-coretime-rpc.polkadot.io
port: 8003
mock-signature-host: true
db: ./chopsticks-db/coretime.db
EOF
```

### 4.4. Add npm scripts to root `package.json`

```json
"scripts": {
  "fork": "docker run --rm -it -v \"%cd%:/app\" -p 8000:8000 -p 8001:8001 -p 8002:8002 -p 8003:8003 chopsticks-local xcm --relaychain wss://rpc.ibp.network/paseo --parachain /app/chopsticks-assethub.yml --parachain /app/chopsticks-hydradx.yml --parachain /app/chopsticks-interlay.yml --parachain /app/chopsticks-coretime.yml",
  "fork:assethub": "docker run --rm -it -v \"%cd%:/app\" -p 8000:8000 chopsticks-local --config /app/chopsticks-assethub.yml"
}
```

### 4.5. Start the fork

**Full XCM multi-chain fork** (all four chains, needed for cross-chain tests):
```bash
npm run fork
```

**Asset Hub only** (sufficient for unit tests and contract deployment):
```bash
npm run fork:assethub
```

Port mapping:

| Port | Chain               |
|------|---------------------|
| 8000 | Asset Hub (primary) |
| 8001 | HydraDX             |
| 8002 | Interlay            |
| 8003 | Coretime Chain      |

> ℹ️ The large block of `@polkadot/util has multiple versions` warnings on
> startup is harmless — it is a known peer dependency conflict inside
> Chopsticks itself and does not affect functionality.

Leave this terminal running. Use a second terminal for all subsequent steps.

---

## 5. Deploy Contracts to the Fork

```bash
cd smart-contracts
npx hardhat ignition deploy ignition/modules/PolkaPulse.ts --network localhost
```

Copy the deployed PolkaPulseCore proxy address from the logs and add it to `.env`:

```env
POLKAPULSE_CORE_ADDRESS=0x...
```

---

## 6. Run the Yield Loop Simulation

```bash
cd smart-contracts
npx hardhat run scripts/simulate-yield-loop.ts --network localhost
```

The script will:

1. Check `harvestReady()` and fast-forward time via `evm_increaseTime` + `evm_mine` if needed.
2. Log before/after state: `totalDOT` and `exchangeRate`.
3. Execute `executeYieldLoop()` and parse emitted events:
   - `YieldLoopExecuted` — HydraDX allocation, Interlay allocation, projected APY, expected yield.
   - `Rebased` — old rate, new rate, yield in DOT.
4. Assert invariants: `exchangeRate` non-decreasing, `totalDOT` non-decreasing.

A successful run ends with ✅ messages for each invariant.

---

## 7. Run the Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```env
NEXT_PUBLIC_CHAIN_ID=420420417          # Paseo Asset Hub EVM chain ID
NEXT_PUBLIC_ASSET_HUB_RPC=http://127.0.0.1:8000

# Contract addresses from step 5
NEXT_PUBLIC_POLKAPULSE_CORE_ADDRESS=
NEXT_PUBLIC_PPDOT_TOKEN_ADDRESS=
NEXT_PUBLIC_PVM_MODULE_ADDRESS=
NEXT_PUBLIC_CORETIME_ARBITRAGE_ADDRESS=
NEXT_PUBLIC_REWARD_MONITOR_ADDRESS=

# Optional
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=
NEXT_PUBLIC_HYDRAX_RPC=http://127.0.0.1:8001
NEXT_PUBLIC_INTERLAY_RPC=http://127.0.0.1:8002
```

```bash
npm run dev
```

Open `http://localhost:3000`. Connect your wallet to chain ID `420420417`
pointing at `http://127.0.0.1:8000`. You can then:

- Deposit DOT and check your `ppDOT` balance.
- View yield stats, allocation chart, and Coretime arbitrage data via the
  `useppDOTBalance`, `useYieldStats`, and `useCoretimeData` hooks.

---