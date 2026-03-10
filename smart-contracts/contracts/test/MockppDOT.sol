// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockppDOT is ERC20 {
    address public core;
    uint256 public totalDotManaged;

    constructor() ERC20("PolkaPulse DOT", "ppDOT") {}

    function setCore(address _core) external {
        core = _core;
    }

    function mintShares(address to, uint256 amount) external {
        _mint(to, amount);
        if (to.code.length > 0) {
            to.call(abi.encodeWithSignature("onMint()"));
        }
    }

    function burnShares(address from, uint256 amount) external {
        _burn(from, amount);
    }

    function notifyYield(uint256 /* additionalYield */) external {}

    function dotToShares(uint256 amount) external pure returns (uint256) {
        return amount;
    }

    function sharesToDot(uint256 amount) external pure returns (uint256) {
        return amount;
    }

    function exchangeRate() external pure returns (uint256) {
        return 1e18;
    }

    function recordDeposit(uint256 amount) external {
        totalDotManaged += amount;
    }

    function recordWithdrawal(uint256 amount) external {
        totalDotManaged -= amount;
    }

    function sharesOf(address account) external view returns (uint256) {
        return balanceOf(account);
    }
}
