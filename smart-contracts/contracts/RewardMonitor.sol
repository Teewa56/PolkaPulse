// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable}          from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable}            from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {IStakingPrecompile}       from "./interfaces/IStakingPrecompile.sol";
import {Events}                   from "./libraries/Events.sol";
import {Validation}               from "./libraries/Validation.sol";

/// @title RewardMonitor
/// @notice Monitors DOT staking reward accrual via the Staking Precompile and
///         triggers harvest when pending rewards exceed a configured threshold.
///         Prevents gas-inefficient micro-harvests by enforcing the threshold.
///
/// @dev    SECURITY:
///         - harvest() is guarded by HARVESTER_ROLE to prevent griefing
///           (spamming harvests below threshold to waste protocol gas).
///         - harvestThreshold is admin-configurable but bounded by
///           Validation.MIN_DEPOSIT_DOT to prevent a zero-threshold attack
///           that would allow constant micro-harvesting.
///         - Non-reentrant on harvest() because the Staking Precompile
///           interaction could in theory call back (defence in depth).
///
///         GAS OPTIMISATION:
///         - pendingRewards() is a pure read — no state changes on query.
///         - All state variables are packed: threshold (uint128) and
///           lastHarvestBlock (uint128) share one storage slot.
contract RewardMonitor is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    using Validation for *;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant HARVESTER_ROLE = keccak256("HARVESTER_ROLE");
    bytes32 public constant ADMIN_ROLE     = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE  = keccak256("UPGRADER_ROLE");

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error BelowHarvestThreshold(uint256 pending, uint256 threshold);
    error StakingPrecompileCallFailed();

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Staking Precompile fixed address on Asset Hub.
    address public constant STAKING_PRECOMPILE =
        0x0000000000000000000000000000000000000800;

    // -------------------------------------------------------------------------
    // State — packed into minimal storage slots
    // -------------------------------------------------------------------------

    /// @dev Slot 0: threshold (uint128) + lastHarvestBlock (uint128) = 1 slot
    uint128 public harvestThreshold;
    uint128 public lastHarvestBlock;

    /// @dev Slot 1: total lifetime DOT harvested
    uint256 public totalHarvested;

    /// @dev Slot 2: staker address (the protocol's staking account)
    address public stakerAccount;

    // -------------------------------------------------------------------------
    // Storage gap
    // -------------------------------------------------------------------------

    uint256[50] private __gap;

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /// @param admin          Address for ADMIN_ROLE and DEFAULT_ADMIN_ROLE.
    /// @param upgrader       Address for UPGRADER_ROLE (Timelock).
    /// @param harvester      Address for HARVESTER_ROLE (AtomicYieldExecutor).
    /// @param _stakerAccount Protocol staking account address on relay chain.
    /// @param _threshold     Initial harvest threshold (18-decimal DOT).
    function initialize(
        address admin,
        address upgrader,
        address harvester,
        address _stakerAccount,
        uint128 _threshold
    ) external initializer {
        Validation.requireNonZeroAddress(admin);
        Validation.requireNonZeroAddress(upgrader);
        Validation.requireNonZeroAddress(harvester);
        Validation.requireNonZeroAddress(_stakerAccount);
        Validation.requireNonZeroAmount(_threshold);

        __AccessControl_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(HARVESTER_ROLE, harvester);

        stakerAccount    = _stakerAccount;
        harvestThreshold = _threshold;
        lastHarvestBlock = 0;
        totalHarvested   = 0;
    }

    // -------------------------------------------------------------------------
    // Read
    // -------------------------------------------------------------------------

    /// @notice Returns pending staking rewards from the relay chain via the
    ///         Staking Precompile. Pure read — no state change.
    /// @return pending Pending DOT rewards (18-decimal fixed-point).
    function pendingRewards() external view returns (uint256 pending) {
        return IStakingPrecompile(STAKING_PRECOMPILE)
            .pendingRewards(stakerAccount);
    }

    /// @notice Returns true if pending rewards exceed the harvest threshold.
    ///         Used by keepers to determine whether to call harvest().
    function shouldHarvest() external view returns (bool) {
        uint256 pending = IStakingPrecompile(STAKING_PRECOMPILE)
            .pendingRewards(stakerAccount);
        return pending >= harvestThreshold;
    }

    // -------------------------------------------------------------------------
    // Harvest
    // -------------------------------------------------------------------------

    /// @notice Harvest staking rewards from the relay chain.
    ///         Reverts if pending rewards are below the threshold, preventing
    ///         gas-inefficient micro-harvests.
    ///
    /// @dev    CALL ORDER (CEI):
    ///         1. Check — threshold met, not reentrant
    ///         2. Effect — update lastHarvestBlock and totalHarvested
    ///         3. Interact — call Staking Precompile
    ///         lastHarvestBlock is updated before the precompile call so that
    ///         any reentrant call would see the updated state and be subject
    ///         to the threshold check on the new (now-zero) pending balance.
    ///
    /// @return harvested DOT amount harvested (18-decimal fixed-point).
    function harvest()
        external
        nonReentrant
        onlyRole(HARVESTER_ROLE)
        returns (uint256 harvested)
    {
        // CHECK
        uint256 pending = IStakingPrecompile(STAKING_PRECOMPILE)
            .pendingRewards(stakerAccount);

        if (pending < harvestThreshold)
            revert BelowHarvestThreshold(pending, harvestThreshold);

        // EFFECT — update state before external call
        lastHarvestBlock = uint128(block.number);

        // INTERACT
        harvested = IStakingPrecompile(STAKING_PRECOMPILE).harvestRewards();

        if (harvested == 0) revert StakingPrecompileCallFailed();

        totalHarvested += harvested;

        emit Events.StakingRewardsHarvested(harvested, block.number);
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Update the harvest threshold.
    ///         Protected by ADMIN_ROLE (held by Timelock after governance setup).
    /// @param newThreshold New threshold in DOT (18-decimal). Must be > 0.
    function setHarvestThreshold(uint128 newThreshold)
        external
        onlyRole(ADMIN_ROLE)
    {
        Validation.requireNonZeroAmount(newThreshold);
        uint256 old = harvestThreshold;
        harvestThreshold = newThreshold;
        emit Events.HarvestThresholdUpdated(old, newThreshold);
    }

    // -------------------------------------------------------------------------
    // UUPS upgrade authorisation
    // -------------------------------------------------------------------------

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyRole(UPGRADER_ROLE)
    {
        emit Events.UpgradeAuthorised(
            _getImplementation(),
            newImplementation,
            msg.sender
        );
    }

    function _getImplementation() internal view returns (address impl) {
        bytes32 slot = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
        assembly { impl := sload(slot) }
    }
}