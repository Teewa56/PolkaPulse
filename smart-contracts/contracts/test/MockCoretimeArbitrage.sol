// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockCoretimeArbitrage {
    address public core;

    function setCore(address _core) external {
        core = _core;
    }

    function accumulateReserve(
        uint256 /* yieldDot */
    ) external pure returns (uint256) {
        return 0;
    }
}
