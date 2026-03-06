import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { network } from "hardhat";
import { parseUnits, zeroAddress } from "viem";
import { anyValue } from "@nomicfoundation/hardhat-toolbox-viem/predicates";

const { viem, networkHelpers } = await network.connect();

describe("CoretimeArbitrage", function () {

    async function deployFixture() {
        const [owner, admin, core, alice, bob] = await viem.getWalletClients();

        const coretime = await viem.deployContract("CoretimeArbitrage", [
            core!.account!.address,
            admin!.account!.address,
            parseUnits("10", 18),
            500,
        ]);

        const ONE_DOT     = parseUnits("1", 18);
        const TEN_DOT     = parseUnits("10", 18);
        const HUNDRED_DOT = parseUnits("100", 18);
        const HYDRADX_PARA  = 2034;
        const INTERLAY_PARA = 2032;

        return { coretime, owner, admin, core, alice, bob, ONE_DOT, TEN_DOT, HUNDRED_DOT, HYDRADX_PARA, INTERLAY_PARA };
    }

    describe("Deployment", function () {

        it("sets core correctly", async function () {
            const { coretime, core } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await coretime.read.core(), core!.account!.address);
        });

        it("sets admin correctly", async function () {
            const { coretime, admin } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await coretime.read.admin(), admin!.account!.address);
        });

        it("reverts with zero core", async function () {
            const [, admin] = await viem.getWalletClients();
            await viem.assertions.revertWith(
                viem.deployContract("CoretimeArbitrage", [zeroAddress, admin!.account!.address, 1000n, 500]),
                "Validation: zero address not permitted",
            );
        });

        it("reverts with zero min purchase amount", async function () {
            const [, admin, core] = await viem.getWalletClients();
            await viem.assertions.revertWith(
                viem.deployContract("CoretimeArbitrage", [core!.account!.address, admin!.account!.address, 0n, 500]),
                "Validation: amount must be greater than zero",
            );
        });

        it("reverts if fraction BPS > 10_000", async function () {
            const [, admin, core] = await viem.getWalletClients();
            await viem.assertions.revertWith(
                viem.deployContract("CoretimeArbitrage", [core!.account!.address, admin!.account!.address, 1000n, 10_001]),
                "Validation: BPS exceeds 100%",
            );
        });
    });

    describe("deposit()", function () {

        it("increases treasury when called by core", async function () {
            const { coretime, core, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.deposit([ONE_DOT], { account: core!.account });
            assert.strictEqual(await coretime.read.treasury(), ONE_DOT);
        });

        it("reverts when called by non-core", async function () {
            const { coretime, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                coretime.write.deposit([ONE_DOT], { account: alice!.account }),
                coretime,
                "NotCore",
            );
        });

        it("reverts on zero amount", async function () {
            const { coretime, core } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWith(
                coretime.write.deposit([0n], { account: core!.account }),
                "Validation: amount must be greater than zero",
            );
        });

        it("accumulates across multiple deposits", async function () {
            const { coretime, core, ONE_DOT, TEN_DOT } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.deposit([ONE_DOT], { account: core!.account });
            await coretime.write.deposit([TEN_DOT], { account: core!.account });
            assert.strictEqual(await coretime.read.treasury(), ONE_DOT + TEN_DOT);
        });
    });

    describe("addPartner()", function () {

        it("whitelists partner as admin", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            assert.strictEqual(await coretime.read.isPartner([HYDRADX_PARA]), true);
            assert.strictEqual(await coretime.read.partnerBoostedApyBps([HYDRADX_PARA]), 1_200);
        });

        it("reverts for non-admin", async function () {
            const { coretime, alice, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: alice!.account }),
                coretime,
                "NotAdmin",
            );
        });

        it("reverts on parachain ID 0", async function () {
            const { coretime, admin } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWith(
                coretime.write.addPartner([0, 1_200], { account: admin!.account }),
                "Validation: invalid parachain ID",
            );
        });

        it("reverts on boostedApyBps > 10_000", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWith(
                coretime.write.addPartner([HYDRADX_PARA, 10_001], { account: admin!.account }),
                "Validation: BPS exceeds 100%",
            );
        });

        it("reverts on duplicate partner", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.addPartner([HYDRADX_PARA, 1_000], { account: admin!.account }),
                coretime,
                "AlreadyPartner",
            );
        });

        it("emits PartnerParachainUpdated approved=true", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.emitWithArgs(
                coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account }),
                coretime,
                "PartnerParachainUpdated",
                [HYDRADX_PARA, true],
            );
        });
    });

    describe("removePartner()", function () {

        it("removes whitelisted partner", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await coretime.write.removePartner([HYDRADX_PARA], { account: admin!.account });
            assert.strictEqual(await coretime.read.isPartner([HYDRADX_PARA]), false);
        });

        it("reverts for non-admin", async function () {
            const { coretime, admin, alice, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.removePartner([HYDRADX_PARA], { account: alice!.account }),
                coretime,
                "NotAdmin",
            );
        });

        it("reverts on non-partner", async function () {
            const { coretime, admin } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                coretime.write.removePartner([9999], { account: admin!.account }),
                coretime,
                "ParachainNotPartner",
            );
        });

        it("emits PartnerParachainUpdated approved=false", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await viem.assertions.emitWithArgs(
                coretime.write.removePartner([HYDRADX_PARA], { account: admin!.account }),
                coretime,
                "PartnerParachainUpdated",
                [HYDRADX_PARA, false],
            );
        });
    });

    describe("triggerEpoch()", function () {

        async function readyFixture() {
            const base = await networkHelpers.loadFixture(deployFixture);
            await base.coretime.write.addPartner([base.HYDRADX_PARA, 1_200], { account: base.admin!.account });
            await base.coretime.write.deposit([base.TEN_DOT], { account: base.core!.account });
            return base;
        }

        it("succeeds when conditions are met", async function () {
            const { coretime } = await readyFixture();
            await coretime.write.triggerEpoch();
        });

        it("zeroes treasury after epoch", async function () {
            const { coretime } = await readyFixture();
            await coretime.write.triggerEpoch();
            assert.strictEqual(await coretime.read.treasury(), 0n);
        });

        it("increments currentEpoch", async function () {
            const { coretime } = await readyFixture();
            await coretime.write.triggerEpoch();
            assert.strictEqual(await coretime.read.currentEpoch(), 1n);
        });

        it("emits CoretimePurchased", async function () {
            const { coretime } = await readyFixture();
            await viem.assertions.emit(
                coretime.write.triggerEpoch(),
                coretime,
                "CoretimePurchased",
            );
        });

        it("reverts before cooldown elapses", async function () {
            const { coretime, core, TEN_DOT } = await readyFixture();
            await coretime.write.triggerEpoch();
            await coretime.write.deposit([TEN_DOT], { account: core!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.triggerEpoch(),
                coretime,
                "EpochCooldownActive",
            );
        });

        it("succeeds after 7 days", async function () {
            const { coretime, core, TEN_DOT } = await readyFixture();
            await coretime.write.triggerEpoch();
            await networkHelpers.time.increase(7 * 24 * 3600 + 1);
            await coretime.write.deposit([TEN_DOT], { account: core!.account });
            await coretime.write.triggerEpoch();
        });

        it("reverts if treasury below minimum", async function () {
            const { coretime, core, admin, ONE_DOT, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await coretime.write.deposit([ONE_DOT], { account: core!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.triggerEpoch(),
                coretime,
                "TreasuryBelowMinimum",
            );
        });

        it("reverts if no partners registered", async function () {
            const { coretime, core, TEN_DOT } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.deposit([TEN_DOT], { account: core!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.triggerEpoch(),
                coretime,
                "NoPartnersRegistered",
            );
        });

        it("assigns to partner with highest boosted APY", async function () {
            const { coretime, core, admin, TEN_DOT, HYDRADX_PARA, INTERLAY_PARA } =
                await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 800], { account: admin!.account });
            await coretime.write.addPartner([INTERLAY_PARA, 1_500], { account: admin!.account });
            await coretime.write.deposit([TEN_DOT], { account: core!.account });
            await viem.assertions.emitWithArgs(
                coretime.write.triggerEpoch(),
                coretime,
                "CoretimeAssigned",
                [INTERLAY_PARA, anyValue, 1_500],
            );
        });
    });

    describe("epochReady()", function () {

        it("returns false with no treasury", async function () {
            const { coretime } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await coretime.read.epochReady(), false);
        });

        it("returns true when all conditions met", async function () {
            const { coretime, core, admin, TEN_DOT, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await coretime.write.deposit([TEN_DOT], { account: core!.account });
            assert.strictEqual(await coretime.read.epochReady(), true);
        });
    });
});
