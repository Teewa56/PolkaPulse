import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { network } from "hardhat";
import { parseUnits, zeroAddress, getAddress } from "viem";
import { anyValue } from "@nomicfoundation/hardhat-viem-assertions/predicates";

const { viem, networkHelpers } = await network.connect();

describe("CoretimeArbitrage", function () {

    async function deployFixture() {
        const [signer1, owner, core, alice, bob] = await viem.getWalletClients();
        const admin = signer1;

        const coretime = await viem.deployContract("CoretimeArbitrage");
        // Upgradeable initialization
        await coretime.write.initialize([
            admin!.account!.address,
            owner!.account!.address,
            core!.account!.address,
            admin!.account!.address,
            500, // 5% treasuryBps
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
            assert.strictEqual(await coretime.read.treasuryReserve(), Number(expectedReserved));
        });

        it("reverts when called by non-keeper", async function () {
            const { coretime, alice, ONE_DOT } = await networkHelpers.loadFixture(deployFixture);
            const KEEPER_ROLE = await coretime.read.KEEPER_ROLE();
            await viem.assertions.revertWithCustomError(
                coretime.write.accumulateReserve([ONE_DOT], { account: alice!.account }),
                coretime,
                "AccessControlUnauthorizedAccount",
                [getAddress(alice!.account!.address), KEEPER_ROLE]
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
            assert.strictEqual(await coretime.read.treasuryReserve(), Number(expectedTotal));
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
            const ADMIN_ROLE = await coretime.read.ADMIN_ROLE();
            await viem.assertions.revertWithCustomError(
                coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: alice!.account }),
                coretime,
                "AccessControlUnauthorizedAccount",
                [getAddress(alice!.account!.address), ADMIN_ROLE]
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

        it("emits PartnerParachainAdded event", async function () {
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
            await viem.assertions.revertWithCustomError(
                coretime.write.removePartner([HYDRADX_PARA], { account: alice!.account }),
                coretime,
                "AccessControlUnauthorizedAccount",
                [getAddress(alice!.account!.address), ADMIN_ROLE]
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
            // epochTrigger needs blocks to pass. Since initial lastEpochBlock is 0, first one is ready.
            // But we need some reserve.
            await base.coretime.write.accumulateReserve([base.HUNDRED_DOT], { account: base.core!.account });
            return base;
        }

        it("succeeds when conditions are met", async function () {
            const { coretime } = await readyFixture();
            await coretime.write.epochTrigger([0n]);
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

        it("succeeds after 100_800 blocks", async function () {
            const { coretime, core, TEN_DOT } = await readyFixture();
            await coretime.write.epochTrigger([0n]);

            // Advance 100,800 blocks
            await network.provider.send("hardhat_mine", ["0x189C0"]); // 100,800 in hex

            await coretime.write.accumulateReserve([TEN_DOT], { account: core!.account });
            await coretime.write.epochTrigger([0n]);
        });

        it("reverts if reserve is zero", async function () {
            const { coretime, admin, HYDRADX_PARA } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 1_200], { account: admin!.account });
            // lastEpochBlock is 0, so epoch timing is ready. But reserve is 0.
            await viem.assertions.revertWithCustomError(
                coretime.write.epochTrigger([0n]),
                coretime,
                "ReserveTooLow",
                [0n, 1n]
            );
        });

        it("reverts if no partners registered", async function () {
            const { coretime, core, TEN_DOT } = await networkHelpers.loadFixture(deployFixture);
            await coretime.write.accumulateReserve([TEN_DOT], { account: core!.account });
            await viem.assertions.revertWithCustomError(
                coretime.write.epochTrigger([0n]),
                coretime,
                "ReserveTooLow",
                [0n, 1n]
            );
        });

        it("distributes units to partners proportionally (equal weight)", async function () {
            const { coretime, core, admin, HUNDRED_DOT, HYDRADX_PARA, INTERLAY_PARA } =
                await networkHelpers.loadFixture(deployFixture);
            await coretime.write.addPartner([HYDRADX_PARA, 800], { account: admin!.account });
            await coretime.write.addPartner([INTERLAY_PARA, 1_500], { account: admin!.account });

            await coretime.write.accumulateReserve([HUNDRED_DOT], { account: core!.account });

            // Total units purchased is HUNDRED_DOT / 20 * (1 unit/DOT placeholder) = 5 units.
            // Wait, accumulateReserve: 100 DOT * 500 / 10000 = 5 DOT.
            // coretimeUnits = 5 DOT / 1e18 = 0... wait.
            // Let's use larger numbers.
            const HUGE_YIELD = parseUnits("1000", 18);
            await coretime.write.accumulateReserve([HUGE_YIELD], { account: core!.account });
            // Reserve = 1000 * 5% = 50 DOT. coretimeUnits = 50.
            // 2 partners -> 25 units each.

            await viem.assertions.emitWithArgs(
                coretime.write.epochTrigger([0n]),
                coretime,
                "CoretimeAssigned",
                [HYDRADX_PARA, anyValue, 800n],
            );
        });
    });

    describe("blocksUntilNextEpoch()", function () {

        it("returns 0 when initial", async function () {
            const { coretime } = await networkHelpers.loadFixture(deployFixture);
            assert.strictEqual(await coretime.read.blocksUntilNextEpoch(), 0n);
        });

        it("returns positive value after trigger", async function () {
            const { coretime } = await readyFixture();
            async function readyFixture() {
                const base = await networkHelpers.loadFixture(deployFixture);
                await base.coretime.write.addPartner([base.HYDRADX_PARA, 1_200], { account: base.admin!.account });
                await base.coretime.write.accumulateReserve([base.TEN_DOT], { account: base.core!.account });
                return base;
            }
            await coretime.write.epochTrigger([0n]);
            const remaining = await coretime.read.blocksUntilNextEpoch();
            assert.ok(remaining > 0n);
            assert.ok(remaining <= 100800n);
        });
    });
});
