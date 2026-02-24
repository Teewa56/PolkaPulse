# PolkaPulse — Technical Documentation

---

## 1. Overview

PolkaPulse is a decentralized Yield-as-a-Service (YaaS) protocol built natively for the Polkadot 2.0 ecosystem. It is deployed on Polkadot's Asset Hub using PVM (Polkadot Virtual Machine) smart contracts, and it automates the entire lifecycle of DOT yield — from harvesting staking rewards, to cross-chain DeFi deployment via XCM v5, to purchasing Agile Coretime on behalf of partner parachains in exchange for boosted yield commitments.

The protocol introduces four core mechanisms: a hub-centric contract brain on Asset Hub, an Atomic Yield Loop that executes multi-step cross-chain operations in a single XCM instruction set, a Coretime Arbitrage Engine that connects yield generation with parachain blockspace funding, and precompile-based remote staking control over relay chain validator nominations. Depositors receive ppDOT — a rebasing ERC-20 receipt token that appreciates in value as yield accrues — and interact with a single contract entry point while the protocol handles all cross-chain execution autonomously.

---

## 2. Folder Structure

```
polkapulse/
├── contracts/                  # Solidity smart contracts (PVM-compatible)
│   ├── PolkaPulseCore.sol       # Main entry point, deposit/withdraw logic
│   ├── ppDOT.sol                # Rebasing ERC-20 receipt token
│   ├── RewardMonitor.sol        # Staking reward polling via Staking Precompile
│   ├── AtomicYieldExecutor.sol  # XCM v5 instruction set builder & dispatcher
│   ├── CoretimeArbitrage.sol    # Bulk Coretime NFT purchase & assignment logic
│   └── interfaces/
│       ├── IStakingPrecompile.sol
│       ├── IXCMPrecompile.sol
│       └── IAssetsPrecompile.sol
├── pvm-modules/                 # Rust PVM modules
│   ├── src/
│   │   ├── yield_optimizer.rs   # APY comparison & strategy selection logic
│   │   └── math_lib.rs          # Rust-native financial math (compound calc)
│   └── Cargo.toml
├── ignition/
│   └── modules/
│       └── PolkaPulse.ts        # Hardhat Ignition deployment module
├── scripts/
│   └── simulate-yield-loop.ts  # Local Chopsticks XCM fork simulation
├── test/
│   ├── PolkaPulseCore.test.ts   # Hardhat test suite
│   └── CoretimeArbitrage.test.ts
├── frontend/
│   ├── app/                     # Next.js 14 app directory
│   ├── components/              # UI components (deposit, ppDOT balance, yield stats)
│   └── wagmi.config.ts          # wagmi + RainbowKit wallet config
├── .env.example
├── hardhat.config.ts
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
npm install

# 3. Build Rust/PVM modules
cd pvm-modules && cargo build --release && cd ..

# 4. Configure environment
cp .env.example .env
# Set: PRIVATE_KEY, ASSET_HUB_RPC, HYDRAX_RPC, INTERLAY_RPC

# 5. Compile Solidity
npx hardhat compile

# 6. Run all tests
npx hardhat test
cargo test --manifest-path pvm-modules/Cargo.toml

# 7. Deploy to Asset Hub testnet
npx hardhat ignition deploy ./ignition/modules/PolkaPulse.ts --network assetHub

# 8. Launch frontend
cd frontend && npm install && npm run dev
# → http://localhost:3000

# 9. Simulate atomic yield loop on local fork
npx hardhat run scripts/simulate-yield-loop.ts --network localhost
```

---

## 9. Implementation Notes

The Rust yield optimizer must receive APY data as calldata — it does not make external calls itself. Any on-chain APY feed mechanism (or off-chain keeper passing current rates) must be implemented before the optimizer can make live decisions. The XCM `BuyExecution` weight limit in the AtomicYieldExecutor should be benchmarked against actual Asset Hub and HydraDX block weights before mainnet deployment to avoid failed executions. The ppDOT rebasing mechanism is not compatible out of the box with protocols that snapshot ERC-20 balances at a fixed block — integrations with governance tools or lending protocols will need to account for the dynamic balance model.

---

## 10. Additional Notes

**Security model:** PolkaPulse's trust assumptions are limited to the Polkadot consensus layer and its own smart contract logic. There are no external bridge operators, no off-chain relayers, and no oracle dependencies for cross-chain execution. The primary attack surface is the XCM program construction logic in `AtomicYieldExecutor` — malformed programs could result in failed or lost cross-chain transactions, making this the highest-priority audit target.

**Sovereign account management:** Each parachain interaction is mediated through PolkaPulse's XCM sovereign account on the destination chain. Ensure sufficient DOT is always maintained in these sovereign accounts to cover `BuyExecution` fees, or implement an auto-top-up mechanism as part of the yield loop.

**Hackathon scope vs. production:** For the MVP, XCM dispatch and Coretime purchases may be simulated via Chopsticks forks rather than executed on live testnets. The rebasing math and contract interfaces are production-grade; the cross-chain execution paths should be treated as integration targets pending full XCM v5 testnet availability.
