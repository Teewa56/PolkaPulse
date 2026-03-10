// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICore {
    function deposit(
        uint256 amount,
        uint256 minPpDot,
        uint256 deadline
    ) external returns (uint256);
}

interface ITransferCallback {
    function onTransferCallback(
        address from,
        address to,
        uint256 amount
    ) external;
}

interface IMockAssetsPrecompile {
    function setTransferCallback(address callback) external;
}

contract MockReentrancyAttack is ITransferCallback {
    ICore public core;
    bool private attacking;

    constructor(address _core) {
        core = ICore(_core);
    }

    /// @notice Register this contract as the transfer callback on the mock precompile
    function registerCallback(address assetsPrecompile) external {
        IMockAssetsPrecompile(assetsPrecompile).setTransferCallback(
            address(this)
        );
    }

    function attack() external {
        attacking = true;
        core.deposit(1 ether, 0, block.timestamp + 1);
        attacking = false;
    }

    /// @notice Called by MockAssetsPrecompile during transfer — re-enters core.deposit()
    function onTransferCallback(address, address, uint256) external override {
        if (attacking) {
            attacking = false; // prevent infinite recursion
            core.deposit(1 ether, 0, block.timestamp + 1);
        }
    }

    fallback() external payable {
        core.deposit(1 ether, 0, block.timestamp + 1);
    }
}
