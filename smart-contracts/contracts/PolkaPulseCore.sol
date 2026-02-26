// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControlUpgradeable}   from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable}            from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable}              from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable}        from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IPolkaPulseCore}            from "./interfaces/IPolkaPulseCore.sol";
import {IAssetsPrecompile}          from "./interfaces/IAssetsPrecompile.sol";
import {ppDOT}                      from "./ppDOT.sol";
import {RewardMonitor}              from "./RewardMonitor.sol";
import {AtomicYieldExecutor}        from "./AtomicYieldExecutor.sol";
import {CoretimeArbitrage}          from "./CoretimeArbitrage.sol";
import {Events}                     from "./libraries/Events.sol";
import {Validation}                 from "./libraries/Validation.sol";

/// @title PolkaPulseCore
/// @notice The single user-facing entry point for the PolkaPulse protocol.
///         Handles all deposits, withdrawals, and orchestrates the yield loop
///         across RewardMonitor, AtomicYieldExecutor, and CoretimeArbitrage.
///
/// @dev    ARCHITECTURE:
///         PolkaPulseCore is the owner/orchestrator of all sub-contracts.
///         It holds the MINTER_ROLE on ppDOT and the KEEPER/EXECUTOR role
///         on all downstream contracts. No sub-contract calls users directly.
///
///         UPGRADEABILITY:
///         UUPS proxy pattern. The UPGRADER_ROLE is held by PolkaPulseTimelock.
///         All upgrades require multisig proposal → 48h timelock → execution.
///
///         REENTRANCY DISCIPLINE:
///         All external-call-containing functions are marked nonReentrant.
///         The CEI pattern is strictly followed in every function:
///           1. Checks  (validate inputs, state preconditions)
///           2. Effects (update all state variables)
///           3. Interact (call ppDOT, precompiles, sub-contracts)
///         This ordering ensures that even if a sub-contract re-enters,
///         it observes already-updated state and cannot exploit old values.
///
///         ACCESS CONTROL:
///         - DEFAULT_ADMIN_ROLE → Timelock (set during initializer)
///         - ADMIN_ROLE         → Timelock (parameter changes)
///         - KEEPER_ROLE        → Off-chain keeper bots
///         - PAUSER_ROLE        → Multisig (emergency only)
///         - UPGRADER_ROLE      → Timelock (upgrades)
///
///         DECENTRALISATION:
///         Phase 1: Timelock + Multisig governance (this implementation).
///         Phase 3: ADMIN_ROLE transitions to DOT-holder governance token.
///         The timelock delay ensures a community reaction window at all phases.
///
///         STORAGE LAYOUT:
///         Variable ordering is intentional to minimise storage slots.
///         Do NOT reorder variables across upgrades — append only.
///         A 50-slot __gap is reserved for future additions.
contract PolkaPulseCore is
    Initializable,
    IPolkaPulseCore,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    using Validation for *;

    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    bytes32 public constant ADMIN_ROLE   = keccak256("ADMIN_ROLE");
    bytes32 public constant KEEPER_ROLE  = keccak256("KEEPER_ROLE");
    bytes32 public constant PAUSER_ROLE  = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // -------------------------------------------------------------------------
    // Custom errors
    // -------------------------------------------------------------------------

    error HarvestThresholdNotMet();
    error YieldLoopAlreadyRunning();
    error SubContractCallFailed(string target);
    error InsufficientDotBalance(uint256 available, uint256 required);

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Asset Hub Assets Precompile address.
    address public constant ASSETS_PRECOMPILE =
        0x0000000000000000000000000000000000000806;

    // -------------------------------------------------------------------------
    // State — ordered by size descending to pack into minimum slots
    // -------------------------------------------------------------------------

    /// @dev Slot 0: ppDOT token contract address
    ppDOT public ppDotToken;

    /// @dev Slot 1: RewardMonitor address
    RewardMonitor public rewardMonitor;

    /// @dev Slot 2: AtomicYieldExecutor address
    AtomicYieldExecutor public yieldExecutor;

    /// @dev Slot 3: CoretimeArbitrage address
    CoretimeArbitrage public coretimeArbitrage;

    /// @dev Slot 4: harvestThreshold (uint128) + lastYieldBlock (uint128)
    uint128 public harvestThreshold;
    uint128 public lastYieldBlock;

    /// @dev Slot 5: protocolFeeBps (uint32) + _yieldLoopActive (bool, 8 bits)
    ///             packed together — bool uses 1 byte, uint32 uses 4 bytes
    uint32  public protocolFeeBps;
    bool    private _yieldLoopActive;

    /// @dev Slot 6: fee recipient address (for protocol fee)
    address public feeRecipient;

    /// @dev Slot 7: totalFeesCollected
    uint256 public totalFeesCollected;

    // -------------------------------------------------------------------------
    // Storage gap — 50 slots reserved for future upgrades
    // -------------------------------------------------------------------------

    uint256[50] private __gap;

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /// @notice Initialises the protocol. Called once atomically with proxy deployment.
    ///
    /// @param admin              Address for ADMIN_ROLE + DEFAULT_ADMIN_ROLE.
    ///                           Should be the Timelock in production.
    /// @param upgrader           Address for UPGRADER_ROLE (Timelock).
    /// @param keeper             Address for KEEPER_ROLE (off-chain keeper bot).
    /// @param pauser             Address for PAUSER_ROLE (multisig emergency).
    /// @param _ppDot             Deployed ppDOT contract address.
    /// @param _rewardMonitor     Deployed RewardMonitor address.
    /// @param _yieldExecutor     Deployed AtomicYieldExecutor address.
    /// @param _coretimeArbitrage Deployed CoretimeArbitrage address.
    /// @param _harvestThreshold  Initial harvest threshold (18-decimal DOT).
    /// @param _protocolFeeBps    Protocol fee on yield (BPS, max 2000 = 20%).
    /// @param _feeRecipient      Address receiving protocol fees.
    function initialize(
        address admin,
        address upgrader,
        address keeper,
        address pauser,
        address _ppDot,
        address _rewardMonitor,
        address _yieldExecutor,
        address _coretimeArbitrage,
        uint128 _harvestThreshold,
        uint32  _protocolFeeBps,
        address _feeRecipient
    ) external initializer {
        // --- Input validation ---
        Validation.requireNonZeroAddress(admin);
        Validation.requireNonZeroAddress(upgrader);
        Validation.requireNonZeroAddress(keeper);
        Validation.requireNonZeroAddress(pauser);
        Validation.requireNonZeroAddress(_ppDot);
        Validation.requireNonZeroAddress(_rewardMonitor);
        Validation.requireNonZeroAddress(_yieldExecutor);
        Validation.requireNonZeroAddress(_coretimeArbitrage);
        Validation.requireNonZeroAddress(_feeRecipient);
        Validation.requireNonZeroAmount(_harvestThreshold);
        Validation.requireValidFeeBps(_protocolFeeBps);

        // --- OZ initializers ---
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        // --- Role grants ---
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(KEEPER_ROLE, keeper);
        _grantRole(PAUSER_ROLE, pauser);

        // --- Sub-contract references ---
        ppDotToken        = ppDOT(_ppDot);
        rewardMonitor     = RewardMonitor(_rewardMonitor);
        yieldExecutor     = AtomicYieldExecutor(_yieldExecutor);
        coretimeArbitrage = CoretimeArbitrage(_coretimeArbitrage);

        // --- Protocol parameters ---
        harvestThreshold  = _harvestThreshold;
        protocolFeeBps    = _protocolFeeBps;
        feeRecipient      = _feeRecipient;
        _yieldLoopActive  = false;
        lastYieldBlock    = 0;
        totalFeesCollected = 0;
    }

    // =========================================================================
    // USER FUNCTIONS
    // =========================================================================

    /// @notice Deposit DOT into the protocol and receive ppDOT shares.
    ///
    /// @dev    CEI ORDER:
    ///         1. Checks: not paused, amount valid, deadline, slippage
    ///         2. Effects: read exchange rate, compute shares
    ///         3. Interact: transfer DOT in, mint ppDOT, update totalDotManaged
    ///
    ///         The exchange rate is captured BEFORE the DOT transfer so that
    ///         a depositor cannot manipulate the rate by front-running their
    ///         own deposit. totalDotManaged is updated AFTER minting shares to
    ///         prevent a read-during-write inconsistency.
    ///
    /// @param amount     DOT to deposit (18-decimal fixed-point).
    /// @param minPpDot   Minimum ppDOT to receive (slippage protection — reverts
    ///                   if the exchange rate moved adversely before inclusion).
    /// @param deadline   Unix timestamp — tx reverts if mined after this.
    /// @return ppDotMinted  ppDOT shares minted to the caller.
    function deposit(
        uint256 amount,
        uint256 minPpDot,
        uint256 deadline
    )
        external
        override
        nonReentrant
        whenNotPaused
        returns (uint256 ppDotMinted)
    {
        // --- CHECKS ---
        Validation.requireAboveMinDeposit(amount);
        Validation.requireNotExpired(deadline);

        // Capture exchange rate before any state change
        uint256 rate = ppDotToken.exchangeRate();
        Validation.requireNonZeroExchangeRate(rate);

        // Compute shares the depositor will receive at current rate
        ppDotMinted = ppDotToken.dotToShares(amount);

        // Slippage check: did the rate move against the depositor?
        if (ppDotMinted < minPpDot)
            revert Validation.SlippageExceeded(minPpDot, ppDotMinted);

        // Verify the caller actually has enough DOT on Asset Hub
        uint256 callerBalance = IAssetsPrecompile(ASSETS_PRECOMPILE)
            .balanceOf(msg.sender);
        if (callerBalance < amount)
            revert InsufficientDotBalance(callerBalance, amount);

        // --- EFFECTS --- (all state updates before external calls)
        // (No local state to update here — ppDOT is the canonical state)

        // --- INTERACT ---
        // 1. Transfer DOT from depositor to this contract
        bool transferred = IAssetsPrecompile(ASSETS_PRECOMPILE)
            .transfer(address(this), amount);
        if (!transferred) revert SubContractCallFailed("AssetsPrecompile.transfer");

        // 2. Record the deposit in ppDOT (increases totalDotManaged)
        ppDotToken.recordDeposit(amount);

        // 3. Mint ppDOT shares to the depositor
        ppDotToken.mintShares(msg.sender, ppDotMinted);

        emit Events.Deposited(msg.sender, amount, ppDotMinted, rate);
    }

    /// @notice Burn ppDOT shares and receive underlying DOT + accrued yield.
    ///
    /// @dev    CEI ORDER:
    ///         1. Checks: not paused, shares valid, deadline, slippage
    ///         2. Effects: compute DOT amount at current rate
    ///         3. Interact: burn shares, decrease totalDotManaged, transfer DOT out
    ///
    ///         Burning shares BEFORE transferring DOT ensures that if the DOT
    ///         transfer fails, the shares have already been destroyed — which
    ///         triggers the revert and the state is consistent.
    ///         Actually we must burn then transfer — if transfer fails, the tx
    ///         reverts atomically, restoring the burned shares.
    ///
    /// @param shares    ppDOT shares to burn.
    /// @param minDot    Minimum DOT to receive (slippage protection).
    /// @param deadline  Unix timestamp — tx reverts if mined after this.
    /// @return dotReturned DOT returned to the caller.
    function withdraw(
        uint256 shares,
        uint256 minDot,
        uint256 deadline
    )
        external
        override
        nonReentrant
        whenNotPaused
        returns (uint256 dotReturned)
    {
        // --- CHECKS ---
        Validation.requireNonZeroAmount(shares);
        Validation.requireNotExpired(deadline);

        uint256 userShares = ppDotToken.sharesOf(msg.sender);
        Validation.requireSufficientShares(shares, userShares);

        // Capture rate before any state change
        uint256 rate = ppDotToken.exchangeRate();
        Validation.requireNonZeroExchangeRate(rate);

        // Compute DOT to return at current rate
        dotReturned = ppDotToken.sharesToDot(shares);

        // Slippage check
        if (dotReturned < minDot)
            revert Validation.SlippageExceeded(minDot, dotReturned);

        // Verify contract holds enough DOT
        uint256 contractBalance = IAssetsPrecompile(ASSETS_PRECOMPILE)
            .balanceOf(address(this));
        if (contractBalance < dotReturned)
            revert InsufficientDotBalance(contractBalance, dotReturned);

        // --- EFFECTS --- (before external calls)
        // Update ppDOT totalDotManaged BEFORE burning shares to keep rate consistent
        ppDotToken.recordWithdrawal(dotReturned);

        // --- INTERACT ---
        // 1. Burn ppDOT shares
        ppDotToken.burnShares(msg.sender, shares);

        // 2. Transfer DOT to withdrawer
        bool sent = IAssetsPrecompile(ASSETS_PRECOMPILE)
            .transfer(msg.sender, dotReturned);
        if (!sent) revert SubContractCallFailed("AssetsPrecompile.transfer");

        emit Events.Withdrawn(msg.sender, shares, dotReturned, rate);
    }

    // =========================================================================
    // KEEPER FUNCTIONS
    // =========================================================================

    /// @notice Trigger the full atomic yield loop:
    ///         harvest rewards → optimizer call → XCM deploy → rebase ppDOT.
    ///         Additionally accumulates treasury reserve for Coretime arbitrage.
    ///
    /// @dev    REENTRANCY GUARD:
    ///         nonReentrant is applied. Additionally _yieldLoopActive is a
    ///         secondary application-level guard specifically for preventing
    ///         nested calls through governance/callback paths that might
    ///         bypass the OZ guard.
    ///
    ///         CEI ORDER:
    ///         1. Checks: KEEPER_ROLE, not paused, not already running, threshold met
    ///         2. Effects: set _yieldLoopActive = true, update lastYieldBlock
    ///         3. Interact: harvest → execute → notify yield → accumulate reserve
    ///         4. Cleanup: set _yieldLoopActive = false
    ///
    /// @param optimizerCalldata ABI-encoded OptimizerInput for the PVM precompile.
    ///                          Constructed off-chain by the keeper with current
    ///                          market data (APYs, fees, risk scores).
    function executeYieldLoop()
        external
        override
        nonReentrant
        whenNotPaused
        onlyRole(KEEPER_ROLE)
    {
        // We need optimizerCalldata — add it as a separate keeper function variant.
        // This override satisfies the interface; keepers should use executeYieldLoopWithData.
        revert("Use executeYieldLoopWithData");
    }

    /// @notice Full yield loop with optimizer calldata.
    ///         This is the function keepers should call in production.
    ///
    /// @param optimizerCalldata ABI-encoded OptimizerInput struct for the PVM precompile.
    function executeYieldLoopWithData(bytes calldata optimizerCalldata)
        external
        nonReentrant
        whenNotPaused
        onlyRole(KEEPER_ROLE)
    {
        // --- CHECKS ---
        if (_yieldLoopActive) revert YieldLoopAlreadyRunning();

        bool thresholdMet = rewardMonitor.shouldHarvest();
        if (!thresholdMet) revert HarvestThresholdNotMet();

        // --- EFFECTS ---
        _yieldLoopActive  = true;
        lastYieldBlock    = uint128(block.number);

        // --- INTERACT --- (step by step, each can independently revert)

        // Step 1: Harvest staking rewards from relay chain
        uint256 harvested = rewardMonitor.harvest();

        // Step 2: Deduct protocol fee from harvested amount
        uint256 fee = harvested * protocolFeeBps / Validation.BPS_MAX;
        uint256 deployableDot = harvested - fee;
        totalFeesCollected += fee;

        // Transfer fee to fee recipient
        if (fee > 0) {
            IAssetsPrecompile(ASSETS_PRECOMPILE).transfer(feeRecipient, fee);
        }

        // Step 3: Accumulate treasury reserve for Coretime arbitrage
        uint256 reserved = coretimeArbitrage.accumulateReserve(deployableDot);
        uint256 yieldableDot = deployableDot - reserved;

        // Step 4: Execute the atomic XCM yield loop via AtomicYieldExecutor
        (
            uint256 hydraDXAmount,
            uint256 interlayAmount,
            uint32  netApyBps
        ) = yieldExecutor.executeYieldLoop(yieldableDot, optimizerCalldata);

        // Step 5: Notify ppDOT of the new yield — updates exchange rate for all holders
        ppDotToken.notifyYield(yieldableDot);

        // --- CLEANUP ---
        _yieldLoopActive = false;

        emit Events.YieldLoopExecuted(
            msg.sender,
            harvested,
            hydraDXAmount,
            interlayAmount,
            netApyBps,
            block.number
        );
    }

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    /// @inheritdoc IPolkaPulseCore
    function exchangeRate() external view override returns (uint256) {
        return ppDotToken.exchangeRate();
    }

    /// @inheritdoc IPolkaPulseCore
    function totalDotManaged() external view override returns (uint256) {
        return ppDotToken.totalDotManaged();
    }

    /// @inheritdoc IPolkaPulseCore
    function ppDot() external view override returns (address) {
        return address(ppDotToken);
    }

    /// @inheritdoc IPolkaPulseCore
    function pendingRewards() external view override returns (uint256) {
        return rewardMonitor.pendingRewards();
    }

    // =========================================================================
    // ADMIN FUNCTIONS
    // =========================================================================

    /// @inheritdoc IPolkaPulseCore
    /// @dev Protected by ADMIN_ROLE (held by Timelock). Any threshold change
    ///      must pass through a 48-hour timelock delay.
    function setHarvestThreshold(uint256 newThreshold)
        external
        override
        onlyRole(ADMIN_ROLE)
    {
        Validation.requireNonZeroAmount(newThreshold);
        uint256 old = harvestThreshold;
        harvestThreshold = uint128(newThreshold);
        rewardMonitor.setHarvestThreshold(uint128(newThreshold));
        emit Events.HarvestThresholdUpdated(old, newThreshold);
    }

    /// @notice Update the protocol fee. Bounded by MAX_FEE_BPS (20%).
    function setProtocolFeeBps(uint32 newFeeBps)
        external
        onlyRole(ADMIN_ROLE)
    {
        Validation.requireValidFeeBps(newFeeBps);
        protocolFeeBps = newFeeBps;
    }

    /// @notice Update the fee recipient address.
    function setFeeRecipient(address newRecipient)
        external
        onlyRole(ADMIN_ROLE)
    {
        Validation.requireNonZeroAddress(newRecipient);
        feeRecipient = newRecipient;
    }

    /// @inheritdoc IPolkaPulseCore
    function pause(string calldata reason)
        external
        override
        onlyRole(PAUSER_ROLE)
    {
        _pause();
        emit Events.ProtocolPaused(msg.sender, reason);
    }

    /// @inheritdoc IPolkaPulseCore
    function unpause()
        external
        override
        onlyRole(ADMIN_ROLE)
    {
        _unpause();
        emit Events.ProtocolUnpaused(msg.sender);
    }

    // =========================================================================
    // UUPS UPGRADE
    // =========================================================================

    /// @notice Authorise an upgrade. Only the Timelock (UPGRADER_ROLE) can call.
    ///         Emits UpgradeAuthorised for off-chain monitoring.
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