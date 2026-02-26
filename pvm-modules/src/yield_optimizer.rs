/// The decision layer of the PVM module stack. This module is called directly
/// by AtomicYieldExecutor.sol and returns a YieldRecommendation struct that the
/// Solidity contract ABI-decodes to construct the appropriate XCM v5 instruction set.
///
/// STATELESS CONTRACT:
/// This module is a pure function. It reads from OptimizerInput (ABI-encoded
/// calldata passed by the Solidity caller) and writes to YieldRecommendation
/// (ABI-encoded return data). It performs zero storage reads, zero external calls,
/// and has zero side effects. All market data (APYs, fees, risk scores) must be
/// passed in by the caller — the optimizer never fetches them internally.
///
/// LOGIC FLOW (5 steps):
///   1. Compute gross yield for each destination using compound()
///   2. Apply fee deduction using fee_adjusted_yield()
///   3. Derive net APY BPS for each destination from net yield / principal
///   4. Compute optimal allocation split using risk-adjusted mean-variance model
///   5. Project final blended APY and expected absolute yield for the full position
///
/// ERROR PROPAGATION:
/// All MathError variants from math_lib are wrapped in OptimizerError::Math and
/// propagated up. The Solidity caller checks the return code and, on error, aborts
/// the XCM dispatch and emits a FailedOptimization event rather than proceeding
/// with a yield loop built on corrupt math.

use crate::math_lib::{self, BPS_DENOMINATOR, MathError};

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Clone)]
pub enum OptimizerError {
    /// Wraps any arithmetic error from math_lib.
    Math(MathError),
    /// Logically invalid inputs that pass individual field validation but fail
    /// cross-field consistency checks (e.g. zero principal, zero periods).
    InvalidInput,
}

impl From<MathError> for OptimizerError {
    fn from(e: MathError) -> Self {
        OptimizerError::Math(e)
    }
}

pub type OptimizerResult<T> = Result<T, OptimizerError>;

// ---------------------------------------------------------------------------
// Input / Output structs
// ---------------------------------------------------------------------------

/// Represents the ABI-encoded calldata passed from AtomicYieldExecutor.sol.
///
/// All APY and fee values are in basis points (BPS). Risk scores are integers
/// in [0, 10_000]. The principal is in fixed-point DOT with 18 decimal places.
/// Projection periods define the number of compounding intervals the optimizer
/// should simulate (typically 365 for daily compounding over one year).
#[derive(Debug, Clone)]
pub struct OptimizerInput {
    /// Total DOT being allocated in this yield cycle (18 decimal fixed-point).
    pub principal: u128,

    /// HydraDX omnipool gross annual yield in basis points (e.g. 1200 = 12%).
    pub hydradx_apy_bps: u32,

    /// Interlay vault gross annual yield in basis points (e.g. 900 = 9%).
    pub interlay_apy_bps: u32,

    /// HydraDX protocol fee in basis points applied to gross yield (e.g. 50 = 0.5%).
    pub hydradx_fee_bps: u32,

    /// Interlay protocol fee in basis points applied to gross yield (e.g. 100 = 1%).
    pub interlay_fee_bps: u32,

    /// HydraDX risk score in [0, 10_000]. Higher = riskier.
    pub hydradx_risk_score: u32,

    /// Interlay risk score in [0, 10_000]. Higher = riskier.
    pub interlay_risk_score: u32,

    /// Number of discrete compounding periods to project over.
    /// Use 365 for daily compounding, 12 for monthly, 52 for weekly.
    pub projection_periods: u32,
}

/// The recommendation struct returned to AtomicYieldExecutor.sol.
///
/// The Solidity contract ABI-decodes this and uses:
///   - use_hydradx / use_interlay: whether to include each leg in the XCM program
///   - *_allocation_pct: how to split the principal across two XCM dispatch calls
///   - projected_net_apy_bps: logged in the YieldLoopExecuted event on-chain
///   - expected_yield_dot: used for minimum-output slippage checks in the XCM Transact
#[derive(Debug, PartialEq, Clone)]
pub struct YieldRecommendation {
    /// Whether to dispatch a HydraDX XCM leg.
    pub use_hydradx: bool,

    /// Whether to dispatch an Interlay XCM leg.
    pub use_interlay: bool,

    /// Percentage of principal to allocate to HydraDX (0–100).
    pub hydradx_allocation_pct: u64,

    /// Percentage of principal to allocate to Interlay (0–100).
    /// hydradx_allocation_pct + interlay_allocation_pct == 100 always.
    pub interlay_allocation_pct: u64,

    /// Blended net APY across both destinations in basis points.
    pub projected_net_apy_bps: u32,

    /// Expected absolute DOT yield over the projection window (18 decimal fixed-point).
    /// This is the total return, not annualised — it corresponds directly to the
    /// `projection_periods` window the caller specified.
    pub expected_yield_dot: u128,
}

// ---------------------------------------------------------------------------
// Core optimizer function
// ---------------------------------------------------------------------------

