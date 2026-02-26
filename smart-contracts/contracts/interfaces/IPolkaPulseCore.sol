// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPolkaPulseCore
/// @notice Public interface for PolkaPulseCore.
///         The proxy and all external integrators code against this interface
///         rather than importing the implementation directly. This decouples
///         the ABI from the storage layout and allows safe upgrades without
///         breaking downstream callers.
interface IPolkaPulseCore {

    // -------------------------------------------------------------------------
    // User-facing
    // -------------------------------------------------------------------------

    /// @notice Deposit DOT into the protocol and receive ppDOT shares.
    /// @param amount      DOT to deposit (18-decimal fixed-point).
    /// @param minPpDot    Minimum ppDOT to receive (slippage protection).
    /// @param deadline    Unix timestamp after which the tx reverts.
    /// @return ppDotMinted Amount of ppDOT minted to the caller.
    function deposit(
        uint256 amount,
        uint256 minPpDot,
        uint256 deadline
    ) external returns (uint256 ppDotMinted);

    /// @notice Burn ppDOT shares and receive underlying DOT + yield.
    /// @param shares      ppDOT shares to burn.
    /// @param minDot      Minimum DOT to receive (slippage protection).
    /// @param deadline    Unix timestamp after which the tx reverts.
    /// @return dotReturned DOT returned to the caller.
    function withdraw(
        uint256 shares,
        uint256 minDot,
        uint256 deadline
    ) external returns (uint256 dotReturned);

    // -------------------------------------------------------------------------
    // Keeper-facing
    // -------------------------------------------------------------------------

    /// @notice Trigger the atomic yield loop (harvest → XCM deploy → rebase).
    ///         Callable only by addresses with KEEPER_ROLE.
    function executeYieldLoop() external;

    // -------------------------------------------------------------------------
    // View
    // -------------------------------------------------------------------------

    /// @notice Returns the current ppDOT/DOT exchange rate (18-decimal).
    function exchangeRate() external view returns (uint256);

    /// @notice Returns total DOT under management (principal + accrued yield).
    function totalDotManaged() external view returns (uint256);

    /// @notice Returns the ppDOT token address.
    function ppDot() external view returns (address);

    /// @notice Returns the pending staking rewards available to harvest.
    function pendingRewards() external view returns (uint256);

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Update the harvest threshold (ADMIN_ROLE only).
    function setHarvestThreshold(uint256 newThreshold) external;

    /// @notice Pause the protocol (PAUSER_ROLE only).
    function pause(string calldata reason) external;

    /// @notice Unpause the protocol (ADMIN_ROLE only).
    function unpause() external;
}