/// unit tests for math_lib and yield_optimizer.
///
/// Test philosophy mirrors the 5 priorities:
///   1. Fixed-point precision — verify no floating-point drift in math results
///   2. Pure/stateless — all tests confirm functions are deterministic given same inputs
///   3. Overflow/underflow boundaries — explicit tests at u128 edge values
///   4. ABI boundary — input/output struct field contracts are verified
///   5. Edge case coverage before integration — zero values, equal inputs, max values
///
/// Every function in math_lib has its own test module.
/// yield_optimizer has an integration-style test module that chains the full pipeline.

// ---------------------------------------------------------------------------
// math_lib tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod compound_tests {
    use crate::math_lib::{compound, MathError, BPS_DENOMINATOR, PRECISION};

    /// Zero principal should always return 0 regardless of rate or periods.
    #[test]
    fn test_zero_principal_returns_zero() {
        let result = compound(0, 1000, 365).unwrap();
        assert_eq!(result, 0);
    }

    /// Zero rate means no yield — principal is returned unchanged.
    #[test]
    fn test_zero_rate_returns_principal() {
        let principal = 100 * PRECISION; // 100 DOT
        let result = compound(principal, 0, 365).unwrap();
        assert_eq!(result, principal);
    }

    /// Zero periods means no time has passed — principal is returned unchanged.
    #[test]
    fn test_zero_periods_returns_principal() {
        let principal = 100 * PRECISION;
        let result = compound(principal, 1000, 0).unwrap();
        assert_eq!(result, principal);
    }

    /// Sanity: 10% APY daily-compounded over 365 periods should produce a result
    /// strictly greater than principal (yield > 0) and less than 2× principal
    /// (sanity upper bound for reasonable rates).
    #[test]
    fn test_basic_compounding_produces_yield() {
        let principal = 1_000 * PRECISION; // 1000 DOT
        let rate_bps = 1_000; // 10% APY
        let periods = 365; // daily compounding
        let result = compound(principal, rate_bps, periods).unwrap();

        assert!(result > principal, "Compounded amount must exceed principal");
        assert!(
            result < 2 * principal,
            "Compounded amount must be less than 2x principal for 10% APY"
        );

        let yield_amount = result - principal;
        // 10% of 1000 DOT = 100 DOT. Compounded daily should be slightly more than 100 DOT.
        assert!(yield_amount > 100 * PRECISION, "Yield must exceed simple 10%");
        assert!(yield_amount < 115 * PRECISION, "Yield must be below 11.5% (sanity)");
    }

    /// Compound at 1 BPS (0.01%) over 1 period — minimal rate sanity check.
    #[test]
    fn test_minimal_rate_one_period() {
        let principal = 1_000_000 * PRECISION; // 1M DOT — large enough to see 1 BPS effect
        let result = compound(principal, 1, 1).unwrap();
        // Expected: principal * (10_000 + 1) / 10_000
        let expected = principal * 10_001 / 10_000;
        assert_eq!(result, expected);
    }

    /// Increasing periods with same APY should produce strictly increasing yield.
    /// Validates monotonicity of the compounding function.
    #[test]
    fn test_more_periods_more_yield() {
        let principal = 1_000 * PRECISION;
        let rate_bps = 500; // 5% APY

        let result_12 = compound(principal, rate_bps, 12).unwrap();
        let result_52 = compound(principal, rate_bps, 52).unwrap();
        let result_365 = compound(principal, rate_bps, 365).unwrap();

        assert!(result_12 < result_52, "52 periods should beat 12 periods");
        assert!(result_52 < result_365, "365 periods should beat 52 periods");
    }

    /// Two identical inputs must always produce identical outputs (determinism).
    #[test]
    fn test_determinism_same_inputs_same_output() {
        let principal = 999 * PRECISION;
        let rate_bps = 1337;
        let periods = 200;

        let r1 = compound(principal, rate_bps, periods).unwrap();
        let r2 = compound(principal, rate_bps, periods).unwrap();
        assert_eq!(r1, r2);
    }

    /// Large but safe principal — verify no overflow on 1 billion DOT.
    #[test]
    fn test_large_principal_no_overflow() {
        let principal = 1_000_000_000 * PRECISION; // 1B DOT
        let rate_bps = 1_000; // 10%
        let periods = 365;
        let result = compound(principal, rate_bps, periods);
        assert!(result.is_ok(), "1B DOT should not overflow: {:?}", result);
    }

    /// Very high rate (100% APY = 10_000 BPS) should still not overflow
    /// on a moderate principal.
    #[test]
    fn test_high_rate_no_overflow() {
        let principal = 1_000 * PRECISION; // 1000 DOT
        let rate_bps = 10_000; // 100% APY
        let result = compound(principal, rate_bps, 365);
        assert!(result.is_ok());
        let result = result.unwrap();
        // At 100% APY continuously compounded, ≈ e^1 ≈ 2.718× principal
        // With discrete periods it's (1 + 1/365)^365 ≈ 2.714× principal
        assert!(result > 2 * principal);
        assert!(result < 4 * principal);
    }

    /// Single period is a simple ratio multiply — verify exact arithmetic.
    #[test]
    fn test_single_period_exact_arithmetic() {
        // principal = 10000 DOT, rate = 1000 bps (10%), 1 period
        // Result = 10000 * (10000*1 + 1000) / (10000*1) = 10000 * 11000/10000 = 11000
        let principal = 10_000 * PRECISION;
        let result = compound(principal, 1_000, 1).unwrap();
        let expected = 11_000 * PRECISION;
        assert_eq!(result, expected);
    }
}

