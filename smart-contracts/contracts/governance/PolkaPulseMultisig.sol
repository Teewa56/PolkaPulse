// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Events} from "../libraries/Events.sol";
import {Validation} from "../libraries/Validation.sol";

/// @title PolkaPulseMultisig
/// @notice Lightweight M-of-N multisig wallet that acts as the proposer and
///         executor for the PolkaPulseTimelock. All protocol parameter changes,
///         upgrades, and emergency actions must pass through this multisig
///         before being queued in the timelock, giving the team a transparent
///         on-chain governance trail.
///
/// @dev    DECENTRALISATION NOTE:
///         The multisig is an intentional centralisation point during the
///         protocol's early phase. The roadmap targets transitioning ownership
///         to a DOT-holder governance token in Phase 3. Until then, the
///         timelock delay (minimum 48 hours) ensures the community has a
///         reaction window for any proposed change.
///
///         SECURITY PROPERTIES:
///         - Owners are set at construction and cannot be changed without a
///           full contract redeployment, removing owner-management attack vectors.
///         - Every transaction requires M confirmations before execution.
///         - Transactions that have already executed cannot be re-executed.
///         - Reentrancy is blocked by the executedTx flag set before the call.
contract PolkaPulseMultisig {
    using Validation for *;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotOwner(address caller);
    error TxDoesNotExist(uint256 txId);
    error TxAlreadyExecuted(uint256 txId);
    error TxAlreadyConfirmed(uint256 txId, address owner);
    error TxNotConfirmed(uint256 txId, address owner);
    error InsufficientConfirmations(uint256 have, uint256 need);
    error TxExecutionFailed(uint256 txId);
    error InvalidRequirement(uint256 ownerCount, uint256 required);

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    struct Transaction {
        address target;     // Call target address
        uint256 value;      // ETH/DOT value to send
        bytes   data;       // Encoded calldata
        bool    executed;   // Execution flag — set BEFORE the call (CEI)
        uint256 confirmations; // Number of owner confirmations
    }

    address[] public owners;
    uint256   public required;           // M in M-of-N

    mapping(address => bool)               public isOwner;
    mapping(uint256 => Transaction)        public transactions;
    mapping(uint256 => mapping(address => bool)) public confirmed;

    uint256 public txCount;

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotOwner(msg.sender);
        _;
    }

    modifier txExists(uint256 txId) {
        if (txId >= txCount) revert TxDoesNotExist(txId);
        _;
    }

    modifier notExecuted(uint256 txId) {
        if (transactions[txId].executed) revert TxAlreadyExecuted(txId);
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _owners   Array of owner addresses. No duplicates or zero addresses.
    /// @param _required Number of confirmations required to execute a transaction.
    constructor(address[] memory _owners, uint256 _required) {
        if (_owners.length == 0) revert InvalidRequirement(0, _required);
        if (_required == 0 || _required > _owners.length)
            revert InvalidRequirement(_owners.length, _required);

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            Validation.requireNonZeroAddress(owner);
            if (isOwner[owner]) revert InvalidRequirement(i, _required); // duplicate
            isOwner[owner] = true;
            owners.push(owner);
        }

        required = _required;
    }

    // -------------------------------------------------------------------------
    // Receive — allows multisig to hold DOT for gas on XCM calls
    // -------------------------------------------------------------------------

    receive() external payable {}

    // -------------------------------------------------------------------------
    // Propose
    // -------------------------------------------------------------------------

    /// @notice Propose a new transaction. Any owner may propose.
    /// @param target  Contract to call.
    /// @param value   DOT value to send with the call.
    /// @param data    ABI-encoded calldata.
    /// @return txId   ID of the newly created transaction.
    function propose(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyOwner returns (uint256 txId) {
        Validation.requireNonZeroAddress(target);

        txId = txCount;
        transactions[txId] = Transaction({
            target:        target,
            value:         value,
            data:          data,
            executed:      false,
            confirmations: 0
        });
        txCount++;

        emit Events.MultisigTxProposed(txId, msg.sender, target, value, data);
    }

    // -------------------------------------------------------------------------
    // Confirm
    // -------------------------------------------------------------------------

    /// @notice Confirm a pending transaction. Each owner can confirm once.
    /// @param txId  Transaction ID to confirm.
    function confirm(uint256 txId)
        external
        onlyOwner
        txExists(txId)
        notExecuted(txId)
    {
        if (confirmed[txId][msg.sender])
            revert TxAlreadyConfirmed(txId, msg.sender);

        confirmed[txId][msg.sender] = true;
        transactions[txId].confirmations++;

        emit Events.MultisigTxConfirmed(txId, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Revoke confirmation
    // -------------------------------------------------------------------------

    /// @notice Revoke a previously given confirmation.
    /// @param txId  Transaction ID to revoke confirmation for.
    function revoke(uint256 txId)
        external
        onlyOwner
        txExists(txId)
        notExecuted(txId)
    {
        if (!confirmed[txId][msg.sender])
            revert TxNotConfirmed(txId, msg.sender);

        confirmed[txId][msg.sender] = false;
        transactions[txId].confirmations--;

        emit Events.MultisigTxRevoked(txId, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Execute
    // -------------------------------------------------------------------------

    /// @notice Execute a transaction that has reached the required confirmations.
    ///
    /// @dev    CEI ORDER IS CRITICAL HERE:
    ///         1. Check — confirmations, not-executed
    ///         2. Effect — set executed = true BEFORE the external call
    ///         3. Interact — make the external call
    ///         Setting executed before the call prevents re-entrancy from
    ///         executing the same transaction twice.
    ///
    /// @param txId  Transaction ID to execute.
    function execute(uint256 txId)
        external
        onlyOwner
        txExists(txId)
        notExecuted(txId)
    {
        Transaction storage txn = transactions[txId];

        if (txn.confirmations < required)
            revert InsufficientConfirmations(txn.confirmations, required);

        // EFFECT: mark executed before the external call (CEI)
        txn.executed = true;

        // INTERACT: make the call
        (bool success, ) = txn.target.call{value: txn.value}(txn.data);
        if (!success) {
            // Roll back the executed flag so the tx can be retried
            // after fixing the target (e.g. re-proposing with correct calldata)
            txn.executed = false;
            revert TxExecutionFailed(txId);
        }

        emit Events.MultisigTxExecuted(txId);
    }

    // -------------------------------------------------------------------------
    // View helpers
    // -------------------------------------------------------------------------

    /// @notice Returns all owner addresses.
    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    /// @notice Returns the confirmation count for a transaction.
    function getConfirmationCount(uint256 txId)
        external
        view
        returns (uint256)
    {
        return transactions[txId].confirmations;
    }

    /// @notice Returns whether a specific owner has confirmed a transaction.
    function isConfirmed(uint256 txId, address owner)
        external
        view
        returns (bool)
    {
        return confirmed[txId][owner];
    }
}