/// pallet-revive precompile wrapper for math_lib.
///
/// This precompile exposes individual math_lib functions as callable endpoints
/// from Solidity. Each function is identified by a 4-byte selector (matching
/// Solidity's function selector convention) prepended to the calldata.
///
/// REGISTERED ADDRESS: MATH_LIB_PRECOMPILE_ADDRESS (defined in precompile_set.rs)
///
/// FUNCTION SELECTORS (keccak256 of signature, first 4 bytes):
///   compound(uint128,uint32,uint32)           → 0x1a2b3c4d  (placeholder — compute with cast)
///   annualize(uint32,uint64)                  → 0x2b3c4d5e
///   feeAdjustedYield(uint128,uint32)          → 0x3c4d5e6f
///   weightedAverage(uint128[],uint128[])      → 0x4d5e6f7a
///   optimalSplit(uint32,uint32,uint32,uint32) → 0x5e6f7a8b
///
/// NOTE: Replace the placeholder selectors above with actual keccak256 values
///
/// DISPATCH MODEL:
/// The `call` function reads the first 4 bytes of input as the selector, routes
/// to the matching handler, decodes the remaining bytes as ABI-encoded arguments,
/// executes the math function, and returns ABI-encoded output. On any error it
/// returns an ABI-encoded (bool success=false, uint32 errorCode) tuple.

use ethabi::{decode, encode, ParamType, Token};
use pallet_revive::evm::Ext;
use crate::math_lib::{
    self, MathError, PRECISION
};
use crate::abi::encode_error;

// ---------------------------------------------------------------------------
// Function selectors
// ---------------------------------------------------------------------------
// These must match exactly what resolc generates for the Solidity call sites
// in AtomicYieldExecutor.sol. Compute with: cast sig "fnName(types)"

const SEL_COMPOUND: [u8; 4]            = [0x1a, 0x2b, 0x3c, 0x4d]; // compound(uint128,uint32,uint32)
const SEL_ANNUALIZE: [u8; 4]           = [0x2b, 0x3c, 0x4d, 0x5e]; // annualize(uint32,uint64)
const SEL_FEE_ADJUSTED: [u8; 4]        = [0x3c, 0x4d, 0x5e, 0x6f]; // feeAdjustedYield(uint128,uint32)
const SEL_WEIGHTED_AVG: [u8; 4]        = [0x4d, 0x5e, 0x6f, 0x7a]; // weightedAverage(uint128[],uint128[])
const SEL_OPTIMAL_SPLIT: [u8; 4]       = [0x5e, 0x6f, 0x7a, 0x8b]; // optimalSplit(uint32,uint32,uint32,uint32)

// ---------------------------------------------------------------------------
// Error codes (must stay in sync with abi.rs and AtomicYieldExecutor.sol)
// ---------------------------------------------------------------------------

const ERR_INVALID_INPUT: u32   = 1;
const ERR_OVERFLOW: u32        = 2;
const ERR_UNDERFLOW: u32       = 3;
const ERR_DIVISION_BY_ZERO: u32 = 4;
const ERR_UNKNOWN_SELECTOR: u32 = 5;
const ERR_DECODE_FAILED: u32   = 6;

fn math_error_code(e: &MathError) -> u32 {
    match e {
        MathError::InvalidInput    => ERR_INVALID_INPUT,
        MathError::Overflow        => ERR_OVERFLOW,
        MathError::Underflow       => ERR_UNDERFLOW,
        MathError::DivisionByZero  => ERR_DIVISION_BY_ZERO,
    }
}

// ---------------------------------------------------------------------------
// Main precompile entry point
// ---------------------------------------------------------------------------

/// Called by the pallet-revive runtime for every contract call targeting
/// MATH_LIB_PRECOMPILE_ADDRESS. `input` is the raw calldata bytes sent from
/// the Solidity caller. Returns ABI-encoded output bytes.
///
/// The first 4 bytes are consumed as the function selector. The remainder is
/// passed to the appropriate handler for ABI decoding. If the selector is
/// unrecognised the call returns an encoded error rather than panicking.
pub fn call(input: &[u8]) -> Vec<u8> {
    if input.len() < 4 {
        return encode_error(ERR_DECODE_FAILED);
    }

    let selector: [u8; 4] = input[0..4].try_into().unwrap();
    let args = &input[4..];

    match selector {
        SEL_COMPOUND       => handle_compound(args),
        SEL_ANNUALIZE      => handle_annualize(args),
        SEL_FEE_ADJUSTED   => handle_fee_adjusted_yield(args),
        SEL_WEIGHTED_AVG   => handle_weighted_average(args),
        SEL_OPTIMAL_SPLIT  => handle_optimal_split(args),
        _                  => encode_error(ERR_UNKNOWN_SELECTOR),
    }
}