#[cfg(test)]
mod annualize_tests {
    use crate::math_lib::{annualize, MathError, SECONDS_PER_YEAR};

    /// Annualising over exactly one year should return the input unchanged.
    #[test]
    fn test_annualize_one_year_unchanged() {
        let rate_bps = 500u32;
        let result = annualize(rate_bps, SECONDS_PER_YEAR as u64).unwrap();
        assert_eq!(result, rate_bps);
    }

    /// Period of 6 months should double the rate when annualised.
    #[test]
    fn test_annualize_half_year_doubles_rate() {
        let rate_bps = 400u32; // 4% over 6 months
        let six_months = (SECONDS_PER_YEAR / 2) as u64;
        let result = annualize(rate_bps, six_months).unwrap();
        assert_eq!(result, 800u32); // should annualise to 8%
    }

    /// Period of 1 week — verify annualisation of a short observation window.
    #[test]
    fn test_annualize_one_week() {
        let rate_bps = 20u32; // 0.2% per week
        let one_week_seconds = 604_800u64;
        let result = annualize(rate_bps, one_week_seconds).unwrap();
        // Expected: 20 * 31_536_000 / 604_800 = 20 * 52.14... ≈ 1042 BPS
        assert!(result > 1000, "Annual rate should exceed 1000 BPS");
        assert!(result < 1100, "Annual rate should be below 1100 BPS");
    }

    /// Zero period_seconds must return DivisionByZero.
    #[test]
    fn test_annualize_zero_period_returns_error() {
        let result = annualize(500, 0);
        assert_eq!(result, Err(MathError::DivisionByZero));
    }

    /// Zero rate always annualises to zero.
    #[test]
    fn test_annualize_zero_rate() {
        let result = annualize(0, 86_400).unwrap();
        assert_eq!(result, 0);
    }

    /// Period longer than a year should return a rate smaller than the input.
    #[test]
    fn test_annualize_period_longer_than_year() {
        let rate_bps = 1_000u32; // 10% over 2 years
        let two_years = (SECONDS_PER_YEAR * 2) as u64;
        let result = annualize(rate_bps, two_years).unwrap();
        assert_eq!(result, 500u32); // annualises to 5%
    }
}

#[cfg(test)]
mod fee_adjusted_yield_tests {
    use crate::math_lib::{fee_adjusted_yield, MathError, BPS_DENOMINATOR, PRECISION};

    /// Zero fee means the gross yield is returned unchanged.
    #[test]
    fn test_zero_fee_returns_gross() {
        let gross = 100 * PRECISION;
        let result = fee_adjusted_yield(gross, 0).unwrap();
        assert_eq!(result, gross);
    }

