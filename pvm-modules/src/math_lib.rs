/// All financial math primitives for the PolkaPulse yield optimizer.
///
/// PRECISION MODEL:
/// All DOT amounts are represented as u128 fixed-point integers with 18 decimal
/// places of precision. 1 DOT = 1_000_000_000_000_000_000 units.
/// This matches Ethereum's wei model and avoids any floating-point arithmetic,
/// which is non-deterministic across validator nodes and therefore forbidden in
/// PVM execution.
///
/// OVERFLOW STRATEGY:
/// Every multiplication and addition uses Rust's checked_* variants. Any overflow
/// returns MathError::Overflow immediately — no silent wrapping, no undefined
/// behaviour. The caller (yield_optimizer.rs) propagates errors up to the Solidity
/// layer, which handles them as a failed optimizer call and aborts the XCM dispatch.

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Fixed-point precision denominator. All DOT amounts use 18 decimal places.
/// 1 DOT = PRECISION units.
pub const PRECISION: u128 = 1_000_000_000_000_000_000;

/// Basis points denominator. 1 BPS = 0.01%. 100% = 10_000 BPS.
pub const BPS_DENOMINATOR: u128 = 10_000;

/// Number of seconds in a standard 365-day year. Used for APY normalisation.
pub const SECONDS_PER_YEAR: u128 = 31_536_000;

/// Maximum permitted risk score. Risk is expressed as an integer 0–10_000
/// where 0 = zero risk and 10_000 = maximum (total loss expected). Any score
/// above this bound is rejected as invalid input.
pub const MAX_RISK_SCORE: u128 = 10_000;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

#[derive(Debug, PartialEq, Clone)]
pub enum MathError {
    /// An arithmetic operation would have overflowed u128.
    Overflow,
    /// An arithmetic operation would have produced a negative result in unsigned space.
    Underflow,
    /// A divisor was zero.
    DivisionByZero,
    /// One or more input arguments are logically invalid (e.g. fee > 100%).
    InvalidInput,
}

pub type MathResult<T> = Result<T, MathError>;

// ---------------------------------------------------------------------------
// compound
// ---------------------------------------------------------------------------

/// Compound interest over a discrete number of periods.
///
/// Computes A = P × (1 + r/n)^n where:
///   P = `principal`  (fixed-point DOT, 18 decimals)
///   r = `rate_bps`   (annual rate in basis points, e.g. 1000 = 10%)
///   n = `periods`    (number of compounding intervals, e.g. 365 for daily)
///
/// Implementation uses iterative multiplication rather than exponentiation to
/// keep per-step cost predictable and avoid u128 overflow from large exponents.
///
/// At each step:
///   amount = amount × (BPS_DENOMINATOR × periods + rate_bps)
///                   ÷ (BPS_DENOMINATOR × periods)
///
/// This is equivalent to multiplying by (1 + rate_bps / (BPS_DENOMINATOR × periods))
/// at each of the `periods` steps, which correctly models continuous-period compounding.
///
/// Returns the compounded amount (principal + yield). To isolate yield, subtract
/// the original principal from the result.
///
/// # Overflow analysis
/// Worst case per step: amount × numerator_factor.
/// For 1B DOT principal (1e27 units) and numerator_factor ≈ 3_651_000 (365 periods,
/// 1000 bps), intermediate value ≈ 3.65e33. u128 max ≈ 1.7e38. Safe.
pub fn compound(principal: u128, rate_bps: u32, periods: u32) -> MathResult<u128> {
    if principal == 0 {
        return Ok(0);
    }
    if rate_bps == 0 || periods == 0 {
        return Ok(principal);
    }

    // numerator_factor = BPS_DENOMINATOR * periods + rate_bps
    // denominator_factor = BPS_DENOMINATOR * periods
    // Each iteration: amount = amount * numerator_factor / denominator_factor
    let denominator_factor = BPS_DENOMINATOR
        .checked_mul(periods as u128)
        .ok_or(MathError::Overflow)?;

    let numerator_factor = denominator_factor
        .checked_add(rate_bps as u128)
        .ok_or(MathError::Overflow)?;

    let mut amount = principal;

    for _ in 0..periods {
        amount = amount
            .checked_mul(numerator_factor)
            .ok_or(MathError::Overflow)?
            .checked_div(denominator_factor)
            .ok_or(MathError::DivisionByZero)?;
    }

    Ok(amount)
}

// ---------------------------------------------------------------------------
// annualize
// ---------------------------------------------------------------------------

/// Normalise an observed yield rate to an annual basis.
///
/// HydraDX reports LP fee yield per block; Interlay reports vault yield per epoch.
/// Before any comparison between destinations, all rates must be expressed on the
/// same time axis. This function converts a rate measured over an arbitrary window
/// of `period_seconds` into an annualised APY expressed in basis points.
///
/// Formula: annual_rate_bps = rate_bps × SECONDS_PER_YEAR ÷ period_seconds
///
/// Returns MathError::DivisionByZero if period_seconds is 0.
/// Returns MathError::Overflow if the annualised figure exceeds u32::MAX BPS
/// (which would represent a ludicrous APY and indicates a data error).
pub fn annualize(rate_bps: u32, period_seconds: u64) -> MathResult<u32> {
    if period_seconds == 0 {
        return Err(MathError::DivisionByZero);
    }

    let annual = (rate_bps as u128)
        .checked_mul(SECONDS_PER_YEAR)
        .ok_or(MathError::Overflow)?
        .checked_div(period_seconds as u128)
        .ok_or(MathError::DivisionByZero)?;

    if annual > u32::MAX as u128 {
        return Err(MathError::Overflow);
    }

    Ok(annual as u32)
}

// ---------------------------------------------------------------------------
// fee_adjusted_yield
// ---------------------------------------------------------------------------

