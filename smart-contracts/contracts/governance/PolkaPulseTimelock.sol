// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

/// @title PolkaPulseTimelock
/// @notice Wraps OpenZeppelin's TimelockController with PolkaPulse-specific
///         minimum delay enforcement and a hard floor that cannot be bypassed
///         even by the admin.
///
/// @dev    SECURITY MODEL:
///         - PolkaPulseMultisig is the sole PROPOSER. It queues transactions
///           after reaching M-of-N confirmation.
///         - After the delay expires, any EXECUTOR (initially also the multisig,
///           eventually open to any address) can trigger execution.
///         - The CANCELLER role (also multisig) can cancel queued operations
///           in an emergency before they execute.
///         - The timelock itself is the ADMIN of all upgradeable contracts,
///           meaning no upgrade can bypass the delay window.
///
///         MINIMUM DELAY:
///         Set to 48 hours at deployment. The community has this window to
///         observe any queued upgrade or parameter change and react (e.g. by
///         withdrawing funds) before it takes effect. The multisig cannot
///         reduce the delay below MIN_DELAY even through a queued operation
///         because updateDelay() is itself subject to the timelock.
///
///         DECENTRALISATION PATH:
///         In Phase 3, the PROPOSER role will be granted to a governance
///         token voting contract, making the multisig redundant. The timelock
///         remains as a safety buffer regardless of governance mechanism.
contract PolkaPulseTimelock is TimelockController {

    /// @notice Minimum enforced delay: 48 hours.
    ///         Hardcoded at the contract level so it cannot be changed without
    ///         redeploying the timelock itself.
    uint256 public constant MIN_DELAY = 48 hours;

    error DelayBelowMinimum(uint256 proposed, uint256 minimum);

    /// @param initialDelay   Delay in seconds. Must be >= MIN_DELAY.
    /// @param proposers      Addresses granted PROPOSER_ROLE (should be the multisig).
    /// @param executors      Addresses granted EXECUTOR_ROLE (initially multisig,
    ///                       can be set to address(0) to allow anyone to execute
    ///                       after delay expires).
    /// @param admin          Address granted TIMELOCK_ADMIN_ROLE. Pass address(0)
    ///                       to make the timelock self-governing (recommended for
    ///                       production — admin role revoked after setup).
    constructor(
        uint256 initialDelay,
        address[] memory proposers,
        address[] memory executors,
        address admin
    )
        TimelockController(initialDelay, proposers, executors, admin)
    {
        if (initialDelay < MIN_DELAY)
            revert DelayBelowMinimum(initialDelay, MIN_DELAY);
    }

    /// @notice Override updateDelay to enforce the minimum delay floor.
    ///         Even a valid timelock admin cannot set the delay below 48 hours.
    /// @param newDelay  Proposed new delay in seconds.
    function updateDelay(uint256 newDelay) external override {
        // Only the timelock itself can call updateDelay (inherited behaviour)
        require(
            msg.sender == address(this),
            "TimelockController: caller must be timelock"
        );
        if (newDelay < MIN_DELAY)
            revert DelayBelowMinimum(newDelay, MIN_DELAY);

        super.updateDelay(newDelay);
    }
}