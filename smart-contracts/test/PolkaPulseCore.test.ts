import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { network } from "hardhat";
import { parseUnits, zeroAddress } from "viem";

const { viem, networkHelpers } = await network.connect();

describe("PolkaPulseCore", function () {

    async function deployFixture() {
        const [signer1, owner, alice, bob, attacker, pauser, feeRecipient, keeper] = await viem.getWalletClients();
        const admin = signer1;

        const ppdot = await viem.deployContract("MockppDOT");
        const rewardMonitor = await viem.deployContract("MockRewardMonitor");
        const yieldExecutor = await viem.deployContract("MockAtomicYieldExecutor");
        const coretimeArbitrage = await viem.deployContract("MockCoretimeArbitrage");
        const core = await viem.deployContract("PolkaPulseCore");

        await core.write.initialize([
            admin!.account!.address,
            owner!.account!.address,
            keeper!.account!.address,
            pauser!.account!.address,
            ppdot.address,
            rewardMonitor.address,
            yieldExecutor.address,
            coretimeArbitrage.address,
            parseUnits("100", 18),
            200,
            feeRecipient!.account!.address,
        ]);

        await ppdot.write.setCore([core.address]);
        await rewardMonitor.write.setCore([core.address]);
        await yieldExecutor.write.setCore([core.address]);
        await coretimeArbitrage.write.setCore([core.address]);

        const ONE_DOT = parseUnits("1", 18);
        const HUNDRED_DOT = parseUnits("100", 18);

        return {
            core, ppdot, rewardMonitor, yieldExecutor, coretimeArbitrage,
            owner, admin, alice, bob, attacker, pauser, keeper,
            ONE_DOT, HUNDRED_DOT
        };
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    describe("Initialization", function () {

        it("sets admin correctly", async function () {
            const { core, admin } = await networkHelpers.loadFixture(deployFixture);
            const ADMIN_ROLE = await core.read.ADMIN_ROLE();
            assert.strictEqual(await core.read.hasRole([ADMIN_ROLE, admin!.account!.address]), true);
        });

        it("sets protocolFeeBps to 200", async function () {
            const { core } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await core.read.protocolFeeBps(), 200);
        });

        it("reverts if initialize() is called a second time", async function () {
            const { core, admin, ppdot, rewardMonitor, yieldExecutor, coretimeArbitrage, owner } =
                await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                core.write.initialize([
                    admin!.account!.address,
                    owner!.account!.address,
                    owner!.account!.address,
                    admin!.account!.address,
                    ppdot.address,
                    rewardMonitor.address,
                    yieldExecutor.address,
                    coretimeArbitrage.address,
                    parseUnits("100", 18),
                    200,
                    admin!.account!.address,
                ]),
                core,
                "AlreadyInitialized",
            );
        });

        it("reverts if admin is zero address", async function () {
            const fresh = await viem.deployContract("PolkaPulseCore");
            const [, , alice] = await viem.getWalletClients();
            await viem.assertions.revertWithCustomError(
                fresh.write.initialize([
                    zeroAddress,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    100n,
                    200,
                    alice!.account!.address,
                ]),
                fresh,
                "ZeroAddress",
            );
        });

        it("reverts if protocolFeeBps exceeds 10_000", async function () {
            const fresh = await viem.deployContract("PolkaPulseCore");
            const [, admin, alice] = await viem.getWalletClients();
            await viem.assertions.revertWithCustomError(
                fresh.write.initialize([
                    admin!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    100n,
                    10_001,
                    alice!.account!.address,
                ]),
                fresh,
                "BpsExceedsMax",
            );
        });
    });

    // =========================================================================
    // Deposit
    // =========================================================================

    describe("deposit()", function () {

        it("reverts on zero amount", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await viem.assertions.revertWithCustomError(
                core.write.deposit([0n, 0n, deadline], { account: alice!.account }),
                core,
                "AmountBelowMinimum",
            );
        });

        it("reverts when paused", async function () {
            const { core, pauser, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.pause(["Emergency"], { account: pauser!.account });
            await viem.assertions.revertWithCustomError(
                core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account }),
                core,
                "EnforcedPause",
            );
        });

        it("increases totalDotManaged by exact deposit amount", async function () {
            const { core, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account });
            assert.strictEqual(await core.read.totalDotManaged(), ONE_DOT);
        });

        it("emits Deposited event", async function () {
            const { core, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await viem.assertions.emit(
                core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account }),
                core,
                "Deposited",
            );
        });

        it("accumulates totalDotManaged across multiple depositors", async function () {
            const { core, alice, bob, ONE_DOT, HUNDRED_DOT } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account });
            await core.write.deposit([HUNDRED_DOT, 0n, deadline], { account: bob!.account });
            assert.strictEqual(await core.read.totalDotManaged(), ONE_DOT + HUNDRED_DOT);
        });
    });

    // =========================================================================
    // Withdraw
    // =========================================================================

    describe("withdraw()", function () {

        it("reverts on zero shares", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await viem.assertions.revertWithCustomError(
                core.write.withdraw([0n, 0n, deadline], { account: alice!.account }),
                core,
                "ZeroAmount",
            );
        });

        it("reverts when paused", async function () {
            const { core, pauser, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.pause(["Emergency"], { account: pauser!.account });
            await viem.assertions.revertWithCustomError(
                core.write.withdraw([ONE_DOT, 0n, deadline], { account: alice!.account }),
                core,
                "EnforcedPause",
            );
        });

        it("reverts if user has insufficient shares", async function () {
            const { core, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account });
            await viem.assertions.revertWithCustomError(
                core.write.withdraw([ONE_DOT * 999n, 0n, deadline], { account: alice!.account }),
                core,
                "InsufficientShares",
            );
        });

        it("decreases totalDotManaged after withdrawal", async function () {
            const { core, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account });
            await core.write.withdraw([ONE_DOT, 0n, deadline], { account: alice!.account });
            assert.strictEqual(await core.read.totalDotManaged(), 0n);
        });

        it("emits Withdrawn event", async function () {
            const { core, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account });
            await viem.assertions.emit(
                core.write.withdraw([ONE_DOT, 0n, deadline], { account: alice!.account }),
                core,
                "Withdrawn",
            );
        });
    });

    // =========================================================================
    // Yield loop
    // =========================================================================

    describe("executeYieldLoop()", function () {

        it("reverts when paused", async function () {
            const { core, pauser, keeper } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause(["Emergency"], { account: pauser!.account });
            await viem.assertions.revertWithCustomError(
                core.write.executeYieldLoopWithData(["0x"], { account: keeper!.account }),
                core,
                "EnforcedPause",
            );
        });

        it("reverts when harvest is not ready", async function () {
            const { core, rewardMonitor, keeper } = await networkHelpers.loadFixture(deployFixture);
            await rewardMonitor.write.setHarvestReady([false]);
            await viem.assertions.revertWithCustomError(
                core.write.executeYieldLoopWithData(["0x"], { account: keeper!.account }),
                core,
                "HarvestThresholdNotMet",
            );
        });

        it("reverts if optimizer returns failure", async function () {
            const { core, rewardMonitor, yieldExecutor, keeper, alice, ONE_DOT } =
                await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account });
            await rewardMonitor.write.setHarvestReady([true]);
            await yieldExecutor.write.setReturnFailure([true]);
            // Reverts with "YieldLoopFailed" from yieldExecutor.executeYieldLoop
            await viem.assertions.revertWith(
                core.write.executeYieldLoopWithData(["0x"], { account: keeper!.account }),
                "YieldLoopFailed",
            );
        });

        it("increases totalDotManaged by net yield after successful loop", async function () {
            const { core, rewardMonitor, yieldExecutor, keeper, alice, ONE_DOT } =
                await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account });
            await rewardMonitor.write.setHarvestReady([true]);
            await yieldExecutor.write.setExpectedYield([parseUnits("0.1", 18)]);
            const before = await core.read.totalDotManaged();
            await core.write.executeYieldLoopWithData(["0x"], { account: keeper!.account });
            assert.ok((await core.read.totalDotManaged()) > before);
        });

        it("emits YieldLoopExecuted event", async function () {
            const { core, rewardMonitor, yieldExecutor, keeper, alice, ONE_DOT } =
                await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account });
            await rewardMonitor.write.setHarvestReady([true]);
            await yieldExecutor.write.setExpectedYield([parseUnits("0.1", 18)]);
            await viem.assertions.emit(
                core.write.executeYieldLoopWithData(["0x"], { account: keeper!.account }),
                core,
                "YieldLoopExecuted",
            );
        });
    });

    // =========================================================================
    // Re-entrancy
    // =========================================================================

    describe("Re-entrancy protection", function () {

        it("blocks re-entrant deposit() calls", async function () {
            const { core } = await networkHelpers.loadFixture(deployFixture);
            const attacker = await viem.deployContract("MockReentrancyAttack", [core.address]);
            await viem.assertions.revertWithCustomError(
                attacker.write.attack(),
                core,
                "ReentrancyGuardReentrantCall",
            );
        });
    });

    // =========================================================================
    // Access control
    // =========================================================================

    describe("Access control", function () {

        it("non-pauser cannot pause", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                core.write.pause(["Emergency"], { account: alice!.account }),
                core,
                "AccessControlUnauthorizedAccount",
            );
        });

        it("non-admin cannot unpause", async function () {
            const { core, pauser, alice } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause(["Emergency"], { account: pauser!.account });
            await viem.assertions.revertWithCustomError(
                core.write.unpause({ account: alice!.account }),
                core,
                "AccessControlUnauthorizedAccount",
            );
        });

        it("non-admin cannot setHarvestThreshold", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                core.write.setHarvestThreshold([1000n], { account: alice!.account }),
                core,
                "AccessControlUnauthorizedAccount",
            );
        });

        it("non-admin cannot setProtocolFeeBps", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                core.write.setProtocolFeeBps([300], { account: alice!.account }),
                core,
                "AccessControlUnauthorizedAccount",
            );
        });

        it("admin can unpause", async function () {
            const { core, pauser, admin } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause(["Emergency"], { account: pauser!.account });
            assert.strictEqual(await core.read.paused(), true);
            await core.write.unpause({ account: admin!.account });
            assert.strictEqual(await core.read.paused(), false);
        });

        it("admin cannot set fee above 20%", async function () {
            const { core, admin } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                core.write.setProtocolFeeBps([2001], { account: admin!.account }),
                core,
                "BpsExceedsMax",
            );
        });

        it("emits ProtocolPaused with caller address", async function () {
            const { core, pauser } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.emitWithArgs(
                core.write.pause(["Emergency"], { account: pauser!.account }),
                core,
                "ProtocolPaused",
                [pauser!.account!.address, "Emergency"],
            );
        });

        it("emits ProtocolUnpaused with caller address", async function () {
            const { core, pauser, admin } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause(["Emergency"], { account: pauser!.account });
            await viem.assertions.emitWithArgs(
                core.write.unpause({ account: admin!.account }),
                core,
                "ProtocolUnpaused",
                [admin!.account!.address],
            );
        });
    });

    // =========================================================================
    // Exchange rate
    // =========================================================================

    describe("Exchange rate", function () {

        it("sharesToDot at 1:1 rate equals input", async function () {
            const { ppdot, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await ppdot.read.sharesToDot([ONE_DOT]), ONE_DOT);
        });

        it("dotToShares at 1:1 rate equals input", async function () {
            const { ppdot, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await ppdot.read.dotToShares([ONE_DOT]), ONE_DOT);
        });

        it("exchange rate does not decrease after yield", async function () {
            const { core, rewardMonitor, yieldExecutor, keeper, alice, ONE_DOT } =
                await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
            await core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account });
            await rewardMonitor.write.setHarvestReady([true]);
            await yieldExecutor.write.setExpectedYield([parseUnits("0.05", 18)]);
            const before = await core.read.exchangeRate();
            await core.write.executeYieldLoopWithData(["0x"], { account: keeper!.account });
            assert.ok((await core.read.exchangeRate()) >= before);
        });
    });
});
