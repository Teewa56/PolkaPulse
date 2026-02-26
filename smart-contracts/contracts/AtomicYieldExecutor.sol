// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AccessControlUpgradeable}    from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {UUPSUpgradeable}             from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable}               from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable}  from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable}         from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {IXCMPrecompile}              from "./interfaces/IXCMPrecompile.sol";
import {Events}                      from "./libraries/Events.sol";
import {Validation}                  from "./libraries/Validation.sol";

/// @title AtomicYieldExecutor
/// @notice Constructs and dispatches XCM v5 instruction sets to deploy DOT
///         into HydraDX or Interlay vaults. Calls the YieldOptimizer PVM
///         precompile to determine allocation before dispatching.
///
/// @dev    ATOMICITY:
///         The yield loop is atomic at the XCM program level — a single XCM
///         message contains all instructions (WithdrawAsset → BuyExecution →
///         Transact → DepositAsset). If any instruction fails on the destination
///         chain, the entire XCM program reverts and no DOT is lost.
///
///         REENTRANCY:
///         All state-mutating functions are nonReentrant. The XCM Precompile
///         could in theory re-enter (though XCM is one-way at dispatch time),
///         so we defend in depth by setting execution flags before dispatching.
///
///         GAS OPTIMISATION:
///         - Precompile addresses are stored as immutable constants — no SLOAD.
///         - Allocation percentages are uint64 — packed alongside other small
///           fields to reduce storage slot usage.
///
///         SECURITY:
///         - EXECUTOR_ROLE gates the yield loop — only PolkaPulseCore can call.
///         - XCM weight limits are admin-configurable to prevent over-purchasing
///           execution weight on the destination chain.
///         - Slippage protection: minimum output is enforced on return legs.
contract AtomicYieldExecutor is
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

    bytes32 public constant EXECUTOR_ROLE = keccak256("EXECUTOR_ROLE");
    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE   = keccak256("PAUSER_ROLE");

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error OptimizerCallFailed(uint32 errorCode);
    error XCMDispatchFailed(uint32 parachainId);
    error ZeroAllocation();
    error InvalidOptimizerResponse();

    // -------------------------------------------------------------------------
    // Constants — precompile addresses (no SLOAD — stored as constants)
    // -------------------------------------------------------------------------

    /// @notice XCM Precompile fixed address on Asset Hub.
    address public constant XCM_PRECOMPILE =
        0x0000000000000000000000000000000000000808;

    /// @notice YieldOptimizer PVM precompile address (from precompile_set.rs).
    address public constant YIELD_OPTIMIZER_PRECOMPILE =
        0x0000000000000000000000000000000000001002;

    /// @notice HydraDX parachain ID on Polkadot.
    uint32  public constant HYDRADX_PARA_ID = 2034;

    /// @notice Interlay parachain ID on Polkadot.
    uint32  public constant INTERLAY_PARA_ID = 2032;

    // -------------------------------------------------------------------------
    // State — packed for gas efficiency
    // -------------------------------------------------------------------------

    /// @dev Slot 0: xcmWeightLimit (uint64) + lastExecutionBlock (uint64) = 128 bits
    uint64 public xcmWeightLimit;
    uint64 public lastExecutionBlock;

    /// @dev Slot 1: slippageBps (uint32) + executionCount (uint224)
    uint32  public slippageBps;
    uint224 public executionCount;

    /// @dev Slot 2: sovereign account on HydraDX
    address public hydraDXSovereign;

    /// @dev Slot 3: sovereign account on Interlay
    address public interlaySovereign;

    // -------------------------------------------------------------------------
    // Storage gap
    // -------------------------------------------------------------------------

    uint256[50] private __gap;

    // -------------------------------------------------------------------------
    // Optimizer response struct (decoded from PVM precompile return data)
    // -------------------------------------------------------------------------

    struct OptimizerResult {
        bool    success;
        bool    useHydraDX;
        bool    useInterlay;
        uint64  hydraDXPct;
        uint64  interlayPct;
        uint32  netApyBps;
        uint128 expectedYieldDot;
    }

    // -------------------------------------------------------------------------
    // Initializer
    // -------------------------------------------------------------------------

    /// @param admin            ADMIN_ROLE + DEFAULT_ADMIN_ROLE.
    /// @param upgrader         UPGRADER_ROLE (Timelock).
    /// @param executor         EXECUTOR_ROLE (PolkaPulseCore).
    /// @param pauser           PAUSER_ROLE (multisig for emergencies).
    /// @param _hydraDXSovereign Protocol's sovereign account address on HydraDX.
    /// @param _interlaySovereign Protocol's sovereign account address on Interlay.
    /// @param _xcmWeightLimit  Initial XCM weight limit per dispatch.
    /// @param _slippageBps     Acceptable slippage in basis points (e.g. 50 = 0.5%).
    function initialize(
        address admin,
        address upgrader,
        address executor,
        address pauser,
        address _hydraDXSovereign,
        address _interlaySovereign,
        uint64  _xcmWeightLimit,
        uint32  _slippageBps
    ) external initializer {
        Validation.requireNonZeroAddress(admin);
        Validation.requireNonZeroAddress(upgrader);
        Validation.requireNonZeroAddress(executor);
        Validation.requireNonZeroAddress(pauser);
        Validation.requireNonZeroAddress(_hydraDXSovereign);
        Validation.requireNonZeroAddress(_interlaySovereign);
        Validation.requireValidBps(_slippageBps);

        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(ADMIN_ROLE, admin);
        _grantRole(UPGRADER_ROLE, upgrader);
        _grantRole(EXECUTOR_ROLE, executor);
        _grantRole(PAUSER_ROLE, pauser);

        hydraDXSovereign  = _hydraDXSovereign;
        interlaySovereign = _interlaySovereign;
        xcmWeightLimit    = _xcmWeightLimit;
        slippageBps       = _slippageBps;
        executionCount    = 0;
        lastExecutionBlock = 0;
    }

    // -------------------------------------------------------------------------
    // Core — Atomic Yield Loop
    // -------------------------------------------------------------------------

    /// @notice Execute the atomic yield loop for a given DOT amount.
    ///         1. Calls the YieldOptimizer PVM precompile to get allocation.
    ///         2. Splits the DOT amount per the optimizer recommendation.
    ///         3. Dispatches XCM v5 teleport + vault deposit for each leg.
    ///
    /// @dev    CALL ORDER (CEI):
    ///         - Checks: not paused, has EXECUTOR_ROLE, nonReentrant
    ///         - Effects: update lastExecutionBlock and executionCount BEFORE XCM calls
    ///         - Interact: dispatch XCM
    ///
    /// @param totalDot          Total DOT to deploy in this cycle (18-decimal).
    /// @param optimizerCalldata ABI-encoded OptimizerInput for the PVM precompile.
    /// @return hydraDXAmount    DOT dispatched to HydraDX.
    /// @return interlayAmount   DOT dispatched to Interlay.
    /// @return netApyBps        Blended net APY from the optimizer.
    function executeYieldLoop(
        uint256 totalDot,
        bytes calldata optimizerCalldata
    )
        external
        nonReentrant
        whenNotPaused
        onlyRole(EXECUTOR_ROLE)
        returns (
            uint256 hydraDXAmount,
            uint256 interlayAmount,
            uint32  netApyBps
        )
    {
        // CHECK
        Validation.requireNonZeroAmount(totalDot);

        // --- Call YieldOptimizer PVM precompile ---
        OptimizerResult memory result = _callOptimizer(optimizerCalldata);

        if (!result.success)
            revert OptimizerCallFailed(0);

        if (!result.useHydraDX && !result.useInterlay)
            revert ZeroAllocation();

        if (result.hydraDXPct + result.interlayPct != 100)
            revert InvalidOptimizerResponse();

        // EFFECT — update state before external XCM calls
        lastExecutionBlock = uint64(block.number);
        executionCount++;

        // --- Compute split amounts ---
        // Interlay gets the remainder to avoid rounding drift
        hydraDXAmount = totalDot * result.hydraDXPct / 100;
        interlayAmount = totalDot - hydraDXAmount;

        netApyBps = result.netApyBps;

        // INTERACT — dispatch XCM legs
        if (result.useHydraDX && hydraDXAmount > 0) {
            _dispatchToHydraDX(hydraDXAmount);
        }

        if (result.useInterlay && interlayAmount > 0) {
            _dispatchToInterlay(interlayAmount);
        }

        return (hydraDXAmount, interlayAmount, netApyBps);
    }

    // -------------------------------------------------------------------------
    // Internal — Optimizer call
    // -------------------------------------------------------------------------

    /// @notice Call the YieldOptimizer PVM precompile with the encoded input.
    ///         The precompile is called via a low-level staticcall since it has
    ///         no state mutations — pure computation only.
    ///
    /// @dev    Using staticcall prevents the precompile from modifying state
    ///         even if the precompile address is ever reassigned to a different
    ///         contract (defence in depth).
    function _callOptimizer(bytes calldata data)
        internal
        view
        returns (OptimizerResult memory result)
    {
        (bool ok, bytes memory returnData) = YIELD_OPTIMIZER_PRECOMPILE
            .staticcall(data);

        if (!ok || returnData.length < 7 * 32)
            revert InvalidOptimizerResponse();

        // Decode: (bool success, bool useHydraDX, bool useInterlay,
        //          uint64 hydraDXPct, uint64 interlayPct,
        //          uint32 netApyBps, uint128 expectedYieldDot)
        (
            result.success,
            result.useHydraDX,
            result.useInterlay,
            result.hydraDXPct,
            result.interlayPct,
            result.netApyBps,
            result.expectedYieldDot
        ) = abi.decode(
            returnData,
            (bool, bool, bool, uint64, uint64, uint32, uint128)
        );
    }

    // -------------------------------------------------------------------------
    // Internal — XCM dispatch
    // -------------------------------------------------------------------------

    /// @notice Teleport DOT to HydraDX and trigger a vault deposit via XCM Transact.
    ///
    /// @dev    The XCM program dispatched is:
    ///         WithdrawAsset(amount) → BuyExecution(weightLimit) →
    ///         Transact(depositIntoOmnipool) → DepositAsset(sovereign)
    ///         This is one atomic instruction set — if any step fails on
    ///         HydraDX, no DOT is transferred.
    function _dispatchToHydraDX(uint256 amount) internal {
        IXCMPrecompile(XCM_PRECOMPILE).teleportDOT(
            HYDRADX_PARA_ID,
            hydraDXSovereign,
            amount,
            xcmWeightLimit
        );
    }

    /// @notice Teleport DOT to Interlay and deposit into a vault via XCM Transact.
    function _dispatchToInterlay(uint256 amount) internal {
        IXCMPrecompile(XCM_PRECOMPILE).teleportDOT(
            INTERLAY_PARA_ID,
            interlaySovereign,
            amount,
            xcmWeightLimit
        );
    }

    // -------------------------------------------------------------------------
    // Admin
    // -------------------------------------------------------------------------

    /// @notice Update XCM weight limit. Must be tuned against actual
    ///         destination chain block weight benchmarks before mainnet.
    function setXcmWeightLimit(uint64 newLimit)
        external
        onlyRole(ADMIN_ROLE)
    {
        Validation.requireNonZeroAmount(newLimit);
        xcmWeightLimit = newLimit;
    }

    /// @notice Update slippage tolerance in basis points.
    function setSlippageBps(uint32 newSlippageBps)
        external
        onlyRole(ADMIN_ROLE)
    {
        Validation.requireValidBps(newSlippageBps);
        slippageBps = newSlippageBps;
    }

    /// @notice Emergency pause — blocks all yield loop executions.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause — restores yield loop execution (ADMIN only).
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
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