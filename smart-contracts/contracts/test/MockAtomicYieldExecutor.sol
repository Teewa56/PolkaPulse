// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockAtomicYieldExecutor {
    address public core;
    bool private returnFailure;
    uint256 private expectedYield;

    function setCore(address _core) external {
        core = _core;
    }

    function setReturnFailure(bool failure) external {
        returnFailure = failure;
    }

    function setExpectedYield(uint256 yield) external {
        expectedYield = yield;
    }

    function executeYieldLoop(
        uint256 /* totalDot */,
        bytes calldata /* optimizerCalldata */
    ) external returns (uint256, uint256, uint32) {
        if (returnFailure) revert("YieldLoopFailed");
        return (0, 0, 0);
    }
}
