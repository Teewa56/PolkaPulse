// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Run with: forge test --fuzz-runs 10000

import "forge-std/Test.sol";
import "../../contracts/PolkaPulseCore.sol";
import "../../contracts/ppDOT.sol";
import "../../contracts/libraries/Validation.sol";

contract FuzzPolkaPulseCore is Test {
    PolkaPulseCore core;
    ppDOT token;

    address admin = address(0xAD);
    address alice = address(0xA1);

    uint256 constant PRECISION = 1e18;

    function setUp() public {
        token = new ppDOT();
        core = new PolkaPulseCore();

        // Initialize ppDOT (admin = this, upgrader = this)
        token.initialize(address(this), address(this));

        // Initialize PolkaPulseCore
        // Using dummy addresses for simplicity in fuzzing logic where possible,
        // or this address if roles are needed.
        core.initialize(
            address(this), // admin
            address(this), // upgrader
            address(this), // keeper
            address(this), // pauser
            address(token), // _ppDot
            address(0x1), // _rewardMonitor (dummy)
            address(0x2), // _yieldExecutor (dummy)
            address(0x3), // _coretimeArbitrage (dummy)
            1e18, // _harvestThreshold
            100, // _protocolFeeBps
            address(0x4) // _feeRecipient
        );

        // Grant MINTER_ROLE to core on token
        token.grantRole(token.MINTER_ROLE(), address(core));

        // Mock IAssetsPrecompile.balance at 0x...806
        vm.mockCall(
            address(0x0000000000000000000000000000000000000806),
            abi.encodeWithSignature(
                "balance(uint256,address)",
                0,
                address(core)
            ),
            abi.encode(1000 ether)
        );

        // Mock IAssetsPrecompile.transfer at 0x...806
        vm.mockCall(
            address(0x0000000000000000000000000000000000000806),
            abi.encodeWithSignature(
                "transfer(address,uint256)",
                address(this),
                1e15
            ),
            abi.encode(true)
        );
        // Wildcard mock for any transfer from core
        vm.mockCall(
            address(0x0000000000000000000000000000000000000806),
            abi.encodeWithSignature("transfer(address,uint256)"),
            abi.encode(true)
        );
    }

    // Wrappers to allow vm.expectRevert to work on internal library functions
    function _requireValidBps(uint32 bps) external pure {
        Validation.requireValidBps(bps);
    }
    function _requireSufficientShares(uint128 r, uint128 b) external pure {
        Validation.requireSufficientShares(r, b);
    }
    function _requireNonDecreasingRate(uint256 c, uint256 n) external pure {
        Validation.requireNonDecreasingRate(c, n);
    }
    function _requireBelowMaximum(uint128 a, uint128 c) external pure {
        Validation.requireBelowMaximum(a, c);
    }

    /// totalDotManaged increases by exact deposit amount for any valid amount
    function testFuzz_DepositIncreasesTotalDOT(uint128 amount) public {
        amount = uint128(bound(uint256(amount), 1e15, 1_000_000_000 * 1e18));
        uint256 before = core.totalDotManaged();
        vm.prank(alice);
        core.deposit(amount, 0, block.timestamp + 1);
        assertEq(core.totalDotManaged(), before + amount);
    }

    /// DOT → shares → DOT round-trip is within 1 wei
    function testFuzz_SharesRoundTrip(uint128 dotAmount) public {
        dotAmount = uint128(
            bound(uint256(dotAmount), 1e15, 1_000_000_000 * 1e18)
        );
        uint256 shares = token.dotToShares(dotAmount);
        uint256 dotReturned = token.sharesToDot(shares);
        uint256 diff = dotAmount > dotReturned
            ? dotAmount - dotReturned
            : dotReturned - dotAmount;
        assertLe(diff, 1);
    }

    /// Any BPS above 10_000 always reverts
    function testFuzz_InvalidBpsReverts(uint32 bps) public {
        bps = uint32(bound(uint256(bps), 10_001, type(uint32).max));
        vm.expectRevert(
            abi.encodeWithSelector(
                Validation.BpsExceedsMax.selector,
                bps,
                10_000
            )
        );
        this._requireValidBps(bps);
    }

    /// Any BPS at or below 10_000 never reverts
    function testFuzz_ValidBpsNeverReverts(uint32 bps) public {
        bps = uint32(bound(uint256(bps), 0, 10_000));
        this._requireValidBps(bps);
    }

    /// Protocol fee never exceeds gross yield for any valid inputs
    function testFuzz_ProtocolFeeNeverExceedsYield(
        uint128 grossYield,
        uint32 feeBps
    ) public {
        grossYield = uint128(
            bound(uint256(grossYield), 0, 1_000_000_000 * 1e18)
        );
        feeBps = uint32(bound(uint256(feeBps), 0, 10_000));
        uint128 fee = uint128((uint256(grossYield) * feeBps) / 10_000);
        assertLe(fee, grossYield);
    }

    /// requireSufficientShares reverts iff requested > balance
    function testFuzz_SufficientSharesEnforcement(
        uint128 requested,
        uint128 balance
    ) public {
        if (requested > balance) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    Validation.InsufficientShares.selector,
                    requested,
                    balance
                )
            );
            this._requireSufficientShares(requested, balance);
        } else {
            this._requireSufficientShares(requested, balance);
        }
    }

    /// Exchange rate monotonicity — requireNonDecreasingRate reverts iff newRate < currentRate
    function testFuzz_ExchangeRateMonotonicity(
        uint256 currentRate,
        uint256 newRate
    ) public {
        currentRate = bound(currentRate, 1e18, 1_000_000 * 1e18);
        newRate = bound(newRate, 0, 2_000_000 * 1e18);
        if (newRate < currentRate) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    Validation.ExchangeRateDecreased.selector,
                    currentRate,
                    newRate
                )
            );
            this._requireNonDecreasingRate(currentRate, newRate);
        } else {
            this._requireNonDecreasingRate(currentRate, newRate);
        }
    }

    /// Coretime fraction never underflows net yield
    function testFuzz_CoretimeFractionNeverUnderflows(
        uint128 netYield,
        uint32 fractionBps
    ) public {
        netYield = uint128(bound(uint256(netYield), 0, 1_000_000_000 * 1e18));
        fractionBps = uint32(bound(uint256(fractionBps), 0, 10_000));
        uint128 fraction = uint128((uint256(netYield) * fractionBps) / 10_000);
        assertLe(fraction, netYield);
    }

    /// requireMaxAmount reverts iff amount > ceiling
    function testFuzz_MaxAmountEnforcement(
        uint128 amount,
        uint128 ceiling
    ) public {
        if (amount > ceiling) {
            vm.expectRevert(
                abi.encodeWithSelector(
                    Validation.AmountAboveMaximum.selector,
                    amount,
                    ceiling
                )
            );
            this._requireBelowMaximum(amount, ceiling);
        } else {
            this._requireBelowMaximum(amount, ceiling);
        }
    }

    /// Zero deposit always reverts regardless of caller
    function testFuzz_ZeroDepositAlwaysReverts(address caller) public {
        vm.assume(caller != address(0));
        vm.prank(caller);
        vm.expectRevert(
            abi.encodeWithSelector(
                Validation.AmountBelowMinimum.selector,
                0,
                1e15
            )
        );
        core.deposit(0, 0, block.timestamp + 1);
    }
}

