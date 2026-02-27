# PVM Modules — Technical README

---

## Overview

The `pvm-modules` directory contains the Rust-native computational layer of PolkaPulse, executed on the Polkadot Virtual Machine (PVM). These modules exist because certain financial calculations — specifically compound yield projections, APY comparisons across multiple protocols, and optimal capital allocation math — are either prohibitively expensive on the EVM or simply impossible to express with the precision required using Solidity's integer arithmetic alone. The PVM runs a Rust-based execution environment, which means PolkaPulse can call standard Rust mathematical logic directly from within smart contract execution. This is the core technical differentiator of the protocol's yield engine.

There are two modules: `yield_optimizer.rs` and `math_lib.rs`. They are tightly coupled — the optimizer is the decision layer, and the math library is the computation layer. Neither is meant to operate independently in production.

---

## math_lib.rs — The Computation Layer

### Purpose

`math_lib.rs` provides all the pure mathematical primitives the optimizer needs. It handles fixed-point arithmetic, compound interest calculations, annualized return projections, and fee-adjusted yield comparisons. All values are represented as fixed-point integers with 18 decimal places of precision, matching the DOT token's native denomination and avoiding any floating-point non-determinism that would make results inconsistent across validator nodes.

### Core Functions

**`compound(principal, rate_bps, periods) -> u128`**
This is the foundational function. It computes compound interest over a given number of periods using the standard formula `A = P(1 + r/n)^(nt)`, implemented entirely in integer arithmetic. `rate_bps` is the annual rate expressed in basis points (1 basis point = 0.01%), and `periods` represents the number of compounding intervals within the projection window. The function uses iterative multiplication with overflow checks rather than exponentiation, keeping gas-equivalent costs predictable and avoiding integer overflow on large principal values.

**`annualize(rate_bps, period_seconds) -> u128`**
Takes a yield rate measured over an arbitrary time window and converts it to an annualized APY figure. This is necessary because HydraDX and Interlay report yield over different timeframes — liquidity pool fees are measured per block, vault yields are measured per epoch. Before any comparison can be made, all rates must be normalized to the same annualized basis. This function handles that normalization.

**`fee_adjusted_yield(gross_yield, fee_bps) -> u128`**
Deducts protocol fees from a gross yield figure to produce a net yield. This is applied to both HydraDX LP fees and Interlay vault fees before the optimizer compares destinations. Comparing gross yields without accounting for fees would produce meaningless allocation recommendations.

**`weighted_average(values: &[u128], weights: &[u128]) -> u128`**
Computes a capital-weighted average yield across multiple positions. Used when the optimizer is calculating the blended yield of a split allocation — for example, 60% to HydraDX and 40% to Interlay — to produce a single comparable APY figure for the allocation strategy.

**`optimal_split(yield_a, yield_b, risk_a, risk_b) -> (u64, u64)`**
Returns an allocation percentage tuple (e.g., `(65, 35)`) representing the optimal split between two yield destinations. The logic applies a simplified mean-variance optimization: it maximizes expected yield subject to a risk-weighting penalty. Risk is expressed as a variance proxy passed in as calldata — higher variance reduces the effective yield score for that destination before the split is calculated.

---

## yield_optimizer.rs — The Decision Layer

### Purpose

`yield_optimizer.rs` is the module called directly by `AtomicYieldExecutor.sol`. It receives current market data as calldata, runs the math library functions, and returns a structured recommendation: which destination to use, what allocation split to apply, and the projected net APY of the recommended strategy. The Solidity contract then uses this output to construct the appropriate XCM v5 instruction set.

### Input Structure

The optimizer receives a flat ABI-encoded input containing:

- `principal: u128` — total DOT being deployed in this yield cycle
- `hydradx_apy_bps: u32` — current HydraDX omnipool APY in basis points
- `interlay_apy_bps: u32` — current Interlay vault APY in basis points
- `hydradx_fee_bps: u32` — HydraDX protocol fee
- `interlay_fee_bps: u32` — Interlay protocol fee
- `hydradx_risk_score: u32` — variance proxy for HydraDX (passed from off-chain keeper or on-chain oracle)
- `interlay_risk_score: u32` — variance proxy for Interlay
- `projection_periods: u32` — number of compounding periods to project over (typically 365 for daily compounding)

All inputs are passed from `AtomicYieldExecutor.sol` at call time. The optimizer performs no external reads — it is a pure function, stateless, and deterministic given the same inputs.

### Logic Flow

1. Both gross APYs are passed through `fee_adjusted_yield()` to produce net figures.
2. Both net APYs are passed through `annualize()` to normalize them to the same time basis.
3. `optimal_split()` is called with both normalized net yields and their respective risk scores, returning an allocation tuple.
4. `compound()` is called for each destination using the allocated principal and projected periods, producing expected absolute yield for each leg.
5. `weighted_average()` combines the two projected yields into a single blended APY figure for the full allocation.
6. The optimizer returns: destination flags (`use_hydradx: bool`, `use_interlay: bool`), allocation percentages, projected net APY in basis points, and expected absolute yield in DOT (expressed as u128 with 18 decimal precision).

### Output Structure

```rust
pub struct YieldRecommendation {
    pub use_hydradx: bool,
    pub use_interlay: bool,
    pub hydradx_allocation_pct: u64,   // e.g. 65
    pub interlay_allocation_pct: u64,  // e.g. 35
    pub projected_net_apy_bps: u32,    // blended APY
    pub expected_yield_dot: u128,      // absolute DOT yield over projection window
}
```

`AtomicYieldExecutor.sol` ABI-decodes this struct and uses `hydradx_allocation_pct` and `interlay_allocation_pct` to determine how to split the DOT amount across the two XCM dispatch calls it constructs.

---

## Architecture Summary

```
AtomicYieldExecutor.sol
        │
        │ (ABI-encoded calldata)
        ▼
  yield_optimizer.rs
        │
        ├── math_lib::fee_adjusted_yield()
        ├── math_lib::annualize()
        ├── math_lib::optimal_split()
        ├── math_lib::compound()
        └── math_lib::weighted_average()
        │
        │ (YieldRecommendation struct)
        ▼
AtomicYieldExecutor.sol
  → Constructs XCM v5 program
  → Dispatches via XCM Precompile
```