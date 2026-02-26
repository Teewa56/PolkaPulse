// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Events
/// @notice Single source of truth for every protocol event.
///         All contracts emit events defined here so subgraph indexers
///         only need to watch one ABI. Every indexed field is marked
///         explicitly to keep query costs predictable.
library Events {

    // -------------------------------------------------------------------------
    // Deposit / Withdraw
    // -------------------------------------------------------------------------

    /// @param user         Depositor address (indexed for per-user queries).
    /// @param dotAmount    Raw DOT deposited (18-decimal fixed-point).
    /// @param ppDotMinted  ppDOT shares minted to depositor.
    /// @param exchangeRate ppDOT/DOT rate at deposit time (18-decimal).
    event Deposited(
        address indexed user,
        uint256 dotAmount,
        uint256 ppDotMinted,
        uint256 exchangeRate
    );

    /// @param user         Redeemer address (indexed).
    /// @param ppDotBurned  ppDOT shares burned.
    /// @param dotReturned  Total DOT returned (principal + yield).
    /// @param exchangeRate ppDOT/DOT rate at withdrawal time.
    event Withdrawn(
        address indexed user,
        uint256 ppDotBurned,
        uint256 dotReturned,
        uint256 exchangeRate
    );

    // -------------------------------------------------------------------------
    // Yield Loop
    // -------------------------------------------------------------------------

    /// @param executor       Keeper address that triggered the harvest.
    /// @param harvestedDot   Gross DOT harvested from staking rewards.
    /// @param hydraDXAmount  DOT dispatched to HydraDX via XCM.
    /// @param interlayAmount DOT dispatched to Interlay via XCM.
    /// @param netApyBps      Blended net APY in basis points from optimizer.
    /// @param epoch          Block number at execution time (indexed).
    event YieldLoopExecuted(
        address indexed executor,
        uint256 harvestedDot,
        uint256 hydraDXAmount,
        uint256 interlayAmount,
        uint256 netApyBps,
        uint256 indexed epoch
    );

    /// @param executor  Keeper that triggered the failed harvest.
    /// @param errorCode Numeric error code from the PVM precompile.
    event YieldLoopFailed(address indexed executor, uint32 errorCode);

    /// @param yieldDot        Absolute DOT yield credited to the pool.
    /// @param newExchangeRate Updated ppDOT/DOT rate after rebase.
    /// @param totalDotManaged Total DOT under management after rebase.
    event YieldNotified(
        uint256 yieldDot,
        uint256 newExchangeRate,
        uint256 totalDotManaged
    );

    // -------------------------------------------------------------------------
    // Coretime Arbitrage
    // -------------------------------------------------------------------------

    /// @param epoch         Weekly epoch index (indexed).
    /// @param dotSpent      DOT used for the Coretime purchase.
    /// @param coretimeUnits Number of Coretime blocks purchased.
    event CoretimePurchased(
        uint256 indexed epoch,
        uint256 dotSpent,
        uint256 coretimeUnits
    );

    /// @param parachainId      Parachain ID receiving Coretime (indexed).
    /// @param coretimeUnits    Units assigned.
    /// @param boostedYieldBps  Boosted yield committed by parachain in BPS.
    event CoretimeAssigned(
        uint32 indexed parachainId,
        uint256 coretimeUnits,
        uint256 boostedYieldBps
    );

    // -------------------------------------------------------------------------
    // Reward Monitor
    // -------------------------------------------------------------------------

    /// @param amount       DOT rewards harvested.
    /// @param triggerBlock Block at which harvest was triggered (indexed).
    event StakingRewardsHarvested(uint256 amount, uint256 indexed triggerBlock);

    /// @param oldThreshold Previous threshold in DOT (18-decimal).
    /// @param newThreshold New threshold in DOT (18-decimal).
    event HarvestThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    // -------------------------------------------------------------------------
    // Multisig Governance
    // -------------------------------------------------------------------------

    event MultisigTxProposed(
        uint256 indexed txId,
        address indexed proposer,
        address target,
        uint256 value,
        bytes data
    );
    event MultisigTxConfirmed(uint256 indexed txId, address indexed confirmer);
    event MultisigTxExecuted(uint256 indexed txId);
    event MultisigTxRevoked(uint256 indexed txId, address indexed revoker);

    // -------------------------------------------------------------------------
    // Upgrades
    // -------------------------------------------------------------------------

    event UpgradeAuthorised(
        address indexed oldImpl,
        address indexed newImpl,
        address indexed authoriser
    );

    // -------------------------------------------------------------------------
    // Emergency
    // -------------------------------------------------------------------------

    event ProtocolPaused(address indexed pauser, string reason);
    event ProtocolUnpaused(address indexed unpauser);
    event TreasuryThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);

    // -------------------------------------------------------------------------
    // Partner Registry
    // -------------------------------------------------------------------------

    event PartnerParachainAdded(uint32 indexed parachainId, uint256 boostedYieldBps);
    event PartnerParachainRemoved(uint32 indexed parachainId);
}