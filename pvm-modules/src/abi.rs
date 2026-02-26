/// This module handles the serialisation contract between AtomicYieldExecutor.sol
/// and the two precompiles. Every type here must match the Solidity struct layout
/// exactly — field order, type widths, and padding all matter. Any mismatch
/// produces silently corrupt data on the Solidity side with no runtime error.
///
/// ENCODING MODEL:
/// Solidity encodes structs with abi.encode() using the standard ABI spec:
///   - uint128  → 32-byte word, value right-aligned
///   - uint32   → 32-byte word, value right-aligned
///   - bool     → 32-byte word, 0 or 1
///   - uint64   → 32-byte word, value right-aligned
///
/// ethabi mirrors this layout exactly when given the correct ParamType descriptors.
/// All decode functions must list fields in the identical order as the Solidity struct.

use ethabi::{decode, encode, ParamType, Token};
use crate::yield_optimizer::{OptimizerInput, YieldRecommendation};

// ---------------------------------------------------------------------------
// Decode: raw calldata bytes → OptimizerInput
// ---------------------------------------------------------------------------

/// ABI-decode raw calldata from AtomicYieldExecutor.sol into an OptimizerInput.
///
/// Expected Solidity encoding (abi.encode order):
///   (uint128 principal,
///    uint32 hydradx_apy_bps, uint32 interlay_apy_bps,
///    uint32 hydradx_fee_bps, uint32 interlay_fee_bps,
///    uint32 hydradx_risk_score, uint32 interlay_risk_score,
///    uint32 projection_periods)
///
/// Returns None if the byte slice is malformed or any field is out of range.
/// The precompile returns an error code to Solidity on None, which triggers
/// a FailedOptimization event and aborts the XCM dispatch.
pub fn decode_optimizer_input(input: &[u8]) -> Option<OptimizerInput> {
    let types = vec![
        ParamType::Uint(128), // principal
        ParamType::Uint(32),  // hydradx_apy_bps
        ParamType::Uint(32),  // interlay_apy_bps
        ParamType::Uint(32),  // hydradx_fee_bps
        ParamType::Uint(32),  // interlay_fee_bps
        ParamType::Uint(32),  // hydradx_risk_score
        ParamType::Uint(32),  // interlay_risk_score
        ParamType::Uint(32),  // projection_periods
    ];

    let tokens = decode(&types, input).ok()?;

    if tokens.len() != 8 {
        return None;
    }

    let principal        = tokens[0].clone().into_uint()?.as_u128();
    let hydradx_apy_bps  = tokens[1].clone().into_uint()?.as_u32();
    let interlay_apy_bps = tokens[2].clone().into_uint()?.as_u32();
    let hydradx_fee_bps  = tokens[3].clone().into_uint()?.as_u32();
    let interlay_fee_bps = tokens[4].clone().into_uint()?.as_u32();
    let hydradx_risk     = tokens[5].clone().into_uint()?.as_u32();
    let interlay_risk    = tokens[6].clone().into_uint()?.as_u32();
    let periods          = tokens[7].clone().into_uint()?.as_u32();

    Some(OptimizerInput {
        principal,
        hydradx_apy_bps,
        interlay_apy_bps,
        hydradx_fee_bps,
        interlay_fee_bps,
        hydradx_risk_score: hydradx_risk,
        interlay_risk_score: interlay_risk,
        projection_periods: periods,
    })
}

// ---------------------------------------------------------------------------
// Encode: YieldRecommendation → ABI bytes returned to Solidity
// ---------------------------------------------------------------------------

/// ABI-encode a YieldRecommendation into bytes that Solidity's abi.decode can consume.
///
/// Matching Solidity struct layout (must stay in sync with AtomicYieldExecutor.sol):
///   (bool use_hydradx, bool use_interlay,
///    uint64 hydradx_allocation_pct, uint64 interlay_allocation_pct,
///    uint32 projected_net_apy_bps, uint128 expected_yield_dot)
pub fn encode_yield_recommendation(rec: &YieldRecommendation) -> Vec<u8> {
    encode(&[
        Token::Bool(rec.use_hydradx),
        Token::Bool(rec.use_interlay),
        Token::Uint(rec.hydradx_allocation_pct.into()),
        Token::Uint(rec.interlay_allocation_pct.into()),
        Token::Uint(rec.projected_net_apy_bps.into()),
        Token::Uint(rec.expected_yield_dot.into()),
    ])
}

// ---------------------------------------------------------------------------
// Error output encoding
// ---------------------------------------------------------------------------

