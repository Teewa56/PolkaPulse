import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { network } from "hardhat";
import { parseUnits, zeroAddress, getAddress } from "viem";

const { viem, networkHelpers } = await network.connect();

describe("PolkaPulseCore", function () {

    async function deployFixture() {
        const [signer1, owner, alice, bob, attacker, pauser, feeRecipient, keeper] = await viem.getWalletClients();
        const admin = signer1;

        // Mock Assets Precompile at 0x0...806
        const ASSETS_PRECOMPILE = "0x0000000000000000000000000000000000000806";
        const mockAssets = await viem.deployContract("MockAssetsPrecompile");
        const testClient = await viem.getTestClient();
        const publicClient = await viem.getPublicClient();
        const code = await publicClient.getCode({ address: mockAssets.address });
        await testClient.setCode({ address: ASSETS_PRECOMPILE, bytecode: code });
        await testClient.mine({ blocks: 100800 });
        const assetsPrecompile = await viem.getContractAt("MockAssetsPrecompile", ASSETS_PRECOMPILE);

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
            core, ppdot, rewardMonitor, yieldExecutor, coretimeArbitrage, assetsPrecompile,
            owner, admin, alice, bob, attacker, pauser, keeper,
            ONE_DOT, HUNDRED_DOT
        };
    }

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
            // OZ v4 string revert
            await viem.assertions.revertWith(
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
                "Initializable: contract is already initialized",
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
            // OZ v4 string revert
            await viem.assertions.revertWith(
                core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account }),
                "Pausable: paused",
            );
        });

        it("reverts if caller has insufficient DOT on Asset Hub", async function () {
            const { core, alice, ONE_DOT, assetsPrecompile } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

            // Ensure alice has 0 balance
            await assetsPrecompile.write.setBalance([alice!.account!.address, 0n]);

            await viem.assertions.revertWithCustomError(
                core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account }),
                core,
                "InsufficientDotBalance",
                [0n, ONE_DOT]
            );
        });

        it("increases totalDotManaged by exact deposit amount", async function () {
            const { core, alice, ONE_DOT, assetsPrecompile, ppdot } = await networkHelpers.loadFixture(deployFixture);
            const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

            await assetsPrecompile.write.setBalance([alice!.account!.address, ONE_DOT]);
            // Also need to set balance for core to fake the transfer if needed, 
            // but PolkaPulseCore pulls from core in our mock? 
            // Wait, core calls transfer. MockAssetsPrecompile subtracts from msg.sender (core).
            // So core NEEDS balance in our mock.
            await assetsPrecompile.write.setBalance([core.address, ONE_DOT]);

            await core.write.deposit([ONE_DOT, 0n, deadline], { account: alice!.account });
            assert.strictEqual(await core.read.totalDotManaged(), ONE_DOT);
        });
    });

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
            // OZ v4 string revert
            await viem.assertions.revertWith(
                core.write.withdraw([ONE_DOT, 0n, deadline], { account: alice!.account }),
                "Pausable: paused",
            );
        });
    });

    describe("executeYieldLoop()", function () {

        it("reverts when paused", async function () {
            const { core, pauser, keeper } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause(["Emergency"], { account: pauser!.account });
            // OZ v4 string revert
            await viem.assertions.revertWith(
                core.write.executeYieldLoopWithData(["0x"], { account: keeper!.account }),
                "Pausable: paused",
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
            const { core, rewardMonitor, yieldExecutor, keeper, assetsPrecompile, ONE_DOT } =
                await networkHelpers.loadFixture(deployFixture);
            await rewardMonitor.write.setHarvestReady([true]);
            await yieldExecutor.write.setReturnFailure([true]);
            // Give core sufficient balance so the fee transfer doesn't revert before optimizer is called
            await assetsPrecompile.write.setBalance([core.address, ONE_DOT]);
            await viem.assertions.revertWith(
                core.write.executeYieldLoopWithData(["0x"], { account: keeper!.account }),
                "YieldLoopFailed",
            );
        });
    });

    describe("Re-entrancy protection", function () {

        it("blocks re-entrant deposit() calls", async function () {
            const { core, assetsPrecompile, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            const attackerContract = await viem.deployContract("MockReentrancyAttack", [core.address]);

            // Attacker needs balance in precompile to pass balance check
            await assetsPrecompile.write.setBalance([attackerContract.address, ONE_DOT * 10n]);
            // Core needs balance to fake the transfer
            await assetsPrecompile.write.setBalance([core.address, ONE_DOT * 10n]);

            // OZ v4 string revert — reentrancy triggers via MockppDOT.mintShares -> onMint() callback
            await viem.assertions.revertWith(
                attackerContract.write.attack(),
                "ReentrancyGuard: reentrant call",
            );
        });
    });

    describe("Access control", function () {

        it("non-pauser cannot pause", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            const PAUSER_ROLE = await core.read.PAUSER_ROLE();
            // OZ v4 string revert: "AccessControl: account ... is missing role ..."
            await viem.assertions.revertWith(
                core.write.pause(["Emergency"], { account: alice!.account }),
                `AccessControl: account ${alice!.account!.address.toLowerCase()} is missing role ${PAUSER_ROLE}`
            );
        });

        it("non-admin cannot unpause", async function () {
            const { core, pauser, alice } = await networkHelpers.loadFixture(deployFixture);
            const ADMIN_ROLE = await core.read.ADMIN_ROLE();
            await core.write.pause(["Emergency"], { account: pauser!.account });
            await viem.assertions.revertWith(
                core.write.unpause({ account: alice!.account }),
                `AccessControl: account ${alice!.account!.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
            );
        });

        it("non-admin cannot setHarvestThreshold", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            const ADMIN_ROLE = await core.read.ADMIN_ROLE();
            await viem.assertions.revertWith(
                core.write.setHarvestThreshold([1000n], { account: alice!.account }),
                `AccessControl: account ${alice!.account!.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
            );
        });

        it("non-admin cannot setProtocolFeeBps", async function () {
            const { core, alice } = await networkHelpers.loadFixture(deployFixture);
            const ADMIN_ROLE = await core.read.ADMIN_ROLE();
            await viem.assertions.revertWith(
                core.write.setProtocolFeeBps([300], { account: alice!.account }),
                `AccessControl: account ${alice!.account!.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
            );
        });

        it("admin can unpause", async function () {
            const { core, pauser, admin } = await networkHelpers.loadFixture(deployFixture);
            await core.write.pause(["Emergency"], { account: pauser!.account });
            assert.strictEqual(await core.read.paused(), true);
            await core.write.unpause({ account: admin!.account });
            assert.strictEqual(await core.read.paused(), false);
        });
    });
});
