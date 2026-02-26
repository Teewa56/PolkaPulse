// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IStakingPrecompile
/// @notice Interface for the Polkadot Asset Hub Staking Precompile.
///         Registered at address 0x0000000000000000000000000000000000000800.
///         Allows smart contracts to read staking state and trigger reward
///         harvests on the relay chain without leaving the EVM execution context.
interface IStakingPrecompile {

    /// @notice Returns the total pending staking rewards for a given account.
    /// @param staker The staking account address.
    /// @return pendingRewards Pending rewards in DOT (18-decimal fixed-point).
    function pendingRewards(address staker)
        external
        view
        returns (uint256 pendingRewards);

    /// @notice Returns the currently bonded DOT amount for a given account.
    /// @param staker The staking account address.
    /// @return bonded Bonded DOT (18-decimal fixed-point).
    function bondedAmount(address staker)
        external
        view
        returns (uint256 bonded);

    /// @notice Triggers a reward payout for the calling account.
    ///         Harvested rewards are transferred to the caller's account.
    /// @return harvested Amount of DOT harvested (18-decimal fixed-point).
    function harvestRewards() external returns (uint256 harvested);

    /// @notice Bonds additional DOT to an existing staking position.
    /// @param amount DOT to bond (18-decimal fixed-point).
    function bondExtra(uint256 amount) external;

    /// @notice Nominates a set of validators.
    /// @param validators Array of validator addresses to nominate.
    function nominate(address[] calldata validators) external;

    /// @notice Returns the current era number on the relay chain.
    /// @return era The current era index.
    function currentEra() external view returns (uint32 era);
}