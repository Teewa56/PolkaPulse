// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockRewardMonitor {
    address public core;
    bool private harvestReady;

    function setCore(address _core) external {
        core = _core;
    }

    function setHarvestReady(bool ready) external {
        harvestReady = ready;
    }

    function shouldHarvest() external view returns (bool) {
        return harvestReady;
    }

    function harvest() external pure returns (uint256) {
        return 0.1 ether;
    }
}