/// Deduct protocol fee from a gross yield figure to produce net yield.
///
/// Both HydraDX and Interlay charge protocol fees on yield generated. Comparing
/// gross yields without fee deduction would produce incorrect allocation decisions.
/// This function must be applied to every yield figure before it enters the
/// optimizer's comparison logic.
///
/// Formula: net_yield = gross_yield - (gross_yield × fee_bps ÷ BPS_DENOMINATOR)
///
/// fee_bps must be ≤ BPS_DENOMINATOR (i.e. ≤ 100%). A fee above 100% is
/// logically invalid and returns MathError::InvalidInput.
pub fn fee_adjusted_yield(gross_yield: u128, fee_bps: u32) -> MathResult<u128> {
    if fee_bps as u128 > BPS_DENOMINATOR {
        return Err(MathError::InvalidInput);
    }
    if gross_yield == 0 || fee_bps == 0 {
        return Ok(gross_yield);
    }

    let fee = gross_yield
        .checked_mul(fee_bps as u128)
        .ok_or(MathError::Overflow)?
        .checked_div(BPS_DENOMINATOR)
        .ok_or(MathError::DivisionByZero)?;

    gross_yield.checked_sub(fee).ok_or(MathError::Underflow)
}

// ---------------------------------------------------------------------------
// weighted_average
// ---------------------------------------------------------------------------

/// Capital-weighted average across multiple yield positions.
///
/// Used to compute the blended APY of a split allocation — e.g. if 60% of
/// capital goes to HydraDX at 1200 BPS and 40% to Interlay at 900 BPS, the
/// weighted average APY is:
///   (1200 × 60 + 900 × 40) ÷ (60 + 40) = 1080 BPS
///
/// `values` and `weights` must be the same length and non-empty.
/// All weights must be non-zero or the function returns DivisionByZero.
///
/// Returns MathError::InvalidInput if slice lengths differ or either is empty.
pub fn weighted_average(values: &[u128], weights: &[u128]) -> MathResult<u128> {
    if values.is_empty() || values.len() != weights.len() {
        return Err(MathError::InvalidInput);
    }

    let mut weighted_sum: u128 = 0;
    let mut total_weight: u128 = 0;

    for (v, w) in values.iter().zip(weights.iter()) {
        let product = v.checked_mul(*w).ok_or(MathError::Overflow)?;
        weighted_sum = weighted_sum
            .checked_add(product)
            .ok_or(MathError::Overflow)?;
        total_weight = total_weight
            .checked_add(*w)
            .ok_or(MathError::Overflow)?;
    }

    if total_weight == 0 {
        return Err(MathError::DivisionByZero);
    }

    weighted_sum
        .checked_div(total_weight)
        .ok_or(MathError::DivisionByZero)
}

// ---------------------------------------------------------------------------
// optimal_split
// ---------------------------------------------------------------------------

/// Compute the optimal capital allocation split between two yield destinations.
///
/// Applies a simplified mean-variance optimisation:
///   risk_adjusted_yield = yield × (MAX_RISK_SCORE - risk) ÷ MAX_RISK_SCORE
///
/// A destination with higher risk receives a proportional yield penalty.
/// The allocation is then set proportional to the risk-adjusted yields:
///   pct_a = risk_adjusted_a × 100 ÷ (risk_adjusted_a + risk_adjusted_b)
///   pct_b = 100 - pct_a  (guarantees sum is exactly 100)
///
/// Risk scores must be in range [0, MAX_RISK_SCORE]. Scores above this
/// are rejected as InvalidInput.
///
/// Edge case: if both risk-adjusted yields are zero (both destinations look
/// equally unattractive), the function returns a 50/50 split rather than
/// erroring, allowing the XCM execution to proceed with a neutral allocation.
///
/// Returns (pct_a, pct_b) where pct_a + pct_b == 100 always.
pub fn optimal_split(
    yield_a_bps: u32,
    yield_b_bps: u32,
    risk_a: u32,
    risk_b: u32,
) -> MathResult<(u64, u64)> {
    if risk_a as u128 > MAX_RISK_SCORE || risk_b as u128 > MAX_RISK_SCORE {
        return Err(MathError::InvalidInput);
    }

    // risk_adjusted = yield × (MAX_RISK - risk) / MAX_RISK
    let adj_a = (yield_a_bps as u128)
        .checked_mul(
            MAX_RISK_SCORE
                .checked_sub(risk_a as u128)
                .ok_or(MathError::Underflow)?,
        )
        .ok_or(MathError::Overflow)?
        .checked_div(MAX_RISK_SCORE)
        .ok_or(MathError::DivisionByZero)?;

    let adj_b = (yield_b_bps as u128)
        .checked_mul(
            MAX_RISK_SCORE
                .checked_sub(risk_b as u128)
                .ok_or(MathError::Underflow)?,
        )
        .ok_or(MathError::Overflow)?
        .checked_div(MAX_RISK_SCORE)
        .ok_or(MathError::DivisionByZero)?;

    let total = adj_a.checked_add(adj_b).ok_or(MathError::Overflow)?;

    // Edge case: both destinations have zero risk-adjusted yield — split 50/50
    if total == 0 {
        return Ok((50, 50));
    }

    let pct_a = (adj_a
        .checked_mul(100)
        .ok_or(MathError::Overflow)?
        .checked_div(total)
        .ok_or(MathError::DivisionByZero)?) as u64;

    // Compute pct_b as remainder to guarantee pct_a + pct_b == 100 exactly,
    // eliminating any rounding drift from integer division.
    let pct_b = 100u64
        .checked_sub(pct_a)
        .ok_or(MathError::Underflow)?;

    Ok((pct_a, pct_b))
}