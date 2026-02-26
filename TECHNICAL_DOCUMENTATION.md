# PolkaPulse — Technical Documentation

---

## 1. Overview

PolkaPulse is a decentralized Yield-as-a-Service (YaaS) protocol built natively for the Polkadot 2.0 ecosystem. It is deployed on Polkadot's Asset Hub using PVM (Polkadot Virtual Machine) smart contracts, and it automates the entire lifecycle of DOT yield — from harvesting staking rewards, to cross-chain DeFi deployment via XCM v5, to purchasing Agile Coretime on behalf of partner parachains in exchange for boosted yield commitments.

The protocol introduces four core mechanisms: a hub-centric contract brain on Asset Hub, an Atomic Yield Loop that executes multi-step cross-chain operations in a single XCM instruction set, a Coretime Arbitrage Engine that connects yield generation with parachain blockspace funding, and precompile-based remote staking control over relay chain validator nominations. Depositors receive ppDOT — a rebasing ERC-20 receipt token that appreciates in value as yield accrues — and interact with a single contract entry point while the protocol handles all cross-chain execution autonomously.

---

## 2. Folder Structure
```
polkapulse/
│
├── smart-contracts/
│   ├── contracts/
│   │   ├── PolkaPulseCore.sol
│   │   ├── ppDOT.sol
│   │   ├── RewardMonitor.sol
│   │   ├── AtomicYieldExecutor.sol
│   │   ├── CoretimeArbitrage.sol
│   │   └── interfaces/
│   │       ├── IStakingPrecompile.sol
│   │       ├── IXCMPrecompile.sol
│   │       └── IAssetsPrecompile.sol
│   ├── ignition/
│   │   └── modules/
│   │       └── PolkaPulse.ts
│   ├── scripts/
│   │   └── simulate-yield-loop.ts
│   ├── test/
│   │   ├── PolkaPulseCore.test.ts
│   │   └── CoretimeArbitrage.test.ts
│   ├── hardhat.config.ts
│   └── .env.example
│
├── pvm-modules/
│   ├── src/
│   │   ├── yield_optimizer.rs
│   │   ├── tests.rs
│   │   └── math_lib.rs
│   └── Cargo.toml
│
├── frontend/
│   ├── public/
│   │   ├── favicon.ico
│   │   └── logo.svg
│   │
│   ├── app/
│   │   ├── layout.tsx                  # Root layout (fonts, metadata, providers)
│   │   ├── page.tsx                    # Landing / home page
│   │   ├── globals.css                 # Global TailwindCSS styles
│   │   │
│   │   ├── dashboard/
│   │   │   └── page.tsx                # Main user dashboard (deposit, withdraw, stats)
│   │   │
│   │   ├── vault/
│   │   │   └── page.tsx                # ppDOT vault detail view
│   │   │
│   │   └── coretime/
│   │       └── page.tsx                # Coretime arbitrage status & partner parachains
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx              # Top navigation bar with wallet connect
│   │   │   ├── Sidebar.tsx             # Dashboard sidebar navigation
│   │   │   └── Footer.tsx
│   │   │
│   │   ├── dashboard/
│   │   │   ├── DepositCard.tsx         # DOT deposit input + ppDOT preview
│   │   │   ├── WithdrawCard.tsx        # ppDOT burn + DOT redemption
│   │   │   ├── YieldStats.tsx          # Live APY, total yield earned, position value
│   │   │   ├── PositionSummary.tsx     # User's ppDOT balance and DOT equivalent
│   │   │   └── AllocationChart.tsx     # HydraDX vs Interlay split visualization
│   │   │
│   │   ├── vault/
│   │   │   ├── ppDOTRate.tsx           # Live ppDOT/DOT exchange rate display
│   │   │   ├── YieldHistory.tsx        # Historical yield harvest events
│   │   │   └── RebaseTracker.tsx       # Rebase events log
│   │   │
│   │   ├── coretime/
│   │   │   ├── CoretimeStatus.tsx      # Current Bulk Coretime holdings
│   │   │   ├── PartnerParachains.tsx   # Partner list with boosted yield rates
│   │   │   └── EpochCountdown.tsx      # Time until next Coretime purchase epoch
│   │   │
│   │   └── ui/
│   │       ├── Button.tsx
│   │       ├── Card.tsx
│   │       ├── Input.tsx
│   │       ├── Badge.tsx
│   │       ├── Spinner.tsx
│   │       ├── Modal.tsx
│   │       └── Tooltip.tsx
│   │
│   ├── hooks/
│   │   ├── useDeposit.ts               # Deposit tx logic via wagmi
│   │   ├── useWithdraw.ts              # Withdraw tx logic
│   │   ├── useppDOTBalance.ts          # Read user's ppDOT balance
│   │   ├── useYieldStats.ts            # Fetch live APY and harvest data
│   │   ├── useExchangeRate.ts          # ppDOT/DOT exchange rate reader
│   │   └── useCoretimeData.ts          # Coretime holdings and epoch data
│   │
│   ├── lib/
│   │   ├── wagmi.config.ts             # wagmi + RainbowKit chain config
│   │   ├── contracts.ts                # Contract addresses and ABIs
│   │   ├── polkadot.ts                 # Polkadot.js API instance setup
│   │   └── utils.ts                    # Formatting helpers (DOT, BPS, dates)
│   │
│   ├── providers/
│   │   ├── WalletProvider.tsx          # RainbowKit + wagmi context wrapper
│   │   └── QueryProvider.tsx           # TanStack Query provider
│   │
│   ├── types/
│   │   ├── contracts.ts                # TypeChain-generated or manual ABI types
│   │   └── protocol.ts                 # Shared protocol types (YieldStats, Position, etc.)
│   │
│   ├── constants/
│   │   └── index.ts                    # Chain IDs, precompile addresses, token decimals
│   │
│   ├── .env.example
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 3. Contracts Architecture

**PolkaPulseCore.sol** is the protocol's single user-facing entry point. It accepts DOT deposits, mints ppDOT to the depositor via the ppDOT contract, and coordinates calls to the RewardMonitor, AtomicYieldExecutor, and CoretimeArbitrage modules. It also handles withdrawal logic — burning ppDOT and returning the underlying DOT plus accrued yield.

**ppDOT.sol** is a rebasing ERC-20 token. Rather than storing fixed balances, it stores each holder's share of the total underlying DOT pool. As yield accrues, the exchange rate between shares and DOT increases, so every holder's balance appreciates passively without any transfer events. This is conceptually similar to Lido's stETH model.

**RewardMonitor.sol** interfaces with the Staking Precompile at address `0x0000...0800` to poll staking reward accrual in real time. It fires a harvest trigger once rewards cross a configured threshold, preventing gas-inefficient micro-harvests.

**AtomicYieldExecutor.sol** is the most complex contract in the system. It programmatically constructs XCM v5 instruction sets — sequences of `WithdrawAsset`, `BuyExecution`, `DepositAsset`, and `Transact` instructions — and dispatches them via the XCM Precompile at `0x0000...0808`. The contract calls out to the PVM Rust yield optimizer to determine whether HydraDX or Interlay offers the superior risk-adjusted yield at execution time, then builds the appropriate XCM program accordingly.

**CoretimeArbitrage.sol** accumulates a configurable portion of protocol yield into a treasury reserve. On a weekly epoch trigger, it calls the Coretime Chain API via an XCM `Transact` instruction to purchase Bulk Coretime NFTs representing parachain blockspace. These NFTs are then assigned to whitelisted partner parachains. In return, partner parachains commit to Boosted Yield agreements — preferential yield rates for PolkaPulse depositors on their DeFi protocols.

---

## 4. Parachain Architecture

PolkaPulse interacts with three external parachain environments:

**HydraDX** acts as the primary DeFi yield destination. DOT is teleported to HydraDX via XCM and deposited into its omnipool liquidity positions. HydraDX returns LP tokens to the protocol's sovereign account on that parachain, and yield is harvested back to Asset Hub on a recurring XCM cycle.

**Interlay** serves as the secondary yield destination and collateral layer. DOT deposited into Interlay vaults is used as collateral to mint iBTC or iUSD, generating vault yield. This also gives PolkaPulse an indirect BTC-correlated yield stream diversifying the depositor's returns beyond pure DOT staking.

**Coretime Chain** is the blockspace marketplace for Polkadot 2.0. PolkaPulse interacts with it exclusively through XCM `Transact` calls — there is no direct Coretime Chain smart contract. The CoretimeArbitrage engine purchases Bulk Coretime in 28-day blocks, and the NFT representing that blockspace is assigned to a partner parachain's parachain ID on-chain.

Each of these parachain integrations relies entirely on XCM v5 — no bridging infrastructure, no off-chain relayers, and no trusted intermediaries. The PolkaPulse contract on Asset Hub holds a sovereign account on each parachain that it controls remotely via XCM instructions.

---

## 5. Other Parts Architecture

**PVM Yield Optimizer (Rust):** The `yield_optimizer.rs` module runs inside the PVM and is called by `AtomicYieldExecutor.sol` before each cross-chain deployment. It ingests current APY data from HydraDX and Interlay (passed in as calldata), runs compound interest projections using `math_lib.rs`, and returns the optimal allocation split. This logic would be prohibitively expensive on the EVM but runs efficiently in the PVM's Rust execution environment.

**ppDOT Rebasing Engine:** The rebase mechanism operates entirely within `ppDOT.sol`. No external keeper or oracle is needed — the exchange rate updates when `PolkaPulseCore` calls `notifyYield()` after each successful yield harvest, passing the new total DOT under management. All balance reads dynamically compute `shares * exchangeRate`.

**Precompile Layer:** Three precompiles form the bridge between Solidity and Substrate: the Staking Precompile for reward monitoring and validator nomination management, the XCM Precompile for dispatching cross-chain instruction sets, and the Assets Precompile for native DOT balance reads and transfers within the Asset Hub environment.

---

## 6. Protocol Flow

**Deposit Flow:**
1. User calls `deposit(amount)` on `PolkaPulseCore`
2. DOT is transferred to the contract's Asset Hub account
3. ppDOT shares are calculated and minted to the depositor
4. DOT is queued for the next harvest cycle

**Atomic Yield Loop (per harvest trigger):**
1. `RewardMonitor` detects reward threshold has been crossed via Staking Precompile
2. `PolkaPulseCore` calls `AtomicYieldExecutor.execute()`
3. Executor calls PVM Rust optimizer — receives optimal destination and allocation
4. Executor constructs XCM v5 program: `WithdrawAsset → BuyExecution → Transact (vault deposit) → DepositAsset`
5. XCM Precompile dispatches the program to HydraDX or Interlay
6. DeFi yield accrues on the destination parachain
7. A reverse XCM cycle retrieves yield and teleports it back to Asset Hub
8. `ppDOT.notifyYield()` is called, increasing the exchange rate for all holders

**Coretime Arbitrage Flow (weekly epoch):**
1. Treasury reserve threshold is met in `CoretimeArbitrage`
2. Contract dispatches XCM `Transact` to Coretime Chain to purchase Bulk Coretime NFT
3. NFT is assigned to a whitelisted partner parachain ID
4. Partner parachain's staking/vault contracts receive a Boosted Yield signal via XCM
5. Depositors automatically benefit from elevated yield rates on next harvest cycle

**Withdrawal Flow:**
1. User calls `withdraw(shares)` on `PolkaPulseCore`
2. ppDOT shares are burned
3. Underlying DOT (principal + yield) is calculated at current exchange rate
4. DOT is returned to the user's Asset Hub account

---

## 7. Stack Summary

| Layer | Technology |
|---|---|
| Smart Contracts | Solidity ^0.8.20 + Rust (PVM) |
| Execution VM | Polkadot Virtual Machine (PVM) |
| Cross-Chain Messaging | XCM v5 |
| Precompiles | Staking (0x800), XCM (0x808), Assets |
| Dev Framework | Hardhat + cargo-contract |
| Testing | Hardhat test suite, cargo test, Chopsticks fork |
| Receipt Token | ERC-20 rebasing (ppDOT) |
| Frontend | Next.js 14, TailwindCSS, wagmi, RainbowKit |
| DeFi Integrations | HydraDX SDK, Interlay SDK |
| Blockspace | Polkadot Coretime Chain API |

---

## 8. Local Dev Setup

```bash
# 1. Clone and enter repo
git clone https://github.com/Teewa56/polkapulse.git && cd polkapulse