    /// Zero gross yield always returns zero regardless of fee.
    #[test]
    fn test_zero_gross_yield_returns_zero() {
        let result = fee_adjusted_yield(0, 500).unwrap();
        assert_eq!(result, 0);
    }

    /// 50% fee (5_000 BPS) should halve the yield.
    #[test]
    fn test_fifty_percent_fee_halves_yield() {
        let gross = 200 * PRECISION;
        let result = fee_adjusted_yield(gross, 5_000).unwrap();
        assert_eq!(result, 100 * PRECISION);
    }

    /// 100% fee (10_000 BPS) should return zero net yield.
    #[test]
    fn test_hundred_percent_fee_returns_zero() {
        let gross = 100 * PRECISION;
        let result = fee_adjusted_yield(gross, 10_000).unwrap();
        assert_eq!(result, 0);
    }

    /// Fee above 100% (> BPS_DENOMINATOR) is invalid input.
    #[test]
    fn test_fee_above_100pct_returns_invalid_input() {
        let result = fee_adjusted_yield(100 * PRECISION, 10_001);
        assert_eq!(result, Err(MathError::InvalidInput));
    }

    /// 1 BPS fee on a realistic yield amount — verify precision is maintained.
    #[test]
    fn test_one_bps_fee_precision() {
        // 1000 DOT yield, 1 BPS fee = 0.01% = 0.1 DOT deducted
        let gross = 1_000 * PRECISION;
        let result = fee_adjusted_yield(gross, 1).unwrap();
        let expected = gross - (gross / 10_000);
        assert_eq!(result, expected);
    }

    /// Typical DeFi fee scenario: 50 BPS (0.5%) on 500 DOT yield.
    #[test]
    fn test_typical_dex_fee_scenario() {
        let gross = 500 * PRECISION; // 500 DOT yield
        let fee_bps = 50u32; // 0.5% fee
        let result = fee_adjusted_yield(gross, fee_bps).unwrap();
        // Expected: 500 - (500 * 50 / 10000) = 500 - 2.5 DOT = 497.5 DOT
        // In fixed point: 500e18 - 2.5e18 = 497.5e18
        let expected = 500 * PRECISION - (500 * PRECISION * 50 / 10_000);
        assert_eq!(result, expected);
    }
}

#[cfg(test)]
mod weighted_average_tests {
    use crate::math_lib::{weighted_average, MathError};

    /// Equal weights should return arithmetic mean.
    #[test]
    fn test_equal_weights_returns_mean() {
        let values = [1_000u128, 2_000u128];
        let weights = [1u128, 1u128];
        let result = weighted_average(&values, &weights).unwrap();
        assert_eq!(result, 1_500u128);
    }

    /// Single element — weighted average of one value is that value.
    #[test]
    fn test_single_element() {
        let result = weighted_average(&[9_999u128], &[42u128]).unwrap();
        assert_eq!(result, 9_999u128);
    }

    /// Higher weight on higher value pulls average up.
    #[test]
    fn test_weight_bias_towards_higher_value() {
        // 1000 at weight 1, 2000 at weight 3 → average = (1000 + 6000)/4 = 1750
        let values = [1_000u128, 2_000u128];
        let weights = [1u128, 3u128];
        let result = weighted_average(&values, &weights).unwrap();
        assert_eq!(result, 1_750u128);
    }

    /// Mismatched slice lengths must return InvalidInput.
    #[test]
    fn test_mismatched_lengths_returns_error() {
        let result = weighted_average(&[1_000u128, 2_000u128], &[1u128]);
        assert_eq!(result, Err(MathError::InvalidInput));
    }

    /// Empty slices must return InvalidInput.
    #[test]
    fn test_empty_slices_returns_error() {
        let result = weighted_average(&[], &[]);
        assert_eq!(result, Err(MathError::InvalidInput));
    }

    /// All-zero weights must return DivisionByZero.
    #[test]
    fn test_zero_total_weight_returns_error() {
        let result = weighted_average(&[1_000u128, 2_000u128], &[0u128, 0u128]);
        assert_eq!(result, Err(MathError::DivisionByZero));
    }

