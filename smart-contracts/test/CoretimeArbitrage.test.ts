import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { network } from "hardhat";
import { parseUnits, zeroAddress } from "viem";
import { anyValue } from "@nomicfoundation/hardhat-viem-assertions/predicates";

const { viem, networkHelpers } = await network.connect();

describe("CoretimeArbitrage", function () {

    async function deployFixture() {
        const [owner, admin, core, alice, bob] = await viem.getWalletClients();

        const coretime = await viem.deployContract("CoretimeArbitrage");
        await coretime.write.initialize([
            admin!.account!.address,
            owner!.account!.address,
            core!.account!.address,
            admin!.account!.address,
            500,
        ]);

        const ONE_DOT = parseUnits("1", 18);
        const TEN_DOT = parseUnits("10", 18);
        const HUNDRED_DOT = parseUnits("100", 18);
        const HYDRADX_PARA = 2034;
        const INTERLAY_PARA = 2032;

        return { coretime, owner, admin, core, alice, bob, ONE_DOT, TEN_DOT, HUNDRED_DOT, HYDRADX_PARA, INTERLAY_PARA };
    }

    describe("Deployment", function () {

        it("sets core correctly", async function () {
            const { coretime, core } = await networkHelpers.loadFixture(deployFixture);
            // In the new contract, the keeper role is assigned to core
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

        it("reverts with zero min purchase amount", async function () {
            const [, admin, core] = await viem.getWalletClients();
            await viem.assertions.revertWith(
                viem.deployContract("CoretimeArbitrage", [core!.account!.address, admin!.account!.address, 0n, 500]),
                "Validation: amount must be greater than zero",
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

    describe("deposit()", function () {

        it("increases treasury Reserve when called by core", async function () {
            const { coretime, core, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.accumulateReserve([ONE_DOT], { account: core!.account });
            assert.strictEqual(await coretime.read.treasuryReserve(), ONE_DOT);
        });

        it("reverts when called by non-core", async function () {
            const { coretime, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.revertWithCustomError(
                coretime.write.accumulateReserve([ONE_DOT], { account: alice!.account }),
                coretime,
                "AccessControlUnauthorizedAccount",
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

        it("accumulates across multiple deposits", async function () {
            const { coretime, core, ONE_DOT, TEN_DOT } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.accumulateReserve([ONE_DOT], { account: core!.account });
            await coretime.write.accumulateReserve([TEN_DOT], { account: core!.account });
            assert.strictEqual(await coretime.read.treasuryReserve(), ONE_DOT + TEN_DOT);
        });
    });

    describe("addPartner()", function () {

        it("whitelists partner as admin", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            const partner = await coretime.read.partners([HYDRADX_PARA]);
            assert.strictEqual(partner[2], true); // active
            assert.strictEqual(partner[1], 1_200n); // boostedYieldBps
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
            await viem.assertions.revertWithCustomError(
                coretime.write.addPartner([0, 1_200], { account: admin!.account }),
                coretime,
                "InvalidParachainId",
            );
        });

        it("reverts on boostedApyBps > 10_000", async function () {
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

        it("emits PartnerParachainUpdated approved=true", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await viem.assertions.emitWithArgs(
                coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account }),
                coretime,
                "PartnerParachainAdded",
                [HYDRADX_PARA, 1_200n],
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
                "AccessControlUnauthorizedAccount",
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

        it("emits PartnerParachainUpdated approved=false", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await viem.assertions.emitWithArgs(
                coretime.write.removePartner([HYDRADX_PARA], { account: admin!.account }),
                coretime,
                "PartnerParachainRemoved",
                [HYDRADX_PARA],
            );
        });
    });

    describe("triggerEpoch()", function () {

        async function readyFixture() {
            const base = await networkHelpers.loadFixture(deployFixture);
            await base.coretime.write.addPartner([base.HYDRADX_PARA, 1_200], { account: base.admin!.account });
            await base.coretime.write.accumulateReserve([base.TEN_DOT], { account: base.core!.account });
            return base;
        }

        it("succeeds when conditions are met", async function () {
            const { coretime } = await readyFixture();
            await coretime.write.triggerEpoch();
        });

        it("zeroes treasury after epoch", async function () {
            const { coretime } = await readyFixture();
            await coretime.write.epochTrigger([0n]);
            assert.strictEqual(await coretime.read.treasuryReserve(), 0);
        });

        it("increments currentEpoch", async function () {
            const { coretime } = await readyFixture();
            await coretime.write.epochTrigger([0n]);
            assert.strictEqual(await coretime.read.epochCount(), 1n);
        });

        it("emits CoretimePurchased", async function () {
            const { coretime } = await readyFixture();
            await viem.assertions.emit(
                coretime.write.epochTrigger([0n]),
                coretime,
                "CoretimePurchased",
            );
        });

        it("reverts before cooldown elapses", async function () {
            const { coretime, core, TEN_DOT } = await readyFixture();
            await coretime.write.epochTrigger([0n]);
            await coretime.write.accumulateReserve([TEN_DOT], { account: core!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.epochTrigger([0n]),
                coretime,
                "EpochNotReady",
            );
        });

        it("succeeds after 7 days", async function () {
            const { coretime, core, TEN_DOT } = await readyFixture();
            await coretime.write.epochTrigger([0n]);
            // mining blocks on hardhat
            for (let i = 0; i < 100801; i++) await network.provider.send("evm_mine");
            await coretime.write.accumulateReserve([TEN_DOT], { account: core!.account });
            await coretime.write.epochTrigger([0n]);
        });

        it("reverts if treasury below minimum", async function () {
            const { coretime, core, admin, ONE_DOT, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await coretime.write.deposit([ONE_DOT], { account: core!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.epochTrigger([0n]),
                coretime,
                "ReserveTooLow",
            );
        });

        it("reverts if no partners registered", async function () {
            const { coretime, core, TEN_DOT } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.deposit([TEN_DOT], { account: core!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.epochTrigger([0n]),
                coretime,
                "ReserveTooLow",
            );
        });

        it("assigns to partner with highest boosted APY", async function () {
            const { coretime, core, admin, TEN_DOT, HYDRADX_PARA, INTERLAY_PARA } =
                await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 800], { account: admin!.account });
            await coretime.write.addPartner([INTERLAY_PARA, 1_500], { account: admin!.account });
            await coretime.write.accumulateReserve([TEN_DOT], { account: core!.account });
            await viem.assertions.emitWithArgs(
                coretime.write.epochTrigger([0n]),
                coretime,
                "CoretimeAssigned",
                [BigInt(INTERLAY_PARA), anyValue, 1_500n],
            );
        });
    });

    describe("epochReady()", function () {

        it("returns false with no treasury", async function () {
            const { coretime } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await coretime.read.treasuryReserve(), 0);
        });

        it("returns true when all conditions met", async function () {
            const { coretime, core, admin, TEN_DOT, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            await coretime.write.accumulateReserve([TEN_DOT], { account: core!.account });
            assert.strictEqual(await coretime.read.blocksUntilNextEpoch(), 0n);
        });
    });
});