# 2. Install JS deps
cd frontend
npm install
cd ../smart-contracts
npm install

# 3. Build Rust/PVM modules
cd ../pvm-modules
cargo build --release
cargo contract build
# Produces: ./target/ink/pvm_modules.contract (bytecode + ABI bundle)
cd ..

# 4. Configure environment
cp .env.example .env
# Set: PRIVATE_KEY, ASSET_HUB_RPC, HYDRAX_RPC, INTERLAY_RPC

# 5. Deploy PVM module to Asset Hub testnet
cargo contract instantiate \
  --contract ./pvm-modules/target/ink/pvm_modules.contract \
  --suri $PRIVATE_KEY \
  --url $ASSET_HUB_RPC
# Copy the instantiated contract address from the output.
# Paste it into smart-contracts/hardhat.config.ts as PVM_MODULE_ADDRESS
# and into frontend/lib/constants/index.ts as PVM_MODULE_ADDRESS.

# 6. Compile Solidity contracts
cd ../smart-contracts
npx hardhat compile

# 7. Run all tests
cd ../pvm-modules
cargo test
cd ../smart-contracts
npx hardhat test

# 8. Deploy Solidity contracts to Asset Hub testnet
npx hardhat ignition deploy ./ignition/modules/PolkaPulse.ts --network assetHub
cd ../pvm-modules

