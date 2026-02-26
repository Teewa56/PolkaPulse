// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IAssetsPrecompile
/// @notice Interface for the Polkadot Asset Hub Assets Precompile.
///         Registered at address 0x0000000000000000000000000000000000000806.
///         Provides ERC-20-style read/write access to native DOT and
///         other Asset Hub assets without wrapping them.
interface IAssetsPrecompile {

    /// @notice Returns the DOT balance of an account on Asset Hub.
    /// @param account  Account to query.
    /// @return balance DOT balance (18-decimal fixed-point).
    function balanceOf(address account)
        external
        view
        returns (uint256 balance);

    /// @notice Transfers DOT between accounts on Asset Hub.
    /// @param to     Recipient address.
    /// @param amount Amount to transfer (18-decimal fixed-point).
    /// @return success True if transfer succeeded.
    function transfer(address to, uint256 amount)
        external
        returns (bool success);

    /// @notice Returns the total issuance of DOT on Asset Hub.
    /// @return totalIssuance Total DOT supply (18-decimal fixed-point).
    function totalIssuance() external view returns (uint256 totalIssuance);

    /// @notice Returns the minimum balance required to keep an account alive
    ///         (the existential deposit on Asset Hub).
    /// @return existentialDeposit Minimum live balance (18-decimal fixed-point).
    function existentialDeposit()
        external
        view
        returns (uint256 existentialDeposit);
}