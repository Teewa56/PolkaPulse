// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControlUpgradeable}   from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable}            from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable}              from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable}        from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IXCMPrecompile}             from "./interfaces/IXCMPrecompile.sol";
import {Events}                     from "./libraries/Events.sol";
import {Validation}                 from "./libraries/Validation.sol";

/// @title CoretimeArbitrage
/// @notice Accumulates protocol yield into a treasury reserve and, on a weekly
///         epoch, uses that reserve to purchase Bulk Coretime NFTs on the
///         Polkadot Coretime Chain on behalf of partner parachains. Partner
///         parachains commit to Boosted Yield rates for PolkaPulse depositors
///         in exchange for the Coretime subsidy.
///
/// @dev    EPOCH MECHANISM:
///         epochTrigger() is callable by any KEEPER_ROLE address once per epoch
///         (7-day window). The epoch boundary is enforced on-chain via
///         lastEpochBlock + EPOCH_BLOCKS. Keepers have no discretion over when
///         the epoch fires — the block constraint is the only gate.
///
///         TREASURY RESERVE:
///         A configurable fraction of each yield harvest (treasuryBps, default
///         500 BPS = 5%) is credited to the reserve. Purchases are capped at
///         the available reserve, so the protocol never overspends.
///
///         PARTNER REGISTRY:
///         Only ADMIN_ROLE can add or remove partners. Removing a partner stops
///         future Coretime assignments but does not affect already-assigned
///         Coretime (which is on-chain on the Coretime Chain).
///
///         CENTRALISATION RISK:
///         The partner whitelist is admin-controlled in Phase 1. Phase 3 opens
///         it to a DOT-holder governance vote. This is explicitly documented as
///         a known centralisation tradeoff.
///
///         REENTRANCY:
///         epochTrigger() is nonReentrant. The XCM Coretime purchase is a
///         one-way dispatch; reentrancy from XCM is not possible at dispatch
///         time, but we defend in depth.
contract CoretimeArbitrage is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using Validation for *;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant KEEPER_ROLE   = keccak256("KEEPER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error EpochNotReady(uint256 currentBlock, uint256 nextEpochBlock);
    error ReserveTooLow(uint256 reserve, uint256 required);
    error ParachainNotWhitelisted(uint32 parachainId);
    error ParachainAlreadyRegistered(uint32 parachainId);
    error CoretimePurchaseFailed();
    error TreasuryBpsExceedsMax(uint256 bps);

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice XCM Precompile address (Asset Hub).
    address public constant XCM_PRECOMPILE =
        0x0000000000000000000000000000000000000808;

    /// @notice Coretime Chain parachain ID.
    uint32  public constant CORETIME_CHAIN_PARA_ID = 1005;

    /// @notice One epoch = ~7 days at 6-second blocks (100_800 blocks).
    uint256 public constant EPOCH_BLOCKS = 100_800;

    /// @notice Maximum treasury fraction in BPS. 20% ceiling.
    uint256 public constant MAX_TREASURY_BPS = 2_000;

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct PartnerParachain {
        uint32  parachainId;
        uint256 boostedYieldBps;  // Committed boosted yield for depositors
        bool    active;
        uint256 totalCoretimeReceived; // Lifetime Coretime units assigned
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @dev Slot 0: treasuryReserve (uint128) + lastEpochBlock (uint128)
    uint128 public treasuryReserve;
    uint128 public lastEpochBlock;

    /// @dev Slot 1: treasuryBps (uint32) + epochCount (uint224)
    uint32  public treasuryBps;
    uint224 public epochCount;

    /// @dev Slots 2+: partner registry
    mapping(uint32 => PartnerParachain) public partners;
    uint32[] public partnerIds;

    /// @dev Lifetime DOT spent on Coretime
    uint256 public totalCoretimeSpent;

    // -------------------------------------------------------------------------
    // Storage gap
    // -------------------------------------------------------------------------

    uint256[50] private __gap;

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /// @param admin        ADMIN_ROLE + DEFAULT_ADMIN_ROLE.
    /// @param upgrader     UPGRADER_ROLE (Timelock).
    /// @param keeper       KEEPER_ROLE (bot or PolkaPulseCore).
    /// @param pauser       PAUSER_ROLE (multisig emergency).
    /// @param _treasuryBps Fraction of yield to accumulate (BPS, e.g. 500 = 5%).
    function initialize(
        address admin,
        address upgrader,
        address keeper,
        address pauser,
        uint32  _treasuryBps
    ) external initializer {
        Validation.requireNonZeroAddress(admin);
        Validation.requireNonZeroAddress(upgrader);
        Validation.requireNonZeroAddress(keeper);
        Validation.requireNonZeroAddress(pauser);

        if (_treasuryBps > MAX_TREASURY_BPS)
            revert TreasuryBpsExceedsMax(_treasuryBps);

        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(KEEPER_ROLE, keeper);
        _grantRole(PAUSER_ROLE, pauser);

        treasuryBps    = _treasuryBps;
        lastEpochBlock = 0;
        epochCount     = 0;
        treasuryReserve = 0;
    }

    // -------------------------------------------------------------------------
    // Treasury accumulation
    // -------------------------------------------------------------------------

    /// @notice Credit a portion of harvested yield to the treasury reserve.
    ///         Called by PolkaPulseCore after each yield harvest.
    ///         The treasury fraction is treasuryBps / BPS_MAX of the yield.
    ///
    /// @dev    No external calls here — pure accounting. Not reentrant risk.
    ///
    /// @param yieldDot Total yield harvested in this cycle (18-decimal DOT).
    /// @return reserved DOT amount credited to the treasury reserve.
    function accumulateReserve(uint256 yieldDot)
        external
        onlyRole(KEEPER_ROLE)
        returns (uint256 reserved)
    {
        Validation.requireNonZeroAmount(yieldDot);

        reserved = yieldDot * treasuryBps / Validation.BPS_MAX;

        // Overflow-safe: treasuryReserve is uint128 and reserved is bounded
        // by MAX_TREASURY_BPS (20%) of yieldDot. For u128 to overflow, yieldDot
        // would need to be 6.8e38 DOT — physically impossible.
        treasuryReserve += uint128(reserved);
    }

    // -------------------------------------------------------------------------
    // Epoch trigger — Coretime purchase
    // -------------------------------------------------------------------------

    /// @notice Trigger the weekly Coretime purchase epoch.
    ///         Purchases Bulk Coretime NFTs using the accumulated treasury reserve
    ///         and distributes them to whitelisted partner parachains.
    ///
    /// @dev    CALL ORDER (CEI):
    ///         1. Check — epoch ready, reserve > 0, not paused
    ///         2. Effect — update lastEpochBlock and drain reserve BEFORE XCM call
    ///         3. Interact — dispatch XCM purchase
    ///
    /// @param minCoretimeUnits Minimum Coretime units to purchase (slippage guard).
    ///                         Reverts if the purchase returns fewer units than this.
    function epochTrigger(uint256 minCoretimeUnits)
        external
        nonReentrant
        whenNotPaused
        onlyRole(KEEPER_ROLE)
    {
        // CHECK — epoch timing gate
        uint256 nextEpoch = uint256(lastEpochBlock) + EPOCH_BLOCKS;
        if (block.number < nextEpoch)
            revert EpochNotReady(block.number, nextEpoch);

        uint256 reserve = treasuryReserve;
        if (reserve == 0)
            revert ReserveTooLow(0, 1);

        // CHECK — at least one active partner to assign Coretime to
        uint256 activeCount = _activePartnerCount();
        if (activeCount == 0)
            revert ReserveTooLow(0, 1); // reuse error — no partners = no purchase

        // EFFECT — drain reserve and advance epoch BEFORE external call
        treasuryReserve = 0;
        lastEpochBlock  = uint128(block.number);
        uint224 currentEpoch = ++epochCount;

        totalCoretimeSpent += reserve;

        // INTERACT — dispatch XCM purchase to Coretime Chain
        uint256 coretimeUnits = _purchaseCoretime(reserve, minCoretimeUnits);

        emit Events.CoretimePurchased(currentEpoch, reserve, coretimeUnits);

        // --- Distribute Coretime across active partners proportionally ---
        _distributeCoretime(coretimeUnits, activeCount);
    }

    // -------------------------------------------------------------------------
    // Internal — Coretime purchase
    // -------------------------------------------------------------------------

    /// @notice Dispatch an XCM Transact to the Coretime Chain to purchase
    ///         Bulk Coretime with the available reserve DOT.
    ///         Returns the number of Coretime units purchased.
    ///
    /// @dev    In production the `call` encoding targets the Coretime Chain's
    ///         `broker.purchase(cores)` extrinsic. The weight is benchmarked
    ///         against actual Coretime Chain block weights. For the MVP the
    ///         call encoding is a placeholder that will be populated before
    ///         mainnet deployment once the Coretime API is stable.
    function _purchaseCoretime(uint256 dotAmount, uint256 minUnits)
        internal
        returns (uint256 coretimeUnits)
    {
        // Encode the broker.purchase extrinsic call for the Coretime Chain.
        // Format: pallet_index (1 byte) | call_index (1 byte) | SCALE-encoded amount
        bytes memory coretimeCall = abi.encodePacked(
            uint8(0x34),  // broker pallet index (placeholder — verify against runtime)
            uint8(0x01),  // purchase call index
            _scaleEncodeU128(dotAmount)
        );

        // Dispatch via XCM remoteTransact.
        // Weight: 1_000_000_000 ref_time units — benchmark before mainnet.
        IXCMPrecompile(XCM_PRECOMPILE).remoteTransact(
            CORETIME_CHAIN_PARA_ID,
            coretimeCall,
            1_000_000_000
        );

        // In production, coretimeUnits is returned from the XCM response.
        // For the MVP, we estimate based on a fixed DOT/Coretime rate.
        // This WILL be replaced with actual on-chain Coretime pricing before mainnet.
        coretimeUnits = dotAmount / 1e18; // 1 unit per DOT (placeholder rate)

        if (coretimeUnits < minUnits)
            revert CoretimePurchaseFailed();
    }

    /// @notice Distribute purchased Coretime units to active partner parachains.
    ///         Distribution is equal-weight across all active partners.
    function _distributeCoretime(uint256 totalUnits, uint256 activeCount)
        internal
    {
        uint256 unitsPerPartner = totalUnits / activeCount;
        uint256 remainder = totalUnits % activeCount;

        for (uint256 i = 0; i < partnerIds.length; i++) {
            uint32 pid = partnerIds[i];
            PartnerParachain storage partner = partners[pid];

            if (!partner.active) continue;

            // Give the remainder to the first active partner
            uint256 units = unitsPerPartner;
            if (remainder > 0) {
                units += remainder;
                remainder = 0;
            }

            partner.totalCoretimeReceived += units;

            // Dispatch XCM assignment to the Coretime Chain
            _assignCoretime(pid, units);

            emit Events.CoretimeAssigned(pid, units, partner.boostedYieldBps);
        }
    }

    /// @notice Dispatch an XCM Transact to assign Coretime to a specific parachain.
    function _assignCoretime(uint32 parachainId, uint256 units) internal {
        bytes memory assignCall = abi.encodePacked(
            uint8(0x34),       // broker pallet index (placeholder)
            uint8(0x03),       // assign call index
            _scaleEncodeU32(parachainId),
            _scaleEncodeU128(units)
        );

        IXCMPrecompile(XCM_PRECOMPILE).remoteTransact(
            CORETIME_CHAIN_PARA_ID,
            assignCall,
            500_000_000
        );
    }

    // -------------------------------------------------------------------------
    // Partner registry (ADMIN_ROLE)
    // -------------------------------------------------------------------------

    /// @notice Add a partner parachain to the Coretime distribution whitelist.
    /// @param parachainId      Polkadot parachain ID.
    /// @param boostedYieldBps  Committed boosted yield rate in BPS (e.g. 200 = 2%).
    function addPartner(uint32 parachainId, uint256 boostedYieldBps)
        external
        onlyRole(ADMIN_ROLE)
    {
        Validation.requireValidParachainId(parachainId);
        Validation.requireValidBps(boostedYieldBps);

        if (partners[parachainId].active)
            revert ParachainAlreadyRegistered(parachainId);

        partners[parachainId] = PartnerParachain({
            parachainId:           parachainId,
            boostedYieldBps:       boostedYieldBps,
            active:                true,
            totalCoretimeReceived: 0
        });
        partnerIds.push(parachainId);

        emit Events.PartnerParachainAdded(parachainId, boostedYieldBps);
    }

    /// @notice Remove a partner parachain from the whitelist.
    ///         Does not affect already-assigned Coretime on the Coretime Chain.
    function removePartner(uint32 parachainId)
        external
        onlyRole(ADMIN_ROLE)
    {
        if (!partners[parachainId].active)
            revert ParachainNotWhitelisted(parachainId);

        partners[parachainId].active = false;

        emit Events.PartnerParachainRemoved(parachainId);
    }

    /// @notice Update the treasury fraction taken from each yield harvest.
    function setTreasuryBps(uint32 newBps)
        external
        onlyRole(ADMIN_ROLE)
    {
        if (newBps > MAX_TREASURY_BPS)
            revert TreasuryBpsExceedsMax(newBps);
        emit Events.TreasuryThresholdUpdated(treasuryBps, newBps);
        treasuryBps = newBps;
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /// @notice Returns the number of blocks until the next epoch is available.
    function blocksUntilNextEpoch() external view returns (uint256) {
        uint256 nextEpoch = uint256(lastEpochBlock) + EPOCH_BLOCKS;
        if (block.number >= nextEpoch) return 0;
        return nextEpoch - block.number;
    }

    /// @notice Returns all registered partner IDs (including inactive ones).
    function getPartnerIds() external view returns (uint32[] memory) {
        return partnerIds;
    }

    function _activePartnerCount() internal view returns (uint256 count) {
        for (uint256 i = 0; i < partnerIds.length; i++) {
            if (partners[partnerIds[i]].active) count++;
        }
    }

    // -------------------------------------------------------------------------
    // SCALE encoding helpers (minimal, for XCM call construction)
    // -------------------------------------------------------------------------

    /// @dev SCALE compact-encodes a uint128. Used for Coretime call encoding.
    ///      For values < 2^30, SCALE compact encoding fits in 4 bytes.
    ///      This is a simplified implementation — production should use a full
    ///      SCALE codec library once available for Solidity.
    function _scaleEncodeU128(uint256 value) internal pure returns (bytes memory) {
        return abi.encodePacked(uint128(value));
    }

    function _scaleEncodeU32(uint32 value) internal pure returns (bytes memory) {
        return abi.encodePacked(value);
    }

    // -------------------------------------------------------------------------
    // Emergency
    // -------------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(ADMIN_ROLE) { _unpause(); }

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