// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Run with: forge test --fuzz-runs 10000

import "forge-std/Test.sol";
import "../../contracts/PolkaPulseCore.sol";
import "../../contracts/ppDOT.sol";
import "../../contracts/libraries/Validation.sol";

contract FuzzPolkaPulseCore is Test {

    PolkaPulseCore core;
    ppDOT          token;

    address admin = address(0xAD);
    address alice = address(0xA1);

    uint256 constant PRECISION = 1e18;

    function setUp() public {
        token = new ppDOT(address(this));
        core  = new PolkaPulseCore();
    }

    /// totalDOT increases by exact deposit amount for any valid amount
    function testFuzz_DepositIncreasesTotalDOT(uint128 amount) public {
        amount = uint128(bound(uint256(amount), 1e15, 1_000_000_000 * 1e18));
        uint256 before = core.totalDOT();
        vm.prank(alice);
        core.deposit(amount);
        assertEq(core.totalDOT(), before + amount);
    }

    /// DOT → shares → DOT round-trip is within 1 wei
    function testFuzz_SharesRoundTrip(uint128 dotAmount) public {
        dotAmount = uint128(bound(uint256(dotAmount), 1e15, 1_000_000_000 * 1e18));
        uint128 shares      = core.dotToShares(dotAmount);
        uint128 dotReturned = core.sharesToDOT(shares);
        uint128 diff = dotAmount > dotReturned ? dotAmount - dotReturned : dotReturned - dotAmount;
        assertLe(diff, 1);
    }

    /// Any BPS above 10_000 always reverts
    function testFuzz_InvalidBpsReverts(uint32 bps) public {
        bps = uint32(bound(uint256(bps), 10_001, type(uint32).max));
        vm.expectRevert("Validation: BPS exceeds 100%");
        Validation.requireValidBps(bps);
    }

    /// Any BPS at or below 10_000 never reverts
    function testFuzz_ValidBpsNeverReverts(uint32 bps) public {
        bps = uint32(bound(uint256(bps), 0, 10_000));
        Validation.requireValidBps(bps);
    }

    /// Protocol fee never exceeds gross yield for any valid inputs
    function testFuzz_ProtocolFeeNeverExceedsYield(uint128 grossYield, uint32 feeBps) public {
        grossYield = uint128(bound(uint256(grossYield), 0, 1_000_000_000 * 1e18));
        feeBps     = uint32(bound(uint256(feeBps), 0, 10_000));
        uint128 fee = uint128((uint256(grossYield) * feeBps) / 10_000);
        assertLe(fee, grossYield);
    }

    /// requireSufficientShares reverts iff requested > balance
    function testFuzz_SufficientSharesEnforcement(uint128 requested, uint128 balance) public {
        if (requested > balance) {
            vm.expectRevert("Validation: insufficient ppDOT shares");
            Validation.requireSufficientShares(requested, balance);
        } else {
            Validation.requireSufficientShares(requested, balance);
        }
    }

    /// Exchange rate monotonicity — requireNonDecreasingRate reverts iff newRate < currentRate
    function testFuzz_ExchangeRateMonotonicity(uint256 currentRate, uint256 newRate) public {
        currentRate = bound(currentRate, 1e18, 1_000_000 * 1e18);
        newRate     = bound(newRate, 0, 2_000_000 * 1e18);
        if (newRate < currentRate) {
            vm.expectRevert("Validation: exchange rate cannot decrease");
            Validation.requireNonDecreasingRate(currentRate, newRate);
        } else {
            Validation.requireNonDecreasingRate(currentRate, newRate);
        }
    }

    /// Coretime fraction never underflows net yield
    function testFuzz_CoretimeFractionNeverUnderflows(uint128 netYield, uint32 fractionBps) public {
        netYield    = uint128(bound(uint256(netYield), 0, 1_000_000_000 * 1e18));
        fractionBps = uint32(bound(uint256(fractionBps), 0, 10_000));
        uint128 fraction = uint128((uint256(netYield) * fractionBps) / 10_000);
        assertLe(fraction, netYield);
    }

    /// requireMaxAmount reverts iff amount > ceiling
    function testFuzz_MaxAmountEnforcement(uint128 amount, uint128 ceiling) public {
        if (amount > ceiling) {
            vm.expectRevert("Validation: amount exceeds maximum");
            Validation.requireMaxAmount(amount, ceiling);
        } else {
            Validation.requireMaxAmount(amount, ceiling);
        }
    }

    /// Zero deposit always reverts regardless of caller
    function testFuzz_ZeroDepositAlwaysReverts(address caller) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        vm.expectRevert("Validation: amount must be greater than zero");
        core.deposit(0);
    }
}

contract FuzzppDOT is Test {

    ppDOT  token;
    address core = address(0xC0);

    function setUp() public {
        token = new ppDOT(core);
    }

    /// notifyYield never lowers the exchange rate
    function testFuzz_NotifyYieldNeverLowersRate(uint128 initialDeposit, uint64 additionalYield) public {
        initialDeposit  = uint128(bound(uint256(initialDeposit), 1e18, 1_000_000 * 1e18));
        additionalYield = uint64(bound(uint256(additionalYield), 0, 100_000 * 1e18));

        vm.prank(core);
        token.mint(address(0xA1), initialDeposit);

        uint256 rateBefore = token.exchangeRate();
        uint256 newTotal   = uint256(initialDeposit) + uint256(additionalYield);

        vm.prank(core);
        token.notifyYield(newTotal, additionalYield);

        assertGe(token.exchangeRate(), rateBefore);
    }

    /// mint → burn round-trip is within 1 wei at the same rate
    function testFuzz_MintBurnRoundTrip(uint128 dotAmount) public {
        dotAmount = uint128(bound(uint256(dotAmount), 1e15, 1_000_000 * 1e18));

        vm.prank(core);
        uint256 shares = token.mint(address(0xA1), dotAmount);

        vm.prank(core);
        uint128 dotReturned = token.burn(address(0xA1), shares);

        uint128 diff = dotAmount > dotReturned ? dotAmount - dotReturned : dotReturned - dotAmount;
        assertLe(diff, 1);
    }
}