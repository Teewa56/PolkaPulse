import { describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { network } from "hardhat";
import { zeroAddress } from "viem";

const { viem, networkHelpers } = await network.connect();

describe("Governance", function () {

    async function deployGovernanceFixture() {
        const [signer1, signer2, signer3, outsider] = await viem.getWalletClients();

        const multisig = await viem.deployContract("PolkaPulseMultisig", [
            [signer1!.account!.address, signer2!.account!.address, signer3!.account!.address],
            2,
        ]);

        const MIN_DELAY = 48 * 3600; // 48 hours
        const timelock = await viem.deployContract("PolkaPulseTimelock", [
            MIN_DELAY,
            [multisig.address],
            [multisig.address],
            zeroAddress,
        ]);

        return { multisig, timelock, signer1, signer2, signer3, outsider };
    }

    describe("PolkaPulseMultisig Deployment", function () {

        it("recognises all signers", async function () {
            const { multisig, signer1, signer2, signer3 } = await networkHelpers.loadFixture(deployGovernanceFixture);
            assert.strictEqual(await multisig.read.isOwner([signer1!.account!.address]), true);
            assert.strictEqual(await multisig.read.isOwner([signer2!.account!.address]), true);
            assert.strictEqual(await multisig.read.isOwner([signer3!.account!.address]), true);
        });

        it("sets threshold to 2", async function () {
            const { multisig } = await networkHelpers.loadFixture(deployGovernanceFixture);
            assert.strictEqual(await multisig.read.required(), 2);
        });

        it("reverts with threshold < 2", async function () {
            const [s1, s2] = await viem.getWalletClients();
            await viem.assertions.revertWith(
                viem.deployContract("PolkaPulseMultisig", [
                    [s1!.account!.address, s2!.account!.address],
                    1,
                ]),
                "Multisig: threshold must be at least 2",
            );
        });

        it("reverts with threshold > signers.length", async function () {
            const [s1, s2] = await viem.getWalletClients();
            await viem.assertions.revertWith(
                viem.deployContract("PolkaPulseMultisig", [
                    [s1!.account!.address, s2!.account!.address],
                    3,
                ]),
                "Multisig: threshold exceeds signers",
            );
        });

        it("reverts with duplicate signer", async function () {
            const [s1] = await viem.getWalletClients();
            await viem.assertions.revertWith(
                viem.deployContract("PolkaPulseMultisig", [
                    [s1!.account!.address, s1!.account!.address],
                    2,
                ]),
                "Multisig: duplicate signer",
            );
        });

        it("reverts with zero address signer", async function () {
            const [s1] = await viem.getWalletClients();
            await viem.assertions.revertWith(
                viem.deployContract("PolkaPulseMultisig", [
                    [s1!.account!.address, zeroAddress],
                    2,
                ]),
                "Validation: zero address not permitted",
            );
        });
    });

    describe("PolkaPulseMultisig Proposal Lifecycle", function () {

        async function getProposalId(multisig: Awaited<ReturnType<typeof viem.deployContract>>, signer: { account: { address: `0x${string}` } }, target: string) {
            const countBefore = await multisig.read.txCount();
            await multisig.write.propose([target as `0x${string}`, 0n, "0x1234" as `0x${string}`], { account: signer.account });
            return countBefore;
        }

        it("non-signer cannot propose", async function () {
            const { multisig, outsider } = await networkHelpers.loadFixture(deployGovernanceFixture);
            await viem.assertions.revertWithCustomError(
                multisig.write.propose([outsider!.account!.address, 0n, "0x" as `0x${string}`], { account: outsider!.account }),
                multisig,
                "NotOwner",
            );
        });

        it("proposer auto-confirms with count = 1", async function () {
            const { multisig, signer1, outsider } = await networkHelpers.loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1!, outsider!.account!.address);
            assert.strictEqual(await multisig.read.getConfirmationCount([proposalId]), 1);
            assert.strictEqual(await multisig.read.confirmed([proposalId, signer1!.account!.address]), true);
        });

        it("second signer brings count to 2 (threshold met)", async function () {
            const { multisig, signer1, signer2, outsider } = await networkHelpers.loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1!, outsider!.account!.address);
            await multisig.write.confirm([proposalId], { account: signer2!.account });
            assert.strictEqual(await multisig.read.getConfirmationCount([proposalId]), 2);
        });

        it("signer cannot confirm twice", async function () {
            const { multisig, signer1, outsider } = await networkHelpers.loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1!, outsider!.account!.address);
            await viem.assertions.revertWithCustomError(
                multisig.write.confirm([proposalId], { account: signer1!.account }),
                multisig,
                "TxAlreadyConfirmed",
            );
        });

        it("cannot execute below threshold", async function () {
            const { multisig, signer1, outsider } = await networkHelpers.loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1!, outsider!.account!.address);
            await viem.assertions.revertWithCustomError(
                multisig.write.execute([proposalId], { account: signer1!.account }),
                multisig,
                "InsufficientConfirmations",
            );
        });

        it("signer can revoke confirmation", async function () {
            const { multisig, signer1, signer2, outsider } = await networkHelpers.loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1!, outsider!.account!.address);
            await multisig.write.confirm([proposalId], { account: signer2!.account });
            await multisig.write.revoke([proposalId], { account: signer2!.account });
            assert.strictEqual(await multisig.read.getConfirmationCount([proposalId]), 1);
        });

        it("non-signer cannot revoke", async function () {
            const { multisig, signer1, outsider } = await networkHelpers.loadFixture(deployGovernanceFixture);
            const proposalId = await getProposalId(multisig, signer1!, outsider!.account!.address);
            await viem.assertions.revertWithCustomError(
                multisig.write.revoke([proposalId], { account: outsider!.account }),
                multisig,
                "NotOwner",
            );
        });
    });

    describe("PolkaPulseTimelock", function () {

        it("deploys with MIN_DELAY of 48 hours", async function () {
            const { timelock } = await networkHelpers.loadFixture(deployGovernanceFixture);
            const minDelay = await timelock.read.MIN_DELAY();
            assert.strictEqual(minDelay, 48n * 3600n);
        });

        it("reverts with delay below MIN_DELAY", async function () {
            const { timelock, multisig } = await networkHelpers.loadFixture(deployGovernanceFixture);
            await viem.assertions.revertWithCustomError(
                viem.deployContract("PolkaPulseTimelock", [
                    3600,
                    [multisig.address],
                    [multisig.address],
                    zeroAddress,
                ]),
                timelock,
                "DelayBelowMinimum",
            );
        });
    });
});
