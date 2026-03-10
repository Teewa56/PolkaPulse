// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockXCMPrecompile {
    function remoteTransact(uint32, bytes calldata, uint64) external {}
    function teleportDOT(uint32, address, uint256, uint64) external {}
    function executeXCM(bytes calldata, bytes calldata) external {}
    function sovereignAccount(uint32) external pure returns (address) {
        return address(0);
    }
}
