import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("PolkaPulseCore", function () {

    async function deployFixture() {
        const [owner, admin, alice, bob, attacker] = await ethers.getSigners();

        const MockppDOT         = await ethers.getContractFactory("MockppDOT");
        const ppdot             = await MockppDOT.deploy();

        const MockRewardMonitor = await ethers.getContractFactory("MockRewardMonitor");
        const rewardMonitor     = await MockRewardMonitor.deploy();

        const MockExecutor      = await ethers.getContractFactory("MockAtomicYieldExecutor");
        const yieldExecutor     = await MockExecutor.deploy();

        const MockCoretime      = await ethers.getContractFactory("MockCoretimeArbitrage");
        const coretimeArbitrage = await MockCoretime.deploy();

        const Core = await ethers.getContractFactory("PolkaPulseCore");
        const core = await Core.deploy();

        await core.initialize(
            admin.address,
            await ppdot.getAddress(),
            await rewardMonitor.getAddress(),
            await yieldExecutor.getAddress(),
            await coretimeArbitrage.getAddress(),
            200
        );

        await ppdot.setCore(await core.getAddress());
        await rewardMonitor.setCore(await core.getAddress());
        await yieldExecutor.setCore(await core.getAddress());
        await coretimeArbitrage.setCore(await core.getAddress());

        const ONE_DOT     = ethers.parseUnits("1", 18);
        const HUNDRED_DOT = ethers.parseUnits("100", 18);

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
            const { core, admin } = await loadFixture(deployFixture);
            expect(await core.admin()).to.equal(admin.address);
        });

        it("sets protocolFeeBps to 200", async function () {
            const { core } = await loadFixture(deployFixture);
            expect(await core.protocolFeeBps()).to.equal(200);
        });

        it("reverts if initialize() is called a second time", async function () {
            const { core, admin, ppdot, rewardMonitor, yieldExecutor, coretimeArbitrage } =
                await loadFixture(deployFixture);
            await expect(
                core.initialize(
                    admin.address,
                    await ppdot.getAddress(),
                    await rewardMonitor.getAddress(),
                    await yieldExecutor.getAddress(),
                    await coretimeArbitrage.getAddress(),
                    200
                )
            ).to.be.revertedWithCustomError(core, "AlreadyInitialized");
        });

        it("reverts if admin is zero address", async function () {
            const Core  = await ethers.getContractFactory("PolkaPulseCore");
            const fresh = await Core.deploy();
            const [,, alice] = await ethers.getSigners();
            await expect(
                fresh.initialize(ethers.ZeroAddress, alice.address, alice.address, alice.address, alice.address, 200)
            ).to.be.revertedWith("Validation: zero address not permitted");
        });

        it("reverts if protocolFeeBps exceeds 10_000", async function () {
            const Core  = await ethers.getContractFactory("PolkaPulseCore");
            const fresh = await Core.deploy();
            const [, admin, alice] = await ethers.getSigners();
            await expect(
                fresh.initialize(admin.address, alice.address, alice.address, alice.address, alice.address, 10_001)
            ).to.be.revertedWith("Validation: BPS exceeds 100%");
        });
    });

    // =========================================================================
    // Deposit
    // =========================================================================

    describe("deposit()", function () {

        it("reverts on zero amount", async function () {
            const { core, alice } = await loadFixture(deployFixture);
            await expect(core.connect(alice).deposit(0))
                .to.be.revertedWith("Validation: amount must be greater than zero");
        });

        it("reverts when paused", async function () {
            const { core, admin, alice, ONE_DOT } = await loadFixture(deployFixture);
            await core.connect(admin).pause();
            await expect(core.connect(alice).deposit(ONE_DOT))
                .to.be.revertedWithCustomError(core, "Paused");
        });

        it("increases totalDOT by exact deposit amount", async function () {
            const { core, alice, ONE_DOT } = await loadFixture(deployFixture);
            await core.connect(alice).deposit(ONE_DOT);
            expect(await core.totalDOT()).to.equal(ONE_DOT);
        });

        it("emits Deposited event", async function () {
            const { core, alice, ONE_DOT } = await loadFixture(deployFixture);
            await expect(core.connect(alice).deposit(ONE_DOT))
                .to.emit(core, "Deposited");
        });

        it("accumulates totalDOT across multiple depositors", async function () {
            const { core, alice, bob, ONE_DOT, HUNDRED_DOT } = await loadFixture(deployFixture);
            await core.connect(alice).deposit(ONE_DOT);
            await core.connect(bob).deposit(HUNDRED_DOT);
            expect(await core.totalDOT()).to.equal(ONE_DOT + HUNDRED_DOT);
        });
    });

    // =========================================================================
    // Withdraw
    // =========================================================================

    describe("withdraw()", function () {

        it("reverts on zero shares", async function () {
            const { core, alice } = await loadFixture(deployFixture);
            await expect(core.connect(alice).withdraw(0))
                .to.be.revertedWith("Validation: amount must be greater than zero");
        });

        it("reverts when paused", async function () {
            const { core, admin, alice } = await loadFixture(deployFixture);
            await core.connect(admin).pause();
            await expect(core.connect(alice).withdraw(1000n))
                .to.be.revertedWithCustomError(core, "Paused");
        });

        it("reverts if user has insufficient shares", async function () {
            const { core, alice, ONE_DOT } = await loadFixture(deployFixture);
            await core.connect(alice).deposit(ONE_DOT);
            await expect(core.connect(alice).withdraw(ONE_DOT * 999n))
                .to.be.revertedWith("Validation: insufficient ppDOT shares");
        });

        it("decreases totalDOT after withdrawal", async function () {
            const { core, alice, ONE_DOT } = await loadFixture(deployFixture);
            await core.connect(alice).deposit(ONE_DOT);
            await core.connect(alice).withdraw(ONE_DOT);
            expect(await core.totalDOT()).to.equal(0);
        });

        it("emits Withdrawn event", async function () {
            const { core, alice, ONE_DOT } = await loadFixture(deployFixture);
            await core.connect(alice).deposit(ONE_DOT);
            await expect(core.connect(alice).withdraw(ONE_DOT))
                .to.emit(core, "Withdrawn");
        });
    });

    // =========================================================================
    // Yield loop
    // =========================================================================

    describe("executeYieldLoop()", function () {

        it("reverts when paused", async function () {
            const { core, admin } = await loadFixture(deployFixture);
            await core.connect(admin).pause();
            await expect(core.executeYieldLoop())
                .to.be.revertedWithCustomError(core, "Paused");
        });

        it("reverts when harvest is not ready", async function () {
            const { core, rewardMonitor } = await loadFixture(deployFixture);
            await rewardMonitor.setHarvestReady(false);
            await expect(core.executeYieldLoop())
                .to.be.revertedWithCustomError(core, "HarvestNotReady");
        });

        it("reverts if optimizer returns failure", async function () {
            const { core, rewardMonitor, yieldExecutor, alice, ONE_DOT } =
                await loadFixture(deployFixture);
            await core.connect(alice).deposit(ONE_DOT);
            await rewardMonitor.setHarvestReady(true);
            await yieldExecutor.setReturnFailure(true);
            await expect(core.executeYieldLoop())
                .to.be.revertedWithCustomError(core, "YieldLoopFailed");
        });

        it("increases totalDOT by net yield after successful loop", async function () {
            const { core, rewardMonitor, yieldExecutor, alice, ONE_DOT } =
                await loadFixture(deployFixture);
            await core.connect(alice).deposit(ONE_DOT);
            await rewardMonitor.setHarvestReady(true);
            await yieldExecutor.setExpectedYield(ethers.parseUnits("0.1", 18));
            const before = await core.totalDOT();
            await core.executeYieldLoop();
            expect(await core.totalDOT()).to.be.gt(before);
        });

        it("emits Rebased event", async function () {
            const { core, rewardMonitor, yieldExecutor, alice, ONE_DOT } =
                await loadFixture(deployFixture);
            await core.connect(alice).deposit(ONE_DOT);
            await rewardMonitor.setHarvestReady(true);
            await yieldExecutor.setExpectedYield(ethers.parseUnits("0.1", 18));
            await expect(core.executeYieldLoop()).to.emit(core, "Rebased");
        });
    });

    // =========================================================================
    // Re-entrancy
    // =========================================================================

    describe("Re-entrancy protection", function () {

        it("blocks re-entrant deposit() calls", async function () {
            const { core } = await loadFixture(deployFixture);
            const Attack   = await ethers.getContractFactory("MockReentrancyAttack");
            const attacker = await Attack.deploy(await core.getAddress());
            await expect(attacker.attack())
                .to.be.revertedWithCustomError(core, "ReentrantCall");
        });
    });

    // =========================================================================
    // Access control
    // =========================================================================

    describe("Access control", function () {

        it("non-admin cannot pause", async function () {
            const { core, alice } = await loadFixture(deployFixture);
            await expect(core.connect(alice).pause())
                .to.be.revertedWithCustomError(core, "NotAdmin");
        });

        it("non-admin cannot unpause", async function () {
            const { core, admin, alice } = await loadFixture(deployFixture);
            await core.connect(admin).pause();
            await expect(core.connect(alice).unpause())
                .to.be.revertedWithCustomError(core, "NotAdmin");
        });

        it("non-admin cannot setRewardThreshold", async function () {
            const { core, alice } = await loadFixture(deployFixture);
            await expect(core.connect(alice).setRewardThreshold(1000n))
                .to.be.revertedWithCustomError(core, "NotAdmin");
        });

        it("non-admin cannot setProtocolFee", async function () {
            const { core, alice } = await loadFixture(deployFixture);
            await expect(core.connect(alice).setProtocolFee(300))
                .to.be.revertedWithCustomError(core, "NotAdmin");
        });

        it("admin can pause and unpause", async function () {
            const { core, admin } = await loadFixture(deployFixture);
            await core.connect(admin).pause();
            expect(await core.paused()).to.equal(true);
            await core.connect(admin).unpause();
            expect(await core.paused()).to.equal(false);
        });

        it("admin cannot set fee above 100%", async function () {
            const { core, admin } = await loadFixture(deployFixture);
            await expect(core.connect(admin).setProtocolFee(10_001))
                .to.be.revertedWith("Validation: BPS exceeds 100%");
        });

        it("emits ProtocolPaused with caller address", async function () {
            const { core, admin } = await loadFixture(deployFixture);
            await expect(core.connect(admin).pause())
                .to.emit(core, "ProtocolPaused")
                .withArgs(admin.address);
        });

        it("emits ProtocolUnpaused with caller address", async function () {
            const { core, admin } = await loadFixture(deployFixture);
            await core.connect(admin).pause();
            await expect(core.connect(admin).unpause())
                .to.emit(core, "ProtocolUnpaused")
                .withArgs(admin.address);
        });
    });

    // =========================================================================
    // Exchange rate
    // =========================================================================

    describe("Exchange rate", function () {

        it("sharesToDOT at 1:1 rate equals input", async function () {
            const { core, ONE_DOT } = await loadFixture(deployFixture);
            expect(await core.sharesToDOT(ONE_DOT)).to.equal(ONE_DOT);
        });

        it("dotToShares at 1:1 rate equals input", async function () {
            const { core, ONE_DOT } = await loadFixture(deployFixture);
            expect(await core.dotToShares(ONE_DOT)).to.equal(ONE_DOT);
        });

        it("exchange rate does not decrease after yield", async function () {
            const { core, rewardMonitor, yieldExecutor, alice, ONE_DOT } =
                await loadFixture(deployFixture);
            await core.connect(alice).deposit(ONE_DOT);
            await rewardMonitor.setHarvestReady(true);
            await yieldExecutor.setExpectedYield(ethers.parseUnits("0.05", 18));
            const before = await core.exchangeRate();
            await core.executeYieldLoop();
            expect(await core.exchangeRate()).to.be.gte(before);
        });
    });
});