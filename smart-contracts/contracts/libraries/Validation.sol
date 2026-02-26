// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Validation
/// @notice Shared input validation logic reused across all PolkaPulse contracts.
///         Centralising validation here means a single fix propagates everywhere
///         and every contract's external surface uses identical guard conditions.
///
/// @dev All functions revert with a named custom error rather than a string.
///      Custom errors cost less gas than string reverts and are easier to decode
///      in off-chain tooling. Each error carries the invalid value so callers
///      can surface it meaningfully in UI and logs.
library Validation {

    // -------------------------------------------------------------------------
    // Custom errors
    // -------------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error AmountBelowMinimum(uint256 provided, uint256 minimum);
    error AmountAboveMaximum(uint256 provided, uint256 maximum);
    error BpsExceedsMax(uint256 provided, uint256 max);
    error ArrayLengthMismatch(uint256 lengthA, uint256 lengthB);
    error EmptyArray();
    error InvalidParachainId(uint32 id);
    error DeadlineExpired(uint256 deadline, uint256 current);
    error InsufficientShares(uint256 requested, uint256 available);
    error ExchangeRateZero();
    error PeriodZero();
    error SlippageExceeded(uint256 expected, uint256 actual);

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 internal constant BPS_MAX         = 10_000;
    uint256 internal constant PRECISION       = 1e18;
    uint256 internal constant MIN_DEPOSIT_DOT = 1e15;  // 0.001 DOT minimum deposit
    uint256 internal constant MAX_FEE_BPS     = 2_000; // 20% absolute fee ceiling

    // -------------------------------------------------------------------------
    // General guards
    // -------------------------------------------------------------------------

    /// @notice Reverts if amount is zero.
    function requireNonZeroAmount(uint256 amount) internal pure {
        if (amount == 0) revert ZeroAmount();
    }

    /// @notice Reverts if address is the zero address.
    function requireNonZeroAddress(address addr) internal pure {
        if (addr == address(0)) revert ZeroAddress();
    }

    /// @notice Reverts if amount is below the protocol minimum deposit.
    function requireAboveMinDeposit(uint256 amount) internal pure {
        if (amount < MIN_DEPOSIT_DOT)
            revert AmountBelowMinimum(amount, MIN_DEPOSIT_DOT);
    }

    /// @notice Reverts if a basis-point value exceeds BPS_MAX (100%).
    function requireValidBps(uint256 bps) internal pure {
        if (bps > BPS_MAX) revert BpsExceedsMax(bps, BPS_MAX);
    }

    /// @notice Reverts if a fee basis-point value exceeds MAX_FEE_BPS (20%).
    ///         Separate from requireValidBps to enforce tighter protocol ceiling.
    function requireValidFeeBps(uint256 bps) internal pure {
        if (bps > MAX_FEE_BPS) revert BpsExceedsMax(bps, MAX_FEE_BPS);
    }

    /// @notice Reverts if two array lengths do not match.
    function requireMatchingLengths(uint256 a, uint256 b) internal pure {
        if (a != b) revert ArrayLengthMismatch(a, b);
    }

    /// @notice Reverts if an array is empty.
    function requireNonEmptyArray(uint256 length) internal pure {
        if (length == 0) revert EmptyArray();
    }

    /// @notice Reverts if the current block timestamp is past a deadline.
    function requireNotExpired(uint256 deadline) internal view {
        if (block.timestamp > deadline)
            revert DeadlineExpired(deadline, block.timestamp);
    }

    /// @notice Reverts if shares requested exceed shares available.
    function requireSufficientShares(
        uint256 requested,
        uint256 available
    ) internal pure {
        if (requested > available)
            revert InsufficientShares(requested, available);
    }

    /// @notice Reverts if exchange rate is zero (prevents division by zero in
    ///         share calculations and avoids minting infinite shares).
    function requireNonZeroExchangeRate(uint256 rate) internal pure {
        if (rate == 0) revert ExchangeRateZero();
    }

    /// @notice Reverts if a period value (compounding intervals) is zero.
    function requireNonZeroPeriod(uint256 period) internal pure {
        if (period == 0) revert PeriodZero();
    }

    /// @notice Reverts if actual output is below expected minus slippage tolerance.
    /// @param expected      Expected output amount.
    /// @param actual        Actual output amount.
    /// @param slippageBps   Maximum acceptable slippage in basis points.
    function requireWithinSlippage(
        uint256 expected,
        uint256 actual,
        uint256 slippageBps
    ) internal pure {
        uint256 minAcceptable = expected - (expected * slippageBps / BPS_MAX);
        if (actual < minAcceptable) revert SlippageExceeded(expected, actual);
    }

    /// @notice Reverts if a parachain ID is zero (invalid in Polkadot).
    function requireValidParachainId(uint32 id) internal pure {
        if (id == 0) revert InvalidParachainId(id);
    }

    /// @notice Reverts if an amount exceeds a stated maximum.
    function requireBelowMaximum(uint256 amount, uint256 maximum) internal pure {
        if (amount > maximum) revert AmountAboveMaximum(amount, maximum);
    }
}