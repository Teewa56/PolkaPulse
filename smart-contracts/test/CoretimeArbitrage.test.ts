import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { network } from "hardhat";
import { parseUnits, zeroAddress, getAddress } from "viem";

const { viem, networkHelpers } = await network.connect();

describe("CoretimeArbitrage", function () {

    async function deployFixture() {
        const [signer1, owner, core, alice, bob, keeper] = await viem.getWalletClients();
        const admin = signer1;
        const testClient = await viem.getTestClient();

        const coretime = await viem.deployContract("CoretimeArbitrage");
        // Upgradeable initialization
        await coretime.write.initialize([
            admin!.account!.address,
            owner!.account!.address,
            keeper!.account!.address, // keeper (6th signer)
            owner!.account!.address, // pauser (placeholder)
            500, // 5% treasuryBps
        ]);

        const KEEPER_ROLE = await coretime.read.KEEPER_ROLE();
        await coretime.write.grantRole([KEEPER_ROLE, core!.account!.address], { account: admin!.account });
        await coretime.write.grantRole([KEEPER_ROLE, admin!.account!.address], { account: admin!.account });

        const ONE_DOT = parseUnits("1", 18);
        const TEN_DOT = parseUnits("10", 18);
        const HUNDRED_DOT = parseUnits("100", 18);
        const HYDRADX_PARA = 2034;
        const INTERLAY_PARA = 2032;

        return { coretime, owner, admin, core, alice, bob, keeper, ONE_DOT, TEN_DOT, HUNDRED_DOT, HYDRADX_PARA, INTERLAY_PARA, testClient };
    }

    describe("Deployment", function () {

        it("sets core correctly", async function () {
            const { coretime, core } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await coretime.read.hasRole([await coretime.read.KEEPER_ROLE(), core!.account!.address]), true);
        });

        it("sets admin correctly", async function () {
            const { coretime, admin } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await coretime.read.hasRole([await coretime.read.ADMIN_ROLE(), admin!.account!.address]), true);
        });

        it("reverts with zero admin", async function () {
            const fresh = await viem.deployContract("CoretimeArbitrage");
            const [, admin, core] = await viem.getWalletClients();
            await viem.assertions.revertWithCustomError(
                fresh.write.initialize([zeroAddress, admin!.account!.address, core!.account!.address, admin!.account!.address, 500]),
                fresh,
                "ZeroAddress",
            );
        });

        it("reverts if treasury BPS > 2_000", async function () {
            const fresh = await viem.deployContract("CoretimeArbitrage");
            const [, admin, core] = await viem.getWalletClients();
            await viem.assertions.revertWithCustomError(
                fresh.write.initialize([admin!.account!.address, admin!.account!.address, core!.account!.address, admin!.account!.address, 2001]),
                fresh,
                "TreasuryBpsExceedsMax",
            );
        });
    });

    describe("accumulateReserve()", function () {

        it("increases treasury Reserve by treasuryBps fraction", async function () {
            const { coretime, core, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            const treasuryBps = await coretime.read.treasuryBps();
            const expectedReserved = (ONE_DOT * BigInt(treasuryBps)) / 10000n;

            await coretime.write.accumulateReserve([ONE_DOT], { account: core!.account });
            assert.strictEqual(await coretime.read.treasuryReserve(), expectedReserved);
        });

        it("reverts when called by non-keeper", async function () {
            const { coretime, alice } = await networkHelpers.loadFixture(deployFixture);
            const KEEPER_ROLE = await coretime.read.KEEPER_ROLE();
            await viem.assertions.revertWith(
                coretime.write.accumulateReserve([100n], { account: alice!.account }),
                `AccessControl: account ${alice!.account!.address.toLowerCase()} is missing role ${KEEPER_ROLE}`
            );
        });

        it("reverts on zero amount", async function () {
            const { coretime, core } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                coretime.write.accumulateReserve([0n], { account: core!.account }),
                coretime,
                "ZeroAmount",
            );
        });

        it("accumulates correctly across multiple deposits", async function () {
            const { coretime, core, ONE_DOT, TEN_DOT } = await networkHelpers.loadFixture(deployFixture);
            const treasuryBps = await coretime.read.treasuryBps();
            const expectedTotal = ((ONE_DOT + TEN_DOT) * BigInt(treasuryBps)) / 10000n;

            await coretime.write.accumulateReserve([ONE_DOT], { account: core!.account });
            await coretime.write.accumulateReserve([TEN_DOT], { account: core!.account });
            assert.strictEqual(await coretime.read.treasuryReserve(), expectedTotal);
        });
    });

    describe("addPartner()", function () {

        it("whitelists partner as admin", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            const partner = await coretime.read.partners([HYDRADX_PARA]);
            assert.strictEqual(partner[2], true); // active
            assert.strictEqual(partner[1], 1200n); // boostedYieldBps
        });

        it("reverts for non-admin", async function () {
            const { coretime, alice, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            const ADMIN_ROLE = await coretime.read.ADMIN_ROLE();
            await viem.assertions.revertWith(
                coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: alice!.account }),
                `AccessControl: account ${alice!.account!.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
            );
        });

        it("reverts on parachain ID 0", async function () {
            const { coretime, admin } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                coretime.write.addPartner([0, 1_200], { account: admin!.account }),
                coretime,
                "InvalidParachainId",
            );
        });

        it("reverts on boostedYieldBps > 10_000", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                coretime.write.addPartner([HYDRADX_PARA, 10_001], { account: admin!.account }),
                coretime,
                "BpsExceedsMax",
            );
        });

        it("reverts on duplicate partner", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.addPartner([HYDRADX_PARA, 1_000], { account: admin!.account }),
                coretime,
                "ParachainAlreadyRegistered",
            );
        });
    });

    describe("removePartner()", function () {

        it("deactivates whitelisted partner", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await coretime.write.removePartner([HYDRADX_PARA], { account: admin!.account });
            const partner = await coretime.read.partners([HYDRADX_PARA]);
            assert.strictEqual(partner[2], false); // active = false
        });

        it("reverts for non-admin", async function () {
            const { coretime, admin, alice, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            const ADMIN_ROLE = await coretime.read.ADMIN_ROLE();
            await viem.assertions.revertWith(
                coretime.write.removePartner([HYDRADX_PARA], { account: alice!.account }),
                `AccessControl: account ${alice!.account!.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
            );
        });

        it("reverts on non-partner", async function () {
            const { coretime, admin } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                coretime.write.removePartner([9999], { account: admin!.account }),
                coretime,
                "ParachainNotWhitelisted",
            );
        });
    });

    describe("epochTrigger()", function () {

        async function readyFixture() {
            const base = await networkHelpers.loadFixture(deployFixture);
            await base.coretime.write.addPartner([base.HYDRADX_PARA, 1_200], { account: base.admin!.account });
            await base.coretime.write.accumulateReserve([base.HUNDRED_DOT], { account: base.core!.account });
            // Mine 100,800 blocks so epochTrigger doesn't revert with EpochNotReady
            await base.testClient.mine({ blocks: 100800 });
            return base;
        }

        it("succeeds when conditions are met by keeper", async function () {
            const { coretime, keeper } = await readyFixture();
            await coretime.write.epochTrigger([0n], { account: keeper!.account });
        });

        it("zeroes treasury after epoch", async function () {
            const { coretime, keeper } = await readyFixture();
            await coretime.write.epochTrigger([0n], { account: keeper!.account });
            assert.strictEqual(await coretime.read.treasuryReserve(), 0n);
        });

        it("increments currentEpoch", async function () {
            const { coretime, keeper } = await readyFixture();
            await coretime.write.epochTrigger([0n], { account: keeper!.account });
            assert.strictEqual(await coretime.read.epochCount(), 1n);
        });

        it("reverts before cooldown elapses", async function () {
            const { coretime, core, keeper, TEN_DOT } = await readyFixture();
            await coretime.write.epochTrigger([0n], { account: keeper!.account });
            await coretime.write.accumulateReserve([TEN_DOT], { account: core!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.epochTrigger([0n], { account: keeper!.account }),
                coretime,
                "EpochNotReady",
            );
        });

        it("succeeds after 100_800 blocks", async function () {
            const { coretime, core, keeper, TEN_DOT, testClient } = await readyFixture();
            await coretime.write.epochTrigger([0n], { account: keeper!.account });

            await testClient.mine({ blocks: 100800 });

            await coretime.write.accumulateReserve([TEN_DOT], { account: core!.account });
            await coretime.write.epochTrigger([0n], { account: keeper!.account });
        });

        it("reverts if reserve is zero", async function () {
            const { coretime, admin, keeper, HYDRADX_PARA, testClient } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await testClient.mine({ blocks: 100800 });
            await viem.assertions.revertWithCustomError(
                coretime.write.epochTrigger([0n], { account: keeper!.account }),
                coretime,
                "ReserveTooLow",
                [0n, 1n]
            );
        });
    });

    describe("blocksUntilNextEpoch()", function () {

        it("returns ~100798 when initial (due to mined blocks)", async function () {
            const { coretime } = await networkHelpers.loadFixture(deployFixture);
            const remaining = await coretime.read.blocksUntilNextEpoch();
            assert.ok(remaining > 100790n && remaining <= 100800n);
        });

        it("returns positive value after trigger", async function () {
            const { coretime, keeper, testClient } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([2034, 1200], { account: (await viem.getWalletClients())[0]!.account });
            await coretime.write.accumulateReserve([parseUnits("10", 18)], { account: (await viem.getWalletClients())[2]!.account });

            // Mine 100,800 blocks so epochTrigger doesn't revert with EpochNotReady
            await testClient.mine({ blocks: 100800 });

            await coretime.write.epochTrigger([0n], { account: keeper!.account });
            const remaining = await coretime.read.blocksUntilNextEpoch();
            assert.ok(remaining > 0n && remaining <= 100800n);
        });
    });
});
