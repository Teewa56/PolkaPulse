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

    constructor(address _core) {
        core = ICore(_core);
    }

    function attack() external {
        core.deposit(1 ether, 0, block.timestamp + 1);
    }

    fallback() external payable {
        core.deposit(1 ether, 0, block.timestamp + 1);
    }
}
