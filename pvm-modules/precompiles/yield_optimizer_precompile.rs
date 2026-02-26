/// pallet-revive precompile wrapper for yield_optimizer.
///
/// This is the primary precompile called by AtomicYieldExecutor.sol.
/// It exposes a single function — optimize() — which takes the full
/// OptimizerInput ABI-encoded struct and returns the full YieldRecommendation
/// ABI-encoded struct.
///
/// REGISTERED ADDRESS: YIELD_OPTIMIZER_PRECOMPILE_ADDRESS (defined in precompile_set.rs)
///
/// FUNCTION SELECTOR:
///   optimize(uint128,uint32,uint32,uint32,uint32,uint32,uint32,uint32) → 0x6f7a8b9c
///
/// NOTE: Compute the real selector with: cast sig "optimize(uint128,uint32,uint32,uint32,uint32,uint32,uint32,uint32)"
/// and update SEL_OPTIMIZE and AtomicYieldExecutor.sol to match before deployment.
///
/// ON ERROR:
/// Returns encode_error(error_code). AtomicYieldExecutor.sol checks the bool flag
/// in the first return word and reverts the XCM dispatch if false, emitting
/// FailedOptimization(errorCode). This prevents the protocol from executing a
/// yield loop built on corrupt or failed math output.

use ethabi::{decode, encode, ParamType, Token};
use crate::abi::{decode_optimizer_input, encode_yield_recommendation, encode_error};
use crate::yield_optimizer::{optimize, OptimizerError};
use crate::math_lib::MathError;

// ---------------------------------------------------------------------------
// Function selector
// ---------------------------------------------------------------------------

const SEL_OPTIMIZE: [u8; 4] = [0x6f, 0x7a, 0x8b, 0x9c]; // optimize(uint128,uint32×7)

// ---------------------------------------------------------------------------
// Error codes (must stay in sync with abi.rs and math_lib_precompile.rs)
// ---------------------------------------------------------------------------

const ERR_INVALID_INPUT: u32    = 1;
const ERR_OVERFLOW: u32         = 2;
const ERR_UNDERFLOW: u32        = 3;
const ERR_DIVISION_BY_ZERO: u32 = 4;
const ERR_UNKNOWN_SELECTOR: u32 = 5;
const ERR_DECODE_FAILED: u32    = 6;

fn optimizer_error_code(e: &OptimizerError) -> u32 {
    match e {
        OptimizerError::InvalidInput => ERR_INVALID_INPUT,
        OptimizerError::Math(m) => match m {
            MathError::Overflow       => ERR_OVERFLOW,
            MathError::Underflow      => ERR_UNDERFLOW,
            MathError::DivisionByZero => ERR_DIVISION_BY_ZERO,
            MathError::InvalidInput   => ERR_INVALID_INPUT,
        },
    }
}

// ---------------------------------------------------------------------------
// Main precompile entry point
// ---------------------------------------------------------------------------