// ---------------------------------------------------------------------------
// Handlers — one per math_lib function
// ---------------------------------------------------------------------------

/// compound(uint128 principal, uint32 rate_bps, uint32 periods) → uint128
fn handle_compound(args: &[u8]) -> Vec<u8> {
    let tokens = match decode(
        &[ParamType::Uint(128), ParamType::Uint(32), ParamType::Uint(32)],
        args,
    ) {
        Ok(t) => t,
        Err(_) => return encode_error(ERR_DECODE_FAILED),
    };

    let principal = match tokens[0].clone().into_uint() {
        Some(v) => v.as_u128(),
        None => return encode_error(ERR_DECODE_FAILED),
    };
    let rate_bps = match tokens[1].clone().into_uint() {
        Some(v) => v.as_u32(),
        None => return encode_error(ERR_DECODE_FAILED),
    };
    let periods = match tokens[2].clone().into_uint() {
        Some(v) => v.as_u32(),
        None => return encode_error(ERR_DECODE_FAILED),
    };

    match math_lib::compound(principal, rate_bps, periods) {
        Ok(result) => encode(&[Token::Bool(true), Token::Uint(result.into())]),
        Err(e)     => encode_error(math_error_code(&e)),
    }
}

/// annualize(uint32 rate_bps, uint64 period_seconds) → uint32
fn handle_annualize(args: &[u8]) -> Vec<u8> {
    let tokens = match decode(
        &[ParamType::Uint(32), ParamType::Uint(64)],
        args,
    ) {
        Ok(t) => t,
        Err(_) => return encode_error(ERR_DECODE_FAILED),
    };

    let rate_bps = match tokens[0].clone().into_uint() {
        Some(v) => v.as_u32(),
        None => return encode_error(ERR_DECODE_FAILED),
    };
    let period_seconds = match tokens[1].clone().into_uint() {
        Some(v) => v.as_u64(),
        None => return encode_error(ERR_DECODE_FAILED),
    };

    match math_lib::annualize(rate_bps, period_seconds) {
        Ok(result) => encode(&[Token::Bool(true), Token::Uint(result.into())]),
        Err(e)     => encode_error(math_error_code(&e)),
    }
}

/// feeAdjustedYield(uint128 gross_yield, uint32 fee_bps) → uint128
fn handle_fee_adjusted_yield(args: &[u8]) -> Vec<u8> {
    let tokens = match decode(
        &[ParamType::Uint(128), ParamType::Uint(32)],
        args,
    ) {
        Ok(t) => t,
        Err(_) => return encode_error(ERR_DECODE_FAILED),
    };

    let gross_yield = match tokens[0].clone().into_uint() {
        Some(v) => v.as_u128(),
        None => return encode_error(ERR_DECODE_FAILED),
    };
    let fee_bps = match tokens[1].clone().into_uint() {
        Some(v) => v.as_u32(),
        None => return encode_error(ERR_DECODE_FAILED),
    };

    match math_lib::fee_adjusted_yield(gross_yield, fee_bps) {
        Ok(result) => encode(&[Token::Bool(true), Token::Uint(result.into())]),
        Err(e)     => encode_error(math_error_code(&e)),
    }
}

/// weightedAverage(uint128[] values, uint128[] weights) → uint128
///
/// Dynamic arrays are encoded in Solidity as:
///   offset_to_values | offset_to_weights | length_v | v[0] | ... | length_w | w[0] | ...
/// ethabi handles this via ParamType::Array.
fn handle_weighted_average(args: &[u8]) -> Vec<u8> {
    let types = vec![
        ParamType::Array(Box::new(ParamType::Uint(128))),
        ParamType::Array(Box::new(ParamType::Uint(128))),
    ];

    let tokens = match decode(&types, args) {
        Ok(t) => t,
        Err(_) => return encode_error(ERR_DECODE_FAILED),
    };

    let values_tokens = match tokens[0].clone().into_array() {
        Some(v) => v,
        None => return encode_error(ERR_DECODE_FAILED),
    };
    let weights_tokens = match tokens[1].clone().into_array() {
        Some(v) => v,
        None => return encode_error(ERR_DECODE_FAILED),
    };

    let values: Vec<u128> = match values_tokens.iter()
        .map(|t| t.clone().into_uint().map(|u| u.as_u128()))
        .collect::<Option<Vec<_>>>()
    {
        Some(v) => v,
        None => return encode_error(ERR_DECODE_FAILED),
    };

    let weights: Vec<u128> = match weights_tokens.iter()
        .map(|t| t.clone().into_uint().map(|u| u.as_u128()))
        .collect::<Option<Vec<_>>>()
    {
        Some(v) => v,
        None => return encode_error(ERR_DECODE_FAILED),
    };

    match math_lib::weighted_average(&values, &weights) {
        Ok(result) => encode(&[Token::Bool(true), Token::Uint(result.into())]),
        Err(e)     => encode_error(math_error_code(&e)),
    }
}

