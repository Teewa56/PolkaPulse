import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("CoretimeArbitrage", function () {

    async function deployFixture() {
        const [owner, admin, core, alice, bob] = await ethers.getSigners();

        const Coretime = await ethers.getContractFactory("CoretimeArbitrage");
        const coretime = await Coretime.deploy(
            core.address,
            admin.address,
            ethers.parseUnits("10", 18),
            500
        );

        const ONE_DOT     = ethers.parseUnits("1", 18);
        const TEN_DOT     = ethers.parseUnits("10", 18);
        const HUNDRED_DOT = ethers.parseUnits("100", 18);
        const HYDRADX_PARA  = 2034;
        const INTERLAY_PARA = 2032;

        return { coretime, owner, admin, core, alice, bob, ONE_DOT, TEN_DOT, HUNDRED_DOT, HYDRADX_PARA, INTERLAY_PARA };
    }

    describe("Deployment", function () {

        it("sets core correctly", async function () {
            const { coretime, core } = await loadFixture(deployFixture);
            expect(await coretime.core()).to.equal(core.address);
        });

        it("sets admin correctly", async function () {
            const { coretime, admin } = await loadFixture(deployFixture);
            expect(await coretime.admin()).to.equal(admin.address);
        });

        it("reverts with zero core", async function () {
            const Coretime = await ethers.getContractFactory("CoretimeArbitrage");
            const [, admin] = await ethers.getSigners();
            await expect(Coretime.deploy(ethers.ZeroAddress, admin.address, 1000n, 500))
                .to.be.revertedWith("Validation: zero address not permitted");
        });

        it("reverts with zero min purchase amount", async function () {
            const Coretime = await ethers.getContractFactory("CoretimeArbitrage");
            const [, admin, core] = await ethers.getSigners();
            await expect(Coretime.deploy(core.address, admin.address, 0n, 500))
                .to.be.revertedWith("Validation: amount must be greater than zero");
        });

        it("reverts if fraction BPS > 10_000", async function () {
            const Coretime = await ethers.getContractFactory("CoretimeArbitrage");
            const [, admin, core] = await ethers.getSigners();
            await expect(Coretime.deploy(core.address, admin.address, 1000n, 10_001))
                .to.be.revertedWith("Validation: BPS exceeds 100%");
        });
    });

    describe("deposit()", function () {

        it("increases treasury when called by core", async function () {
            const { coretime, core, ONE_DOT } = await loadFixture(deployFixture);
            await coretime.connect(core).deposit(ONE_DOT);
            expect(await coretime.treasury()).to.equal(ONE_DOT);
        });

        it("reverts when called by non-core", async function () {
            const { coretime, alice, ONE_DOT } = await loadFixture(deployFixture);
            await expect(coretime.connect(alice).deposit(ONE_DOT))
                .to.be.revertedWithCustomError(coretime, "NotCore");
        });

        it("reverts on zero amount", async function () {
            const { coretime, core } = await loadFixture(deployFixture);
            await expect(coretime.connect(core).deposit(0n))
                .to.be.revertedWith("Validation: amount must be greater than zero");
        });

        it("accumulates across multiple deposits", async function () {
            const { coretime, core, ONE_DOT, TEN_DOT } = await loadFixture(deployFixture);
            await coretime.connect(core).deposit(ONE_DOT);
            await coretime.connect(core).deposit(TEN_DOT);
            expect(await coretime.treasury()).to.equal(ONE_DOT + TEN_DOT);
        });
    });

    describe("addPartner()", function () {

        it("whitelists partner as admin", async function () {
            const { coretime, admin, HYDRADX_PARA } = await loadFixture(deployFixture);
            await coretime.connect(admin).addPartner(HYDRADX_PARA, 1_200);
            expect(await coretime.isPartner(HYDRADX_PARA)).to.equal(true);
            expect(await coretime.partnerBoostedApyBps(HYDRADX_PARA)).to.equal(1_200);
        });

        it("reverts for non-admin", async function () {
            const { coretime, alice, HYDRADX_PARA } = await loadFixture(deployFixture);
            await expect(coretime.connect(alice).addPartner(HYDRADX_PARA, 1_200))
                .to.be.revertedWithCustomError(coretime, "NotAdmin");
        });

        it("reverts on parachain ID 0", async function () {
            const { coretime, admin } = await loadFixture(deployFixture);
            await expect(coretime.connect(admin).addPartner(0, 1_200))
                .to.be.revertedWith("Validation: invalid parachain ID");
        });

        it("reverts on boostedApyBps > 10_000", async function () {
            const { coretime, admin, HYDRADX_PARA } = await loadFixture(deployFixture);
            await expect(coretime.connect(admin).addPartner(HYDRADX_PARA, 10_001))
                .to.be.revertedWith("Validation: BPS exceeds 100%");
        });

        it("reverts on duplicate partner", async function () {
            const { coretime, admin, HYDRADX_PARA } = await loadFixture(deployFixture);
            await coretime.connect(admin).addPartner(HYDRADX_PARA, 1_200);
            await expect(coretime.connect(admin).addPartner(HYDRADX_PARA, 1_000))
                .to.be.revertedWithCustomError(coretime, "AlreadyPartner");
        });

        it("emits PartnerParachainUpdated approved=true", async function () {
            const { coretime, admin, HYDRADX_PARA } = await loadFixture(deployFixture);
            await expect(coretime.connect(admin).addPartner(HYDRADX_PARA, 1_200))
                .to.emit(coretime, "PartnerParachainUpdated")
                .withArgs(HYDRADX_PARA, true);
        });
    });

    describe("removePartner()", function () {

        it("removes whitelisted partner", async function () {
            const { coretime, admin, HYDRADX_PARA } = await loadFixture(deployFixture);
            await coretime.connect(admin).addPartner(HYDRADX_PARA, 1_200);
            await coretime.connect(admin).removePartner(HYDRADX_PARA);
            expect(await coretime.isPartner(HYDRADX_PARA)).to.equal(false);
        });

        it("reverts for non-admin", async function () {
            const { coretime, admin, alice, HYDRADX_PARA } = await loadFixture(deployFixture);
            await coretime.connect(admin).addPartner(HYDRADX_PARA, 1_200);
            await expect(coretime.connect(alice).removePartner(HYDRADX_PARA))
                .to.be.revertedWithCustomError(coretime, "NotAdmin");
        });

        it("reverts on non-partner", async function () {
            const { coretime, admin } = await loadFixture(deployFixture);
            await expect(coretime.connect(admin).removePartner(9999))
                .to.be.revertedWithCustomError(coretime, "ParachainNotPartner");
        });

        it("emits PartnerParachainUpdated approved=false", async function () {
            const { coretime, admin, HYDRADX_PARA } = await loadFixture(deployFixture);
            await coretime.connect(admin).addPartner(HYDRADX_PARA, 1_200);
            await expect(coretime.connect(admin).removePartner(HYDRADX_PARA))
                .to.emit(coretime, "PartnerParachainUpdated")
                .withArgs(HYDRADX_PARA, false);
        });
    });

    describe("triggerEpoch()", function () {

        async function readyFixture() {
            const base = await loadFixture(deployFixture);
            await base.coretime.connect(base.admin).addPartner(base.HYDRADX_PARA, 1_200);
            await base.coretime.connect(base.core).deposit(base.TEN_DOT);
            return base;
        }

        it("succeeds when conditions are met", async function () {
            const { coretime } = await readyFixture();
            await expect(coretime.triggerEpoch()).to.not.be.reverted;
        });

        it("zeroes treasury after epoch", async function () {
            const { coretime } = await readyFixture();
            await coretime.triggerEpoch();
            expect(await coretime.treasury()).to.equal(0);
        });

        it("increments currentEpoch", async function () {
            const { coretime } = await readyFixture();
            await coretime.triggerEpoch();
            expect(await coretime.currentEpoch()).to.equal(1);
        });

        it("emits CoretimePurchased", async function () {
            const { coretime } = await readyFixture();
            await expect(coretime.triggerEpoch()).to.emit(coretime, "CoretimePurchased");
        });

        it("reverts before cooldown elapses", async function () {
            const { coretime, core, TEN_DOT } = await readyFixture();
            await coretime.triggerEpoch();
            await coretime.connect(core).deposit(TEN_DOT);
            await expect(coretime.triggerEpoch())
                .to.be.revertedWithCustomError(coretime, "EpochCooldownActive");
        });

        it("succeeds after 7 days", async function () {
            const { coretime, core, TEN_DOT } = await readyFixture();
            await coretime.triggerEpoch();
            await time.increase(7 * 24 * 3600 + 1);
            await coretime.connect(core).deposit(TEN_DOT);
            await expect(coretime.triggerEpoch()).to.not.be.reverted;
        });

        it("reverts if treasury below minimum", async function () {
            const { coretime, core, admin, ONE_DOT, HYDRADX_PARA } = await loadFixture(deployFixture);
            await coretime.connect(admin).addPartner(HYDRADX_PARA, 1_200);
            await coretime.connect(core).deposit(ONE_DOT);
            await expect(coretime.triggerEpoch())
                .to.be.revertedWithCustomError(coretime, "TreasuryBelowMinimum");
        });

        it("reverts if no partners registered", async function () {
            const { coretime, core, TEN_DOT } = await loadFixture(deployFixture);
            await coretime.connect(core).deposit(TEN_DOT);
            await expect(coretime.triggerEpoch())
                .to.be.revertedWithCustomError(coretime, "NoPartnersRegistered");
        });

        it("assigns to partner with highest boosted APY", async function () {
            const { coretime, core, admin, TEN_DOT, HYDRADX_PARA, INTERLAY_PARA } =
                await loadFixture(deployFixture);
            await coretime.connect(admin).addPartner(HYDRADX_PARA, 800);
            await coretime.connect(admin).addPartner(INTERLAY_PARA, 1_500);
            await coretime.connect(core).deposit(TEN_DOT);
            await expect(coretime.triggerEpoch())
                .to.emit(coretime, "CoretimeAssigned")
                .withArgs(INTERLAY_PARA, anyValue, 1_500);
        });
    });

    describe("epochReady()", function () {

        it("returns false with no treasury", async function () {
            const { coretime } = await loadFixture(deployFixture);
            expect(await coretime.epochReady()).to.equal(false);
        });

        it("returns true when all conditions met", async function () {
            const { coretime, core, admin, TEN_DOT, HYDRADX_PARA } = await loadFixture(deployFixture);
            await coretime.connect(admin).addPartner(HYDRADX_PARA, 1_200);
            await coretime.connect(core).deposit(TEN_DOT);
            expect(await coretime.epochReady()).to.equal(true);
        });
    });
});

function anyValue() { return true; }