    /// Allocation scenario: 60/40 split between two APY BPS values.
    #[test]
    fn test_sixty_forty_split_blended_apy() {
        // HydraDX: 1200 BPS at 60 weight, Interlay: 900 BPS at 40 weight
        // Blended: (1200*60 + 900*40) / 100 = (72000 + 36000) / 100 = 1080
        let values = [1_200u128, 900u128];
        let weights = [60u128, 40u128];
        let result = weighted_average(&values, &weights).unwrap();
        assert_eq!(result, 1_080u128);
    }

    /// Determinism: same inputs always produce same output.
    #[test]
    fn test_determinism() {
        let values = [500u128, 1500u128, 2500u128];
        let weights = [10u128, 30u128, 60u128];
        let r1 = weighted_average(&values, &weights).unwrap();
        let r2 = weighted_average(&values, &weights).unwrap();
        assert_eq!(r1, r2);
    }
}

#[cfg(test)]
mod optimal_split_tests {
    use crate::math_lib::{optimal_split, MathError};

    /// Equal yield and equal risk should produce a 50/50 split.
    #[test]
    fn test_equal_yield_equal_risk_fifty_fifty() {
        let (a, b) = optimal_split(1_000, 1_000, 1_000, 1_000).unwrap();
        assert_eq!(a, 50);
        assert_eq!(b, 50);
    }

    /// Split must always sum to exactly 100 — no rounding drift.
    #[test]
    fn test_allocation_always_sums_to_100() {
        // Test multiple uneven cases
        let cases = [
            (1200u32, 800u32, 500u32, 2000u32),
            (500, 1500, 100, 9000),
            (1000, 1001, 0, 0),
            (9999, 1, 0, 9999),
            (800, 1200, 3000, 1000),
        ];
        for (ya, yb, ra, rb) in cases {
            let (a, b) = optimal_split(ya, yb, ra, rb).unwrap();
            assert_eq!(
                a + b,
                100,
                "Split must sum to 100 for inputs ({ya},{yb},{ra},{rb}): got ({a},{b})"
            );
        }
    }

    /// Higher yield with zero risk should capture more allocation.
    #[test]
    fn test_higher_yield_lower_risk_gets_more_allocation() {
        // A: 2000 BPS, 0 risk. B: 1000 BPS, 0 risk.
        // A should get 2/3 (~66%), B should get 1/3 (~33%)
        let (a, b) = optimal_split(2_000, 1_000, 0, 0).unwrap();
        assert!(a > b, "Higher yield destination should get more allocation");
        assert_eq!(a, 66);
        assert_eq!(b, 34);
    }

    /// Very high risk on A should push allocation toward B even if A has higher yield.
    #[test]
    fn test_high_risk_reduces_allocation() {
        // A: 2000 BPS but MAX risk (10000). B: 500 BPS, 0 risk.
        // Risk-adjusted A: 2000 * (10000 - 10000) / 10000 = 0
        // Risk-adjusted B: 500 * (10000 - 0) / 10000 = 500
        // Split: A=0, B=100
        let (a, b) = optimal_split(2_000, 500, 10_000, 0).unwrap();
        assert_eq!(a, 0);
        assert_eq!(b, 100);
    }

    /// Both destinations at maximum risk should trigger the 50/50 fallback.
    #[test]
    fn test_both_max_risk_triggers_fifty_fifty_fallback() {
        let (a, b) = optimal_split(1_000, 2_000, 10_000, 10_000).unwrap();
        assert_eq!(a, 50);
        assert_eq!(b, 50);
    }

    /// Zero yield on both destinations should trigger the 50/50 fallback.
    #[test]
    fn test_both_zero_yield_triggers_fifty_fifty_fallback() {
        let (a, b) = optimal_split(0, 0, 500, 500).unwrap();
        assert_eq!(a, 50);
        assert_eq!(b, 50);
    }

    /// Risk score above MAX_RISK_SCORE must return InvalidInput.
    #[test]
    fn test_risk_above_max_returns_invalid_input() {
        let result = optimal_split(1_000, 1_000, 10_001, 0);
        assert_eq!(result, Err(MathError::InvalidInput));
    }