/// optimalSplit(uint32 yield_a, uint32 yield_b, uint32 risk_a, uint32 risk_b)
///     → (uint64 pct_a, uint64 pct_b)
fn handle_optimal_split(args: &[u8]) -> Vec<u8> {
    let tokens = match decode(
        &[
            ParamType::Uint(32),
            ParamType::Uint(32),
            ParamType::Uint(32),
            ParamType::Uint(32),
        ],
        args,
    ) {
        Ok(t) => t,
        Err(_) => return encode_error(ERR_DECODE_FAILED),
    };

    let yield_a = match tokens[0].clone().into_uint() { Some(v) => v.as_u32(), None => return encode_error(ERR_DECODE_FAILED) };
    let yield_b = match tokens[1].clone().into_uint() { Some(v) => v.as_u32(), None => return encode_error(ERR_DECODE_FAILED) };
    let risk_a  = match tokens[2].clone().into_uint() { Some(v) => v.as_u32(), None => return encode_error(ERR_DECODE_FAILED) };
    let risk_b  = match tokens[3].clone().into_uint() { Some(v) => v.as_u32(), None => return encode_error(ERR_DECODE_FAILED) };

    match math_lib::optimal_split(yield_a, yield_b, risk_a, risk_b) {
        Ok((pct_a, pct_b)) => encode(&[
            Token::Bool(true),
            Token::Uint(pct_a.into()),
            Token::Uint(pct_b.into()),
        ]),
        Err(e) => encode_error(math_error_code(&e)),
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

    fn build_input(selector: [u8; 4], args: Vec<u8>) -> Vec<u8> {
        let mut input = selector.to_vec();
        input.extend(args);
        input
    }

    /// compound dispatch — happy path round-trip
    #[test]
    fn test_dispatch_compound_happy_path() {
        let args = encode(&[
            Token::Uint((1_000u128 * PRECISION).into()),
            Token::Uint(1_000u32.into()),
            Token::Uint(1u32.into()),
        ]);
        let result = call(&build_input(SEL_COMPOUND, args));
        // First word = true (success)
        assert_eq!(result[31], 1u8, "Success flag must be true");
        // Second word must be > principal (yield was added)
        // (1000 * PRECISION) * 11000 / 10000 = 1100 * PRECISION
        let expected = 1_100u128 * PRECISION;
        let returned = u128::from_be_bytes(result[48..64].try_into().unwrap());
        assert_eq!(returned, expected);
    }

    /// Unknown selector must return error, not panic
    #[test]
    fn test_unknown_selector_returns_error() {
        let input = build_input([0xde, 0xad, 0xbe, 0xef], vec![]);
        let result = call(&input);
        // First word = false (failure)
        assert_eq!(result[31], 0u8, "Unknown selector must return failure");
    }

    /// Input too short (less than 4 bytes) must return error
    #[test]
    fn test_input_too_short_returns_error() {
        let result = call(&[0x01, 0x02]);
        assert_eq!(result[31], 0u8, "Short input must return failure");
    }

    /// annualize dispatch — 1 year should return same rate
    #[test]
    fn test_dispatch_annualize_one_year() {
        let args = encode(&[
            Token::Uint(500u32.into()),
            Token::Uint(31_536_000u64.into()),
        ]);
        let result = call(&build_input(SEL_ANNUALIZE, args));
        assert_eq!(result[31], 1u8, "Annualize must succeed");
    }

    /// optimalSplit dispatch — equal inputs should give 50/50
    #[test]
    fn test_dispatch_optimal_split_equal() {
        let args = encode(&[
            Token::Uint(1_000u32.into()),
            Token::Uint(1_000u32.into()),
            Token::Uint(1_000u32.into()),
            Token::Uint(1_000u32.into()),
        ]);
        let result = call(&build_input(SEL_OPTIMAL_SPLIT, args));
        assert_eq!(result[31], 1u8, "OptimalSplit must succeed");
        // pct_a is in second word (bytes 32–63)
        let pct_a = result[63] as u64;
        // pct_b is in third word (bytes 64–95)
        let pct_b = result[95] as u64;
        assert_eq!(pct_a + pct_b, 100);
    }
}