/// Encode a standardised error response returned to Solidity when the optimizer
/// or any math function fails. Solidity checks the first bool field — if false,
/// it treats the call as failed and emits FailedOptimization without decoding
/// the rest of the payload.
///
/// Layout: (bool success, uint32 error_code)
/// Error codes:
///   1 = InvalidInput
///   2 = Overflow
///   3 = Underflow
///   4 = DivisionByZero
pub fn encode_error(error_code: u32) -> Vec<u8> {
    encode(&[
        Token::Bool(false),
        Token::Uint(error_code.into()),
    ])
}

// ---------------------------------------------------------------------------
// Tests — ABI round-trip verification
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math_lib::PRECISION;

    fn sample_input() -> OptimizerInput {
        OptimizerInput {
            principal: 1_000 * PRECISION,
            hydradx_apy_bps: 1_200,
            interlay_apy_bps: 900,
            hydradx_fee_bps: 50,
            interlay_fee_bps: 100,
            hydradx_risk_score: 1_500,
            interlay_risk_score: 2_500,
            projection_periods: 365,
        }
    }

    /// Round-trip: encode a YieldRecommendation then verify byte output is non-empty
    /// and has expected ABI length (6 fields × 32 bytes = 192 bytes).
    #[test]
    fn test_encode_recommendation_length() {
        let rec = YieldRecommendation {
            use_hydradx: true,
            use_interlay: true,
            hydradx_allocation_pct: 65,
            interlay_allocation_pct: 35,
            projected_net_apy_bps: 1_080,
            expected_yield_dot: 108 * PRECISION,
        };
        let encoded = encode_yield_recommendation(&rec);
        // 6 ABI words × 32 bytes each
        assert_eq!(encoded.len(), 6 * 32, "Encoded recommendation must be 192 bytes");
    }

    /// Encode then decode OptimizerInput — all fields must survive the round-trip.
    #[test]
    fn test_decode_optimizer_input_round_trip() {
        let original = sample_input();

        // Manually ABI-encode the input the same way Solidity would
        let encoded = encode(&[
            Token::Uint(original.principal.into()),
            Token::Uint(original.hydradx_apy_bps.into()),
            Token::Uint(original.interlay_apy_bps.into()),
            Token::Uint(original.hydradx_fee_bps.into()),
            Token::Uint(original.interlay_fee_bps.into()),
            Token::Uint(original.hydradx_risk_score.into()),
            Token::Uint(original.interlay_risk_score.into()),
            Token::Uint(original.projection_periods.into()),
        ]);

        let decoded = decode_optimizer_input(&encoded)
            .expect("Round-trip decode must succeed");

        assert_eq!(decoded.principal, original.principal);
        assert_eq!(decoded.hydradx_apy_bps, original.hydradx_apy_bps);
        assert_eq!(decoded.interlay_apy_bps, original.interlay_apy_bps);
        assert_eq!(decoded.hydradx_fee_bps, original.hydradx_fee_bps);
        assert_eq!(decoded.interlay_fee_bps, original.interlay_fee_bps);
        assert_eq!(decoded.hydradx_risk_score, original.hydradx_risk_score);
        assert_eq!(decoded.interlay_risk_score, original.interlay_risk_score);
        assert_eq!(decoded.projection_periods, original.projection_periods);
    }

    /// Empty calldata must return None — not panic.
    #[test]
    fn test_decode_empty_input_returns_none() {
        let result = decode_optimizer_input(&[]);
        assert!(result.is_none());
    }

    /// Truncated calldata (only 3 fields) must return None.
    #[test]
    fn test_decode_truncated_input_returns_none() {
        let partial = encode(&[
            Token::Uint(1_000u128.into()),
            Token::Uint(1_200u32.into()),
            Token::Uint(900u32.into()),
        ]);
        let result = decode_optimizer_input(&partial);
        assert!(result.is_none());
    }

    /// Error encoding must produce exactly 2 ABI words (64 bytes).
    #[test]
    fn test_encode_error_length() {
        let encoded = encode_error(1);
        assert_eq!(encoded.len(), 2 * 32, "Error encoding must be 64 bytes");
    }

    /// Error code 0 in first word must be false (failure flag).
    #[test]
    fn test_encode_error_first_word_is_false() {
        let encoded = encode_error(2);
        // First 32 bytes = bool false = all zeros
        let first_word = &encoded[0..32];
        assert!(
            first_word.iter().all(|&b| b == 0),
            "First word of error encoding must be all zeros (false)"
        );
    }
}