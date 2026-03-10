// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITransferCallback {
    function onTransferCallback(
        address from,
        address to,
        uint256 amount
    ) external;
}

contract MockAssetsPrecompile {
    mapping(address => uint256) public balances;

    // Callback hook: if set, fires during transfer
    ITransferCallback public transferCallback;

    function setBalance(address account, uint256 amount) external {
        balances[account] = amount;
    }

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    /// @notice Register a callback contract that will be called during transfer
    function setTransferCallback(address callback) external {
        transferCallback = ITransferCallback(callback);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        balances[msg.sender] -= amount;
        balances[to] += amount;

        // Fire callback hook if registered (used for reentrancy testing)
        if (address(transferCallback) != address(0)) {
            transferCallback.onTransferCallback(msg.sender, to, amount);
        }

        return true;
    }
}
