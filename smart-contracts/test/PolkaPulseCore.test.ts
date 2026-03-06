import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { network } from "hardhat";
import { parseUnits, zeroAddress } from "viem";

const { viem, networkHelpers } = await network.connect();

describe("PolkaPulseCore", function () {

    async function deployFixture() {
        const [owner, admin, alice, bob, attacker] = await viem.getWalletClients();

        const ppdot             = await viem.deployContract("MockppDOT");
        const rewardMonitor     = await viem.deployContract("MockRewardMonitor");
        const yieldExecutor     = await viem.deployContract("MockAtomicYieldExecutor");
        const coretimeArbitrage = await viem.deployContract("MockCoretimeArbitrage");
        const core = await viem.deployContract("PolkaPulseCore");

        await core.write.initialize([
            admin!.account!.address,
            ppdot.address,
            rewardMonitor.address,
            yieldExecutor.address,
            coretimeArbitrage.address,
            200,
        ]);

        await ppdot.write.setCore([core.address]);
        await rewardMonitor.write.setCore([core.address]);
        await yieldExecutor.write.setCore([core.address]);
        await coretimeArbitrage.write.setCore([core.address]);

        const ONE_DOT     = parseUnits("1", 18);
        const HUNDRED_DOT = parseUnits("100", 18);

        return {
            core, ppdot, rewardMonitor, yieldExecutor, coretimeArbitrage,
            owner, admin, alice, bob, attacker,
            ONE_DOT, HUNDRED_DOT
        };
    }

    // =========================================================================
    // Initialization
    // =========================================================================

    describe("Initialization", function () {

        it("sets admin correctly", async function () {
            const { core, admin } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await core.read.admin(), admin!.account!.address);
        });

        it("sets protocolFeeBps to 200", async function () {
            const { core } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await core.read.protocolFeeBps(), 200);
        });

        it("reverts if initialize() is called a second time", async function () {
            const { core, admin, ppdot, rewardMonitor, yieldExecutor, coretimeArbitrage } =
                await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                core.write.initialize([
                    admin!.account!.address,
                    ppdot.address,
                    rewardMonitor.address,
                    yieldExecutor.address,
                    coretimeArbitrage.address,
                    200,
                ]),
                core,
                "AlreadyInitialized",
            );
        });

        it("reverts if admin is zero address", async function () {
            const fresh = await viem.deployContract("PolkaPulseCore");
            const [, , alice] = await viem.getWalletClients();
            await viem.assertions.revertWith(
                fresh.write.initialize([
                    zeroAddress,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    200,
                ]),
                "Validation: zero address not permitted",
            );
        });

        it("reverts if protocolFeeBps exceeds 10_000", async function () {
            const fresh = await viem.deployContract("PolkaPulseCore");
            const [, admin, alice] = await viem.getWalletClients();
            await viem.assertions.revertWith(
                fresh.write.initialize([
                    admin!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    alice!.account!.address,
                    10_001,
                ]),
                "Validation: BPS exceeds 100%",
            );
        });
    });

    // =========================================================================
    // Deposit
    // =========================================================================

    describe("deposit()", function () {

        it("reverts on zero amount", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWith(
                core.write.deposit([0n], { account: alice!.account }),
                "Validation: amount must be greater than zero",
            );
        });

        it("reverts when paused", async function () {
            const { core, admin, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause({ account: admin!.account });
            await viem.assertions.revertWithCustomError(
                core.write.deposit([ONE_DOT], { account: alice!.account }),
                core,
                "Paused",
            );
        });

        it("increases totalDOT by exact deposit amount", async function () {
            const { core, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            await core.write.deposit([ONE_DOT], { account: alice!.account });
            assert.strictEqual(await core.read.totalDOT(), ONE_DOT);
        });

        it("emits Deposited event", async function () {
            const { core, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.emit(
                core.write.deposit([ONE_DOT], { account: alice!.account }),
                core,
                "Deposited",
            );
        });

        it("accumulates totalDOT across multiple depositors", async function () {
            const { core, alice, bob, ONE_DOT, HUNDRED_DOT } = await networkHelpers.loadFixture(deployFixture);
            await core.write.deposit([ONE_DOT], { account: alice!.account });
            await core.write.deposit([HUNDRED_DOT], { account: bob!.account });
            assert.strictEqual(await core.read.totalDOT(), ONE_DOT + HUNDRED_DOT);
        });
    });

    // =========================================================================
    // Withdraw
    // =========================================================================

    describe("withdraw()", function () {

        it("reverts on zero shares", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWith(
                core.write.withdraw([0n], { account: alice!.account }),
                "Validation: amount must be greater than zero",
            );
        });

        it("reverts when paused", async function () {
            const { core, admin, alice } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause({ account: admin!.account });
            await viem.assertions.revertWithCustomError(
                core.write.withdraw([1000n], { account: alice!.account }),
                core,
                "Paused",
            );
        });

        it("reverts if user has insufficient shares", async function () {
            const { core, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            await core.write.deposit([ONE_DOT], { account: alice!.account });
            await viem.assertions.revertWith(
                core.write.withdraw([ONE_DOT * 999n], { account: alice!.account }),
                "Validation: insufficient ppDOT shares",
            );
        });

        it("decreases totalDOT after withdrawal", async function () {
            const { core, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            await core.write.deposit([ONE_DOT], { account: alice!.account });
            await core.write.withdraw([ONE_DOT], { account: alice!.account });
            assert.strictEqual(await core.read.totalDOT(), 0n);
        });

        it("emits Withdrawn event", async function () {
            const { core, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            await core.write.deposit([ONE_DOT], { account: alice!.account });
            await viem.assertions.emit(
                core.write.withdraw([ONE_DOT], { account: alice!.account }),
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
            const { core, admin } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause({ account: admin!.account });
            await viem.assertions.revertWithCustomError(
                core.write.executeYieldLoop(),
                core,
                "Paused",
            );
        });

        it("reverts when harvest is not ready", async function () {
            const { core, rewardMonitor } = await networkHelpers.loadFixture(deployFixture);
            await rewardMonitor.write.setHarvestReady([false]);
            await viem.assertions.revertWithCustomError(
                core.write.executeYieldLoop(),
                core,
                "HarvestNotReady",
            );
        });

        it("reverts if optimizer returns failure", async function () {
            const { core, rewardMonitor, yieldExecutor, alice, ONE_DOT } =
                await networkHelpers.loadFixture(deployFixture);
            await core.write.deposit([ONE_DOT], { account: alice!.account });
            await rewardMonitor.write.setHarvestReady([true]);
            await yieldExecutor.write.setReturnFailure([true]);
            await viem.assertions.revertWithCustomError(
                core.write.executeYieldLoop(),
                core,
                "YieldLoopFailed",
            );
        });

        it("increases totalDOT by net yield after successful loop", async function () {
            const { core, rewardMonitor, yieldExecutor, alice, ONE_DOT } =
                await networkHelpers.loadFixture(deployFixture);
            await core.write.deposit([ONE_DOT], { account: alice!.account });
            await rewardMonitor.write.setHarvestReady([true]);
            await yieldExecutor.write.setExpectedYield([parseUnits("0.1", 18)]);
            const before = await core.read.totalDOT();
            await core.write.executeYieldLoop();
            assert.ok((await core.read.totalDOT()) > before);
        });

        it("emits Rebased event", async function () {
            const { core, rewardMonitor, yieldExecutor, alice, ONE_DOT } =
                await networkHelpers.loadFixture(deployFixture);
            await core.write.deposit([ONE_DOT], { account: alice!.account });
            await rewardMonitor.write.setHarvestReady([true]);
            await yieldExecutor.write.setExpectedYield([parseUnits("0.1", 18)]);
            await viem.assertions.emit(
                core.write.executeYieldLoop(),
                core,
                "Rebased",
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
                "ReentrantCall",
            );
        });
    });

    // =========================================================================
    // Access control
    // =========================================================================

    describe("Access control", function () {

        it("non-admin cannot pause", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                core.write.pause({ account: alice!.account }),
                core,
                "NotAdmin",
            );
        });

        it("non-admin cannot unpause", async function () {
            const { core, admin, alice } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause({ account: admin!.account });
            await viem.assertions.revertWithCustomError(
                core.write.unpause({ account: alice!.account }),
                core,
                "NotAdmin",
            );
        });

        it("non-admin cannot setRewardThreshold", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                core.write.setRewardThreshold([1000n], { account: alice!.account }),
                core,
                "NotAdmin",
            );
        });

        it("non-admin cannot setProtocolFee", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                core.write.setProtocolFee([300], { account: alice!.account }),
                core,
                "NotAdmin",
            );
        });

        it("admin can pause and unpause", async function () {
            const { core, admin } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause({ account: admin!.account });
            assert.strictEqual(await core.read.paused(), true);
            await core.write.unpause({ account: admin!.account });
            assert.strictEqual(await core.read.paused(), false);
        });

        it("admin cannot set fee above 100%", async function () {
            const { core, admin } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWith(
                core.write.setProtocolFee([10_001], { account: admin!.account }),
                "Validation: BPS exceeds 100%",
            );
        });

        it("emits ProtocolPaused with caller address", async function () {
            const { core, admin } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.emitWithArgs(
                core.write.pause({ account: admin!.account }),
                core,
                "ProtocolPaused",
                [admin!.account!.address],
            );
        });

        it("emits ProtocolUnpaused with caller address", async function () {
            const { core, admin } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause({ account: admin!.account });
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

        it("sharesToDOT at 1:1 rate equals input", async function () {
            const { core, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await core.read.sharesToDOT([ONE_DOT]), ONE_DOT);
        });

        it("dotToShares at 1:1 rate equals input", async function () {
            const { core, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await core.read.dotToShares([ONE_DOT]), ONE_DOT);
        });

        it("exchange rate does not decrease after yield", async function () {
            const { core, rewardMonitor, yieldExecutor, alice, ONE_DOT } =
                await networkHelpers.loadFixture(deployFixture);
            await core.write.deposit([ONE_DOT], { account: alice!.account });
            await rewardMonitor.write.setHarvestReady([true]);
            await yieldExecutor.write.setExpectedYield([parseUnits("0.05", 18)]);
            const before = await core.read.exchangeRate();
            await core.write.executeYieldLoop();
            assert.ok((await core.read.exchangeRate()) >= before);
        });
    });
});
