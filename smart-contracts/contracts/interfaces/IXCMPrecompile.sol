// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IXCMPrecompile
/// @notice Interface for the Polkadot Asset Hub XCM Precompile.
///         Registered at address 0x0000000000000000000000000000000000000808.
///         Allows smart contracts to build and dispatch XCM v5 instruction sets
///         cross-chain without bridge infrastructure or off-chain relayers.
interface IXCMPrecompile {

    /// @notice Teleports DOT from Asset Hub to a destination parachain.
    ///         Uses the XCM v5 TeleportAssets instruction, which is trustless
    ///         and does not rely on any bridge or external validator set.
    /// @param destinationParaId  Parachain ID to teleport DOT to.
    /// @param beneficiary        Recipient address on the destination chain.
    /// @param amount             DOT to teleport (18-decimal fixed-point).
    /// @param weightLimit        Maximum XCM execution weight to purchase.
    function teleportDOT(
        uint32  destinationParaId,
        address beneficiary,
        uint256 amount,
        uint64  weightLimit
    ) external;

    /// @notice Dispatches a raw XCM v5 program as an encoded byte sequence.
    ///         Used for complex multi-instruction flows (e.g. Withdraw +
    ///         BuyExecution + Transact + DepositAsset in one atomic message).
    /// @param destination  SCALE-encoded MultiLocation of the target chain.
    /// @param message      SCALE-encoded XCM v5 instruction set.
    function executeXCM(
        bytes calldata destination,
        bytes calldata message
    ) external;

    /// @notice Sends a remote Transact to execute a call on another chain.
    ///         Used by CoretimeArbitrage to call the Coretime Chain marketplace.
    /// @param destinationParaId  Target parachain ID.
    /// @param call               SCALE-encoded extrinsic to execute remotely.
    /// @param weightLimit        Maximum weight for the remote call.
    function remoteTransact(
        uint32        destinationParaId,
        bytes calldata call,
        uint64        weightLimit
    ) external;

    /// @notice Returns the sovereign account address of this contract on a
    ///         given parachain. The sovereign account must hold enough DOT to
    ///         cover BuyExecution fees or XCM calls will fail.
    /// @param parachainId  Target parachain ID.
    /// @return sovereign   The sovereign account address on that chain.
    function sovereignAccount(uint32 parachainId)
        external
        view
        returns (address sovereign);
}