# 9. Launch frontend
cd ../frontend && npm install && npm run dev
# → http://localhost:3000

# 10. Simulate atomic yield loop on local fork
cd ../smart-contracts
npx hardhat run scripts/simulate-yield-loop.ts --network localhost
```

> **Note:** Steps 5 and 8 are order-dependent. The PVM module must be instantiated on Asset Hub **before** the Solidity contracts are deployed, because `AtomicYieldExecutor.sol` takes the PVM module address as a constructor argument. If you redeploy the PVM module for any reason, you must redeploy the Solidity contracts as well and update the address in both `hardhat.config.ts` and `frontend/lib/constants/index.ts`.

# PVM modules deployment
Deploying the PVM modules to Polkadot is done through `cargo-contract`, the same toolchain used to build ink! smart contracts. Once the modules are compiled with `cargo build --release`, run `cargo contract build` to produce a `.contract` bundle — a file that packages the compiled PVM bytecode together with its ABI metadata and this bundle is what gets deployed on-chain. You then deploy it to the Polkadot Asset Hub testnet using either the `cargo contract instantiate` CLI command pointed at your Asset Hub RPC endpoint, or through the Contracts UI at `contracts.polkadot.io` by uploading the `.contract` file directly. Once instantiated, the deployed PVM module lives at a specific on-chain address, and that address is what you drop into `AtomicYieldExecutor.sol` as the call target — the Solidity contract calls it the same way it would call any other contract, passing in the ABI-encoded `OptimizerInput` as calldata and reading back the ABI-decoded `YieldRecommendation` struct. The key thing to understand is that unlike EVM contracts which are deployed once globally, PVM contracts on Asset Hub are instantiated, meaning the same compiled code can be instantiated multiple times at different addresses, but for PolkaPulse we only need one canonical instance per network, and its address should be stored as a constant in `contracts.ts` on the frontend and hardcoded into the Solidity deployment configuration in `hardhat.config.ts`.

---

## 9. Implementation Notes

The Rust yield optimizer must receive APY data as calldata — it does not make external calls itself. Any on-chain APY feed mechanism (or off-chain keeper passing current rates) must be implemented before the optimizer can make live decisions. The XCM `BuyExecution` weight limit in the AtomicYieldExecutor will be benchmarked against actual Asset Hub and HydraDX block weights before mainnet deployment to avoid failed executions. The ppDOT rebasing mechanism is not compatible out of the box with protocols that snapshot ERC-20 balances at a fixed block — integrations with governance tools or lending protocols will account for the dynamic balance model.

---

## 10. Additional Notes

**Security model:** PolkaPulse's trust assumptions are limited to the Polkadot consensus layer and its own smart contract logic. There are no external bridge operators, no off-chain relayers, and no oracle dependencies for cross-chain execution. The primary attack surface is the XCM program construction logic in `AtomicYieldExecutor` — malformed programs could result in failed or lost cross-chain transactions, making this the highest-priority audit target.

**Sovereign account management:** Each parachain interaction is mediated through PolkaPulse's XCM sovereign account on the destination chain. Ensure sufficient DOT is always maintained in these sovereign accounts to cover `BuyExecution` fees, or implement an auto-top-up mechanism as part of the yield loop.

**Hackathon scope vs. production:** For the MVP, XCM dispatch and Coretime purchases are simulated via Chopsticks forks rather than executed on live testnets. The rebasing math and contract interfaces are production-grade; the cross-chain execution paths should be treated as integration targets pending full XCM v5 testnet availability.
