# PolkaPulse — User Flow Guide

> How different types of users interact with the protocol

---

## User Types

| Type | Who They Are | Primary Goal |
|------|-------------|--------------|
| **Depositor** | Regular DOT holder | Earn yield passively |
| **Withdrawer** | Existing ppDOT holder | Redeem accumulated yield |
| **Keeper** | Bot operator / protocol participant | Trigger yield loops for gas rebate |
| **Governor** | Multisig signer | Propose and execute protocol changes |
| **Partner** | Parachain team | Receive Coretime, commit to boosted yield |
| **Developer** | Builder integrating PolkaPulse | Read contract state, build on top |

---

## Flow 1 — Depositor (Earn Yield on DOT)

**Who:** Any DOT holder who wants automated yield without managing staking manually.

### Step 1 — Connect Wallet
1. Navigate to [localhost:3000](http://localhost:3000) or the deployed app URL
2. Click **Connect Wallet** in the top-right navbar
3. Select your wallet (MetaMask, Talisman, or SubWallet)
4. Approve the Asset Hub Westend network switch if prompted
5. Confirm your address appears in the navbar

### Step 2 — Fund Your Wallet
- Ensure you have WND (Westend testnet) or DOT (mainnet) in your wallet
- Testnet: get WND from [faucet.polkadot.io](https://faucet.polkadot.io) → select Westend Asset Hub
- You need slightly more than your deposit amount to cover gas fees

### Step 3 — Deposit DOT
1. Navigate to **Dashboard** (`/dashboard`)
2. In the **Deposit DOT** card on the left, enter the amount you want to deposit
3. The preview panel below the input shows:
   - How many **ppDOT shares** you will receive
   - The current **exchange rate** (ppDOT/DOT)
4. Click **Deposit**
5. Your wallet prompts you to sign and send the transaction
6. Wait for the confirmation message: `✓ Deposit confirmed`

### Step 4 — Monitor Your Position
1. The **Your Position** card (below the deposit/withdraw cards) shows:
   - **ppDOT Balance** — your raw shares
   - **DOT Value** — current redemption value of your shares
   - **DOT Earned** — yield accumulated since deposit
   - **Current Rate** — live ppDOT/DOT exchange rate
2. As the protocol executes yield loops and rebases, your **DOT Value** increases automatically — you don't need to do anything

### Step 5 — Track Yield on the Vault Page
1. Navigate to **Vault** (`/vault`)
2. The large rate display shows the live ppDOT/DOT exchange rate ticking up with every rebase
3. The **Yield Loop History** and **Rebase Events** tables show each harvest cycle with yield amounts and APY per epoch
4. Your ppDOT balance stays constant but each DOT it redeems for increases over time

**What the protocol does in the background for you:**
- `RewardMonitor` polls for staking rewards every hour
- When rewards exceed the threshold, `executeYieldLoop()` is called
- The PVM Yield Optimizer splits capital between HydraDX and Interlay for best APY
- Yield is added to `totalDOT`, increasing the ppDOT/DOT rate
- ppDOT rebases — your balance in DOT terms grows without any action from you

---

## Flow 2 — Withdrawer (Redeem ppDOT for DOT)

**Who:** An existing depositor who wants to exit their position fully or partially.

### Step 1 — Check Your Balance
1. Connect wallet and go to **Dashboard**
2. In **Your Position**, note your `ppDOT Balance` and `DOT Value`
3. The DOT Value is what you will receive when you withdraw

### Step 2 — Withdraw
1. In the **Withdraw** card (right side of Dashboard), enter how many ppDOT shares you want to burn
2. Click **MAX** to auto-fill your full balance for a complete exit
3. The preview shows how many DOT you will receive at the current rate
4. Click **Withdraw**
5. Sign and confirm the transaction in your wallet
6. Confirmation: `✓ Withdrawal confirmed`
7. DOT is returned directly to your wallet; your ppDOT balance decreases accordingly

### Partial Withdrawal
- Enter any amount less than your full ppDOT balance
- Remaining ppDOT continues earning yield
- You can withdraw in as many increments as you like

---

## Flow 3 — Keeper (Trigger Yield Loops)

**Who:** Anyone — bots, protocol participants, or curious users — who calls `executeYieldLoop()` to harvest pending rewards. This function is permissionless; anyone can call it when the harvest is ready.

### When to Call
- The protocol is ready to harvest when `harvestReady()` returns `true`
- This happens when pending staking rewards exceed `rewardThreshold` AND at least 1 hour has passed since the last harvest
- You can check readiness on the **Dashboard** — the **Pending Rewards** stat in `YieldStats` shows the current pending amount

### How to Call (via UI — Coretime page)
1. Navigate to **Coretime** (`/coretime`)
2. If the epoch countdown reaches zero and `epochReady` is true, the **Trigger Epoch** button appears in the Partner Parachains card
3. Click **Trigger Epoch** to call `CoretimeArbitrage.triggerEpoch()`
4. Sign and confirm — this purchases Bulk Coretime and assigns it to the highest-APY partner

### How to Call (via CLI — for `executeYieldLoop`)
```bash
cast send <PROXY_ADDRESS> "executeYieldLoop()" \
  --private-key $PRIVATE_KEY \
  --rpc-url https://westend-asset-hub-eth-rpc.polkadot.io
```

Check readiness first:
```bash
cast call <PROXY_ADDRESS> "harvestReady()" \
  --rpc-url https://westend-asset-hub-eth-rpc.polkadot.io
# Returns 0x0000...0001 (true) or 0x0000...0000 (false)
```

### What Happens After You Call It
1. `RewardMonitor` records the harvest and resets the cooldown timer
2. `AtomicYieldExecutor` queries the PVM Yield Optimizer precompile for the optimal capital split
3. XCM messages are dispatched to HydraDX and Interlay
4. Net yield (gross minus protocol fee) is added to `totalDOT`
5. ppDOT exchange rate increases — all depositors benefit
6. A `Rebased` event is emitted — visible in the Vault page's Rebase Events table

---

## Flow 4 — Governor (Multisig Signer)

**Who:** One of the 3 designated multisig signers who controls protocol administration through the Timelock.

All governance actions require M-of-N signatures (default: 2-of-3) and a 48-hour delay before execution.

### Proposing a Change

All governance actions go through `PolkaPulseMultisig.propose()`. Currently this is done via CLI — a governance UI is a future milestone.

**Example: Update reward threshold**

Signer 1 proposes:
```bash
# Encode the calldata for setRewardThreshold(newThreshold)
cast calldata "setRewardThreshold(uint128)" 20000000000000000000

# Propose on the multisig (target = proxy address, value = 0)
cast send <MULTISIG_ADDRESS> \
  "propose(address,uint256,bytes)" \
  <PROXY_ADDRESS> 0 <ENCODED_CALLDATA> \
  --private-key $SIGNER_1_KEY \
  --rpc-url https://westend-asset-hub-eth-rpc.polkadot.io
```

Note the `proposalId` from the emitted `ProposalCreated` event.

### Confirming a Proposal

Signer 2 confirms (threshold met at 2 confirmations):
```bash
cast send <MULTISIG_ADDRESS> \
  "confirm(bytes32)" <PROPOSAL_ID> \
  --private-key $SIGNER_2_KEY \
  --rpc-url https://westend-asset-hub-eth-rpc.polkadot.io
```

### Executing the Proposal

Once confirmed, any signer executes — this queues the action on the Timelock:
```bash
cast send <MULTISIG_ADDRESS> \
  "execute(bytes32)" <PROPOSAL_ID> \
  --private-key $SIGNER_1_KEY \
  --rpc-url https://westend-asset-hub-eth-rpc.polkadot.io
```

### After the 48-Hour Delay

Anyone can call execute on the Timelock after the delay:
```bash
cast send <TIMELOCK_ADDRESS> \
  "execute(address,uint256,bytes)" \
  <PROXY_ADDRESS> 0 <ENCODED_CALLDATA> \
  --rpc-url https://westend-asset-hub-eth-rpc.polkadot.io
```

### Common Governance Actions

| Action | Function | Notes |
|--------|----------|-------|
| Update reward threshold | `setRewardThreshold(uint128)` | How much pending rewards before harvest |
| Update protocol fee | `setProtocolFee(uint32)` | BPS, max 10,000 |
| Pause protocol | `pause()` | Blocks deposit/withdraw/yield loop |
| Unpause protocol | `unpause()` | Re-enables all user functions |
| Add partner parachain | `addPartner(uint32,uint32)` on CoretimeArbitrage | parachainId, boostedApyBps |
| Remove partner | `removePartner(uint32)` | |
| Upgrade implementation | `upgradeTo(address)` on Proxy | Requires new impl deployed first |

### Revoking a Confirmation

If a signer changes their mind before execution:
```bash
cast send <MULTISIG_ADDRESS> \
  "revoke(bytes32)" <PROPOSAL_ID> \
  --private-key $SIGNER_KEY \
  --rpc-url https://westend-asset-hub-eth-rpc.polkadot.io
```

Proposals expire automatically after 7 days if not executed.

---

## Flow 5 — Partner Parachain Team

**Who:** A team running a parachain (e.g. HydraDX, Interlay) who wants to receive Bulk Coretime from PolkaPulse in exchange for committing to a boosted APY for protocol liquidity.

### Becoming a Partner

1. Contact the PolkaPulse governance multisig to negotiate:
   - Your parachain ID
   - The boosted APY BPS you commit to (e.g. 1200 = 12%)
2. A governor submits `addPartner(parachainId, boostedApyBps)` through the multisig → timelock flow
3. After the 48-hour delay, your parachain appears in the **Partner Parachains** table on the Coretime page

### What Happens Each Epoch (Every 7 Days)

1. Anyone calls `triggerEpoch()` on `CoretimeArbitrage` when the epoch countdown hits zero
2. The contract selects the partner with the highest `boostedApyBps` as the Coretime recipient
3. An XCM message dispatches the Bulk Coretime NFT purchase on the Coretime Chain (Para 1005)
4. A second XCM assigns the Coretime to your parachain's sovereign account
5. `CoretimePurchased` and `CoretimeAssigned` events are emitted and visible in the Coretime page

### Monitoring Your Allocation

- Visit the **Coretime** page to see your parachain's current allocation percentage and boosted APY
- Allocation percentage is computed proportionally relative to all partners' boosted APY values
- Higher boosted APY = higher share of yield loop capital deployed to your parachain + higher chance of winning Coretime each epoch

---

## Flow 6 — Developer / Integrator

**Who:** A developer building on top of PolkaPulse — reading protocol state, indexing events, or integrating ppDOT into another protocol.

### Reading Protocol State

All read functions are available on the proxy address. Use the `IPolkaPulseCore` ABI:

```typescript
import { createPublicClient, http } from "viem";
import { POLKAPULSE_CORE_ABI } from "./types/contracts";

const client = createPublicClient({
  chain: assetHubWestend,
  transport: http("https://westend-asset-hub-eth-rpc.polkadot.io"),
});

// Exchange rate
const rate = await client.readContract({
  address: PROXY_ADDRESS,
  abi: POLKAPULSE_CORE_ABI,
  functionName: "exchangeRate",
});

// Total DOT in protocol
const tvl = await client.readContract({
  address: PROXY_ADDRESS,
  abi: POLKAPULSE_CORE_ABI,
  functionName: "totalDOT",
});

// Whether harvest is ready
const ready = await client.readContract({
  address: PROXY_ADDRESS,
  abi: POLKAPULSE_CORE_ABI,
  functionName: "harvestReady",
});
```

### Listening to Events

```typescript
// Watch for all rebase events
client.watchContractEvent({
  address: PPDOT_ADDRESS,
  abi: PPDOT_ABI,
  eventName: "Rebase",
  onLogs: (logs) => {
    logs.forEach(log => {
      console.log("New rate:", log.args.newRate);
      console.log("Yield:   ", log.args.yieldDot);
    });
  },
});
```

### ppDOT Token Integration

ppDOT is a standard ERC-20 with two additional view functions:

| Function | Returns | Notes |
|----------|---------|-------|
| `balanceOf(address)` | DOT-equivalent balance | Increases automatically as rate rises |
| `sharesOf(address)` | Raw share count | Constant unless user deposits/withdraws |
| `exchangeRate()` | Current DOT per share (1e18 precision) | |
| `totalSupply()` | Total DOT-equivalent supply | |
| `totalShares()` | Total raw shares issued | |

If integrating ppDOT as collateral or in a liquidity pool, use `sharesOf()` for the actual on-chain balance and `exchangeRate()` to price it — `balanceOf()` is a computed view and using it directly in on-chain logic can introduce precision issues.

### Running the Simulation Script

To test the full yield loop locally before touching testnet:

```bash
cd smart-contracts

# Start Chopsticks fork
chopsticks --config chopsticks.yml &

# Deploy to fork (localhost points to Chopsticks)
npx hardhat ignition deploy ./ignition/modules/PolkaPulse.ts --network localhost

# Export proxy address to .env
echo "POLKAPULSE_CORE_ADDRESS=0x<PROXY>" >> .env

# Run simulation
npx hardhat run scripts/simulate-yield-loop.ts --network localhost
```

Expected output confirms all invariants pass:
```
✅ Exchange rate is non-decreasing.
✅ totalDOT is non-decreasing.
✅ Yield loop simulation complete.
```

---

## Quick Reference — Key Addresses (Testnet)

> Fill these in after running deployment in Step 2.6 of the setup guide.

| Contract | Address |
|----------|---------|
| PolkaPulseProxy (entry point) | `0x` — fill after deploy |
| ppDOT Token | `0x` — fill after deploy |
| CoretimeArbitrage | `0x` — fill after deploy |
| RewardMonitor | `0x` — fill after deploy |
| Staking Precompile | `0x0000000000000000000000000000000000000800` |
| XCM Precompile | `0x0000000000000000000000000000000000000808` |

## Quick Reference — Key Numbers

| Parameter | Default Value | Governed By |
|-----------|--------------|-------------|
| Protocol fee | 2% (200 BPS) | Multisig + Timelock |
| Harvest cooldown | 1 hour | RewardMonitor |
| Reward threshold | 10 DOT | Multisig + Timelock |
| Coretime fraction | 5% of yield | Multisig + Timelock |
| Epoch interval | 7 days | Hardcoded |
| Min Coretime purchase | 100 DOT | Multisig + Timelock |
| Timelock delay | 48 hours | Immutable |
| Multisig threshold | 2-of-3 | Self-governed via multisig |
| Proposal expiry | 7 days | Hardcoded |