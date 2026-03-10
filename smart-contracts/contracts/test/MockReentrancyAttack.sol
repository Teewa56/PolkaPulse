// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ICore {
    function deposit(
        uint256 amount,
        uint256 minPpDot,
        uint256 deadline
    ) external returns (uint256);
}

contract MockReentrancyAttack {
    ICore public core;
    bool private attacking;

    constructor(address _core) {
        core = ICore(_core);
    }

    function attack() external {
        attacking = true;
        core.deposit(1 ether, 0, block.timestamp + 1);
        attacking = false;
    }

    /// @notice Called by MockppDOT.mintShares when minting to a contract — re-enters core.deposit()
    function onMint() external {
        if (attacking) {
            attacking = false; // prevent infinite recursion
            core.deposit(1 ether, 0, block.timestamp + 1);
        }
    }

    fallback() external payable {
        core.deposit(1 ether, 0, block.timestamp + 1);
    }
}
