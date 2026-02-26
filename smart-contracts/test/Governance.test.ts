import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("Governance", function () {

    async function deployGovernanceFixture() {
        const [signer1, signer2, signer3, outsider] = await ethers.getSigners();

        const Multisig = await ethers.getContractFactory("PolkaPulseMultisig");
        const multisig = await Multisig.deploy(
            [signer1.address, signer2.address, signer3.address],
            2
        );

        const Timelock = await ethers.getContractFactory("PolkaPulseTimelock");
        const timelock = await Timelock.deploy(await multisig.getAddress());

        return { multisig, timelock, signer1, signer2, signer3, outsider };
    }

    describe("PolkaPulseMultisig Deployment", function () {

        it("recognises all signers", async function () {
            const { multisig, signer1, signer2, signer3 } = await loadFixture(deployGovernanceFixture);
            expect(await multisig.isSigner(signer1.address)).to.equal(true);
            expect(await multisig.isSigner(signer2.address)).to.equal(true);
            expect(await multisig.isSigner(signer3.address)).to.equal(true);
        });

        it("sets threshold to 2", async function () {
            const { multisig } = await loadFixture(deployGovernanceFixture);
            expect(await multisig.threshold()).to.equal(2);
        });

        it("reverts with threshold < 2", async function () {
            const [s1, s2] = await ethers.getSigners();
            const Multisig = await ethers.getContractFactory("PolkaPulseMultisig");
            await expect(Multisig.deploy([s1.address, s2.address], 1))
                .to.be.revertedWith("Multisig: threshold must be at least 2");
        });

        it("reverts with threshold > signers.length", async function () {
            const [s1, s2] = await ethers.getSigners();
            const Multisig = await ethers.getContractFactory("PolkaPulseMultisig");
            await expect(Multisig.deploy([s1.address, s2.address], 3))
                .to.be.revertedWith("Multisig: threshold exceeds signers");
        });

        it("reverts with duplicate signer", async function () {
            const [s1] = await ethers.getSigners();
            const Multisig = await ethers.getContractFactory("PolkaPulseMultisig");
            await expect(Multisig.deploy([s1.address, s1.address], 2))
                .to.be.revertedWith("Multisig: duplicate signer");
        });

        it("reverts with zero address signer", async function () {
            const [s1] = await ethers.getSigners();
            const Multisig = await ethers.getContractFactory("PolkaPulseMultisig");
            await expect(Multisig.deploy([s1.address, ethers.ZeroAddress], 2))
                .to.be.revertedWith("Validation: zero address not permitted");
        });
    });

    describe("PolkaPulseMultisig Proposal Lifecycle", function () {

        async function getProposalId(multisig: any, signer: any, target: string) {
            const tx      = await multisig.connect(signer).propose(target, 0, "0x1234");
            const receipt = await tx.wait();
            return receipt?.logs[0]?.args?.[0];
        }

        it("non-signer cannot propose", async function () {
            const { multisig, outsider } = await loadFixture(deployGovernanceFixture);
            await expect(multisig.connect(outsider).propose(outsider.address, 0, "0x"))
                .to.be.revertedWithCustomError(multisig, "NotSigner");
        });

        it("proposer auto-confirms with count = 1", async function () {
            const { multisig, signer1, outsider } = await loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1, outsider.address);
            expect(await multisig.confirmationCount(proposalId)).to.equal(1);
            expect(await multisig.hasConfirmed(proposalId, signer1.address)).to.equal(true);
        });

        it("second signer brings count to 2 (threshold met)", async function () {
            const { multisig, signer1, signer2, outsider } = await loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1, outsider.address);
            await multisig.connect(signer2).confirm(proposalId);
            expect(await multisig.confirmationCount(proposalId)).to.equal(2);
        });

        it("signer cannot confirm twice", async function () {
            const { multisig, signer1, outsider } = await loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1, outsider.address);
            await expect(multisig.connect(signer1).confirm(proposalId))
                .to.be.revertedWithCustomError(multisig, "AlreadyConfirmed");
        });

        it("cannot execute below threshold", async function () {
            const { multisig, signer1, outsider } = await loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1, outsider.address);
            await expect(multisig.connect(signer1).execute(proposalId))
                .to.be.revertedWithCustomError(multisig, "ThresholdNotMet");
        });

        it("cannot execute expired proposal", async function () {
            const { multisig, signer1, signer2, outsider } = await loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1, outsider.address);
            await multisig.connect(signer2).confirm(proposalId);
            await time.increase(8 * 24 * 3600);
            await expect(multisig.connect(signer1).execute(proposalId))
                .to.be.revertedWithCustomError(multisig, "ProposalExpired");
        });

        it("signer can revoke confirmation", async function () {
            const { multisig, signer1, signer2, outsider } = await loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1, outsider.address);
            await multisig.connect(signer2).confirm(proposalId);
            await multisig.connect(signer2).revoke(proposalId);
            expect(await multisig.confirmationCount(proposalId)).to.equal(1);
        });

        it("non-signer cannot revoke", async function () {
            const { multisig, signer1, outsider } = await loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1, outsider.address);
            await expect(multisig.connect(outsider).revoke(proposalId))
                .to.be.revertedWithCustomError(multisig, "NotSigner");
        });
    });

    describe("PolkaPulseTimelock", function () {

        async function impersonateMultisig(multisig: any) {
            const addr = await multisig.getAddress();
            await ethers.provider.send("hardhat_impersonateAccount", [addr]);
            await ethers.provider.send("hardhat_setBalance", [addr, "0x1000000000000000000"]);
            return ethers.getSigner(addr);
        }

        async function stopImpersonating(multisig: any) {
            await ethers.provider.send("hardhat_stopImpersonatingAccount",
                [await multisig.getAddress()]);
        }

        it("sets proposer correctly", async function () {
            const { timelock, multisig } = await loadFixture(deployGovernanceFixture);
            expect(await timelock.proposer()).to.equal(await multisig.getAddress());
        });

        it("non-proposer cannot queue", async function () {
            const { timelock, outsider } = await loadFixture(deployGovernanceFixture);
            await expect(
                timelock.connect(outsider).queue(outsider.address, 0, "0x", 48 * 3600)
            ).to.be.revertedWithCustomError(timelock, "NotProposer");
        });

        it("delay below MIN_DELAY reverts", async function () {
            const { timelock, multisig, outsider } = await loadFixture(deployGovernanceFixture);
            const ms = await impersonateMultisig(multisig);
            await expect(
                timelock.connect(ms).queue(outsider.address, 0, "0x", 3600)
            ).to.be.revertedWithCustomError(timelock, "InvalidDelay");
            await stopImpersonating(multisig);
        });

        it("cannot execute before delay", async function () {
            const { timelock, multisig, outsider } = await loadFixture(deployGovernanceFixture);
            const ms = await impersonateMultisig(multisig);
            await timelock.connect(ms).queue(outsider.address, 0, "0x", 48 * 3600);
            await expect(timelock.execute(outsider.address, 0, "0x"))
                .to.be.revertedWithCustomError(timelock, "DelayNotElapsed");
            await stopImpersonating(multisig);
        });

        it("isReady returns true after delay", async function () {
            const { timelock, multisig, outsider } = await loadFixture(deployGovernanceFixture);
            const ms = await impersonateMultisig(multisig);
            await timelock.connect(ms).queue(outsider.address, 0, "0x", 48 * 3600);
            const opId = await timelock.operationId(outsider.address, 0, "0x");
            expect(await timelock.isReady(opId)).to.equal(false);
            await time.increase(48 * 3600 + 1);
            expect(await timelock.isReady(opId)).to.equal(true);
            await stopImpersonating(multisig);
        });

        it("non-proposer cannot cancel", async function () {
            const { timelock, outsider } = await loadFixture(deployGovernanceFixture);
            await expect(timelock.connect(outsider).cancel(ethers.ZeroHash))
                .to.be.revertedWithCustomError(timelock, "NotProposer");
        });
    });
});