/// Called by pallet-revive for every call targeting YIELD_OPTIMIZER_PRECOMPILE_ADDRESS.
///
/// Reads the 4-byte selector, verifies it matches SEL_OPTIMIZE, decodes
/// the calldata into OptimizerInput via abi.rs, runs the optimizer, and
/// encodes the YieldRecommendation back as ABI bytes.
///
/// Returns a (bool success, <fields>) ABI tuple. Solidity decodes it as:
///   (bool success, bool useHydraDX, bool useInterlay,
///    uint64 hydraDXPct, uint64 interlayPct,
///    uint32 netApyBps, uint128 expectedYieldDot)
pub fn call(input: &[u8]) -> Vec<u8> {
    if input.len() < 4 {
        return encode_error(ERR_DECODE_FAILED);
    }

    let selector: [u8; 4] = input[0..4].try_into().unwrap();

    if selector != SEL_OPTIMIZE {
        return encode_error(ERR_UNKNOWN_SELECTOR);
    }

    let args = &input[4..];

    // Decode calldata using the shared abi module
    let optimizer_input = match decode_optimizer_input(args) {
        Some(i) => i,
        None    => return encode_error(ERR_DECODE_FAILED),
    };

    // Run the optimizer
    match optimize(&optimizer_input) {
        Ok(recommendation) => {
            // Prepend success flag to the encoded recommendation
            let mut output = encode(&[Token::Bool(true)]);
            output.extend(encode_yield_recommendation(&recommendation));
            output
        }
        Err(e) => encode_error(optimizer_error_code(&e)),
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use ethabi::encode;
    use crate::math_lib::PRECISION;

    fn build_optimize_call(
        principal: u128,
        hydradx_apy: u32,
        interlay_apy: u32,
        hydradx_fee: u32,
        interlay_fee: u32,
        hydradx_risk: u32,
        interlay_risk: u32,
        periods: u32,
    ) -> Vec<u8> {
        let mut input = SEL_OPTIMIZE.to_vec();
        input.extend(encode(&[
            Token::Uint(principal.into()),
            Token::Uint(hydradx_apy.into()),
            Token::Uint(interlay_apy.into()),
            Token::Uint(hydradx_fee.into()),
            Token::Uint(interlay_fee.into()),
            Token::Uint(hydradx_risk.into()),
            Token::Uint(interlay_risk.into()),
            Token::Uint(periods.into()),
        ]));
        input
    }

    /// Happy path — realistic inputs must return success=true
    #[test]
    fn test_optimize_call_success_flag() {
        let input = build_optimize_call(
            1_000 * PRECISION,
            1_200, 900, 50, 100, 1_500, 2_500, 365,
        );
        let result = call(&input);
        assert!(result.len() >= 32, "Result must be at least 1 ABI word");
        // First word = true (success=1)
        assert_eq!(result[31], 1u8, "Success flag must be 1");
    }

    /// Zero principal must return failure
    #[test]
    fn test_optimize_call_zero_principal_returns_failure() {
        let input = build_optimize_call(0, 1_200, 900, 50, 100, 1_500, 2_500, 365);
        let result = call(&input);
        assert_eq!(result[31], 0u8, "Zero principal must return failure flag");
    }

    /// Zero periods must return failure
    #[test]
    fn test_optimize_call_zero_periods_returns_failure() {
        let input = build_optimize_call(
            1_000 * PRECISION, 1_200, 900, 50, 100, 1_500, 2_500, 0,
        );
        let result = call(&input);
        assert_eq!(result[31], 0u8, "Zero periods must return failure flag");
    }

    /// Wrong selector must return failure
    #[test]
    fn test_wrong_selector_returns_failure() {
        let mut input = vec![0xde, 0xad, 0xbe, 0xef];
        input.extend(encode(&[Token::Uint(1_000u128.into())]));
        let result = call(&input);
        assert_eq!(result[31], 0u8, "Wrong selector must return failure flag");
    }

    /// Input shorter than 4 bytes must return failure without panic
    #[test]
    fn test_short_input_returns_failure() {
        let result = call(&[0x01]);
        assert_eq!(result[31], 0u8);
    }

    /// Determinism: same input always produces same output bytes
    #[test]
    fn test_optimize_call_is_deterministic() {
        let input = build_optimize_call(
            500 * PRECISION, 800, 1_100, 30, 80, 2_000, 1_000, 52,
        );
        let r1 = call(&input);
        let r2 = call(&input);
        assert_eq!(r1, r2, "Precompile output must be deterministic");
    }

    /// Large principal — must succeed without overflow
    #[test]
    fn test_large_principal_no_overflow() {
        let input = build_optimize_call(
            1_000_000_000 * PRECISION,
            1_000, 800, 50, 100, 1_000, 2_000, 365,
        );
        let result = call(&input);
        assert_eq!(result[31], 1u8, "1B DOT must succeed without overflow");
    }
}