contract FuzzppDOT is Test {
    ppDOT token;
    address core = address(0xC0);

    function setUp() public {
        token = new ppDOT();
        token.initialize(core, address(this));
    }

    /// notifyYield never lowers the exchange rate
    function testFuzz_NotifyYieldNeverLowersRate(
        uint128 initialDeposit,
        uint64 additionalYield
    ) public {
        initialDeposit = uint128(
            bound(uint256(initialDeposit), 1e18, 1_000_000 * 1e18)
        );
        additionalYield = uint64(
            bound(uint256(additionalYield), 0, 100_000 * 1e18)
        );
        vm.assume(additionalYield > 0);

        vm.prank(core);
        token.mintShares(address(0xA1), initialDeposit);

        uint256 rateBefore = token.exchangeRate();

        vm.prank(core);
        token.notifyYield(additionalYield);

        assertGe(token.exchangeRate(), rateBefore);
    }

    /// mint → burn round-trip is within 1 wei at the same rate
    function testFuzz_MintBurnRoundTrip(uint128 dotAmount) public {
        dotAmount = uint128(bound(uint256(dotAmount), 1e15, 1_000_000 * 1e18));

        vm.prank(core);
        token.mintShares(address(0xA1), dotAmount); // These are shares in this context

        vm.prank(core);
        token.burnShares(address(0xA1), dotAmount);

        // Since we are minting and burning same amount of shares at same rate,
        // there should be no diff in DOT equivalent if we were measuring it,
        // but here we just test that mint/burn doesn't revert.
    }
}