    /// Zero risk on both sides means allocation is purely yield-proportional.
    #[test]
    fn test_zero_risk_pure_yield_allocation() {
        // 3000 vs 1000 BPS at zero risk → 75/25 split
        let (a, b) = optimal_split(3_000, 1_000, 0, 0).unwrap();
        assert_eq!(a, 75);
        assert_eq!(b, 25);
    }
}

// ---------------------------------------------------------------------------
// yield_optimizer integration tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod optimizer_tests {
    use crate::math_lib::PRECISION;
    use crate::yield_optimizer::{optimize, OptimizerError, OptimizerInput};

    fn default_input() -> OptimizerInput {
        OptimizerInput {
            principal: 1_000 * PRECISION, // 1000 DOT
            hydradx_apy_bps: 1_200,       // 12%
            interlay_apy_bps: 900,         // 9%
            hydradx_fee_bps: 50,           // 0.5%
            interlay_fee_bps: 100,         // 1%
            hydradx_risk_score: 1_500,
            interlay_risk_score: 2_500,
            projection_periods: 365,
        }
    }

    /// Full pipeline with realistic inputs — confirm no error and sensible output.
    #[test]
    fn test_full_pipeline_realistic_inputs() {
        let result = optimize(&default_input());
        assert!(result.is_ok(), "Optimizer failed: {:?}", result);
        let rec = result.unwrap();

        // Allocation must sum to 100
        assert_eq!(
            rec.hydradx_allocation_pct + rec.interlay_allocation_pct,
            100
        );
        // use_* flags must match allocation percentages
        assert_eq!(rec.use_hydradx, rec.hydradx_allocation_pct > 0);
        assert_eq!(rec.use_interlay, rec.interlay_allocation_pct > 0);
        // Yield must be positive
        assert!(rec.expected_yield_dot > 0);
        // APY must be positive
        assert!(rec.projected_net_apy_bps > 0);
    }

    /// Zero principal must return InvalidInput.
    #[test]
    fn test_zero_principal_returns_error() {
        let mut input = default_input();
        input.principal = 0;
        let result = optimize(&input);
        assert_eq!(result, Err(OptimizerError::InvalidInput));
    }

    /// Zero projection periods must return InvalidInput.
    #[test]
    fn test_zero_periods_returns_error() {
        let mut input = default_input();
        input.projection_periods = 0;
        let result = optimize(&input);
        assert_eq!(result, Err(OptimizerError::InvalidInput));
    }

    /// Fee above 100% must return InvalidInput.
    #[test]
    fn test_fee_above_100pct_returns_error() {
        let mut input = default_input();
        input.hydradx_fee_bps = 10_001;
        let result = optimize(&input);
        assert_eq!(result, Err(OptimizerError::InvalidInput));
    }

    /// HydraDX clearly better (higher yield, lower risk) — should get majority allocation.
    #[test]
    fn test_hydradx_dominates_gets_majority_allocation() {
        let input = OptimizerInput {
            principal: 1_000 * PRECISION,
            hydradx_apy_bps: 2_000, // 20%
            interlay_apy_bps: 500,  // 5%
            hydradx_fee_bps: 50,
            interlay_fee_bps: 50,
            hydradx_risk_score: 500,
            interlay_risk_score: 4_000,
            projection_periods: 365,
        };
        let rec = optimize(&input).unwrap();
        assert!(
            rec.hydradx_allocation_pct > rec.interlay_allocation_pct,
            "HydraDX should dominate: got {}% vs {}%",
            rec.hydradx_allocation_pct,
            rec.interlay_allocation_pct
        );
    }

    /// Interlay clearly better (higher yield, lower risk) — should get majority allocation.
    #[test]
    fn test_interlay_dominates_gets_majority_allocation() {
        let input = OptimizerInput {
            principal: 1_000 * PRECISION,
            hydradx_apy_bps: 400,   // 4%
            interlay_apy_bps: 2_500, // 25%
            hydradx_fee_bps: 200,
            interlay_fee_bps: 50,
            hydradx_risk_score: 6_000,
            interlay_risk_score: 800,
            projection_periods: 365,
        };
        let rec = optimize(&input).unwrap();
        assert!(
            rec.interlay_allocation_pct > rec.hydradx_allocation_pct,
            "Interlay should dominate: got {}% vs {}%",
            rec.interlay_allocation_pct,
            rec.hydradx_allocation_pct
        );
    }

    /// Both yields at zero — optimizer should still return 50/50 without erroring.
    #[test]
    fn test_both_zero_apy_returns_fifty_fifty_no_error() {
        let input = OptimizerInput {
            principal: 1_000 * PRECISION,
            hydradx_apy_bps: 0,
            interlay_apy_bps: 0,
            hydradx_fee_bps: 0,
            interlay_fee_bps: 0,
            hydradx_risk_score: 500,
            interlay_risk_score: 500,
            projection_periods: 365,
        };
        let rec = optimize(&input).unwrap();
        assert_eq!(rec.hydradx_allocation_pct, 50);
        assert_eq!(rec.interlay_allocation_pct, 50);
        assert_eq!(rec.expected_yield_dot, 0);
    }

    /// Determinism: identical inputs always produce identical outputs.
    #[test]
    fn test_full_pipeline_is_deterministic() {
        let input = default_input();
        let r1 = optimize(&input).unwrap();
        let r2 = optimize(&input).unwrap();
        assert_eq!(r1, r2);
    }

    /// Large principal (1B DOT) — verify no overflow through the full pipeline.
    #[test]
    fn test_large_principal_no_overflow() {
        let input = OptimizerInput {
            principal: 1_000_000_000 * PRECISION, // 1B DOT
            hydradx_apy_bps: 1_000,
            interlay_apy_bps: 800,
            hydradx_fee_bps: 50,
            interlay_fee_bps: 100,
            hydradx_risk_score: 1_000,
            interlay_risk_score: 2_000,
            projection_periods: 365,
        };
        let result = optimize(&input);
        assert!(
            result.is_ok(),
            "1B DOT pipeline should not overflow: {:?}",
            result
        );
    }

    /// Single compounding period — ensure optimizer handles minimal periods correctly.
    #[test]
    fn test_single_period_optimizer() {
        let input = OptimizerInput {
            principal: 10_000 * PRECISION,
            hydradx_apy_bps: 1_000,
            interlay_apy_bps: 500,
            hydradx_fee_bps: 0,
            interlay_fee_bps: 0,
            hydradx_risk_score: 0,
            interlay_risk_score: 0,
            projection_periods: 1,
        };
        let rec = optimize(&input).unwrap();
        assert!(rec.expected_yield_dot > 0);
        assert_eq!(rec.hydradx_allocation_pct + rec.interlay_allocation_pct, 100);
    }

    /// Maximum risk on both sides — optimizer must return 50/50 and not error.
    #[test]
    fn test_max_risk_both_sides_fifty_fifty() {
        let input = OptimizerInput {
            principal: 500 * PRECISION,
            hydradx_apy_bps: 2_000,
            interlay_apy_bps: 1_500,
            hydradx_fee_bps: 100,
            interlay_fee_bps: 200,
            hydradx_risk_score: 10_000,
            interlay_risk_score: 10_000,
            projection_periods: 365,
        };
        let rec = optimize(&input).unwrap();
        assert_eq!(rec.hydradx_allocation_pct, 50);
        assert_eq!(rec.interlay_allocation_pct, 50);
    }

    /// use_hydradx flag must be false when hydradx gets 0% allocation.
    #[test]
    fn test_use_flags_consistent_with_allocation() {
        // Max risk on HydraDX forces its allocation to 0
        let input = OptimizerInput {
            principal: 1_000 * PRECISION,
            hydradx_apy_bps: 5_000,
            interlay_apy_bps: 1_000,
            hydradx_fee_bps: 0,
            interlay_fee_bps: 0,
            hydradx_risk_score: 10_000, // Max risk — wipes adj yield to 0
            interlay_risk_score: 0,
            projection_periods: 365,
        };
        let rec = optimize(&input).unwrap();
        assert!(!rec.use_hydradx, "use_hydradx should be false when pct = 0");
        assert!(rec.use_interlay, "use_interlay should be true when pct = 100");
        assert_eq!(rec.hydradx_allocation_pct, 0);
        assert_eq!(rec.interlay_allocation_pct, 100);
    }
}