/// Entry point called by AtomicYieldExecutor.sol.
///
/// Accepts an OptimizerInput and returns a YieldRecommendation or an error.
/// Every intermediate value is computed with checked arithmetic — no step can
/// silently overflow or underflow. On any error, return immediately; the Solidity
/// caller will abort the XCM dispatch.
pub fn optimize(input: &OptimizerInput) -> OptimizerResult<YieldRecommendation> {
    // --- Input validation ---
    if input.principal == 0 {
        return Err(OptimizerError::InvalidInput);
    }
    if input.projection_periods == 0 {
        return Err(OptimizerError::InvalidInput);
    }
    // Fee sanity: neither fee can exceed 100% (BPS_DENOMINATOR)
    if input.hydradx_fee_bps as u128 > BPS_DENOMINATOR
        || input.interlay_fee_bps as u128 > BPS_DENOMINATOR
    {
        return Err(OptimizerError::InvalidInput);
    }

    // --- Step 1: Gross compound yield for each destination ---
    //
    // Compound the full principal at each destination's gross APY over
    // projection_periods. Subtracting principal gives the gross yield in DOT.
    let hydradx_compounded =
        math_lib::compound(input.principal, input.hydradx_apy_bps, input.projection_periods)?;
    let hydradx_gross_yield = hydradx_compounded
        .checked_sub(input.principal)
        .ok_or(MathError::Underflow)?;

    let interlay_compounded =
        math_lib::compound(input.principal, input.interlay_apy_bps, input.projection_periods)?;
    let interlay_gross_yield = interlay_compounded
        .checked_sub(input.principal)
        .ok_or(MathError::Underflow)?;

    // --- Step 2: Apply fee deduction ---
    //
    // Fees are applied to the yield only, not to the principal.
    let hydradx_net_yield =
        math_lib::fee_adjusted_yield(hydradx_gross_yield, input.hydradx_fee_bps)?;
    let interlay_net_yield =
        math_lib::fee_adjusted_yield(interlay_gross_yield, input.interlay_fee_bps)?;

    // --- Step 3: Derive net APY BPS from net yield ---
    //
    // net_apy_bps = (net_yield / principal) * BPS_DENOMINATOR
    //
    // This represents the total return over the projection window expressed in
    // basis points relative to principal. It is NOT annualised unless
    // projection_periods == 365 with daily compounding. The optimizer compares
    // these figures on a like-for-like basis (same projection window), so
    // annualisation is not required for the comparison to be valid.
    let hydradx_net_apy_bps = (hydradx_net_yield
        .checked_mul(BPS_DENOMINATOR)
        .ok_or(MathError::Overflow)?
        .checked_div(input.principal)
        .ok_or(MathError::DivisionByZero)?) as u32;

    let interlay_net_apy_bps = (interlay_net_yield
        .checked_mul(BPS_DENOMINATOR)
        .ok_or(MathError::Overflow)?
        .checked_div(input.principal)
        .ok_or(MathError::DivisionByZero)?) as u32;

    // --- Step 4: Optimal risk-adjusted split ---
    //
    // Calls math_lib::optimal_split which applies mean-variance penalisation
    // and returns allocation percentages that sum to exactly 100.
    let (hydradx_pct, interlay_pct) = math_lib::optimal_split(
        hydradx_net_apy_bps,
        interlay_net_apy_bps,
        input.hydradx_risk_score,
        input.interlay_risk_score,
    )?;

    // --- Step 5: Blended APY and expected absolute yield ---
    //
    // Split the principal according to the recommended percentages, compound each
    // leg independently at its net APY, and compute total expected yield.
    // The blended APY is the capital-weighted average of both net APYs.

    let hydradx_principal = input
        .principal
        .checked_mul(hydradx_pct as u128)
        .ok_or(MathError::Overflow)?
        .checked_div(100)
        .ok_or(MathError::DivisionByZero)?;

    // Interlay gets the remainder to ensure principal_h + principal_i == principal
    // exactly, eliminating rounding drift from integer division.
    let interlay_principal = input
        .principal
        .checked_sub(hydradx_principal)
        .ok_or(MathError::Underflow)?;

    let hydradx_final =
        math_lib::compound(hydradx_principal, hydradx_net_apy_bps, input.projection_periods)?;
    let interlay_final =
        math_lib::compound(interlay_principal, interlay_net_apy_bps, input.projection_periods)?;

    let total_final = hydradx_final
        .checked_add(interlay_final)
        .ok_or(MathError::Overflow)?;

    let expected_yield_dot = total_final
        .checked_sub(input.principal)
        .ok_or(MathError::Underflow)?;

    let blended_apy_bps = math_lib::weighted_average(
        &[hydradx_net_apy_bps as u128, interlay_net_apy_bps as u128],
        &[hydradx_pct as u128, interlay_pct as u128],
    )? as u32;

    Ok(YieldRecommendation {
        use_hydradx: hydradx_pct > 0,
        use_interlay: interlay_pct > 0,
        hydradx_allocation_pct: hydradx_pct,
        interlay_allocation_pct: interlay_pct,
        projected_net_apy_bps: blended_apy_bps,
        expected_yield_dot,
    })
}