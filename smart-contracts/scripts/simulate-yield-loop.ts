import { network } from "hardhat";
import { formatUnits } from "viem";

// Simulates a full Harvest → Optimizer → XCM dispatch → ppDOT rebase cycle
// on a local Chopsticks fork of the Asset Hub testnet.
//
// Run with:
//   npx hardhat run scripts/simulate-yield-loop.ts --network localhost
//
// Prerequisites:
//   - Chopsticks running: npx @acala-network/chopsticks --config chopsticks.yml
//   - Contracts deployed and POLKAPULSE_CORE_ADDRESS set in .env

async function main() {
    const { viem } = await network.connect();
    const [keeper] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();
    const testClient = await viem.getTestClient();

    if (!keeper) throw new Error("No keeper wallet");
    console.log("Simulating yield loop with keeper:", keeper.account.address);

    const proxyAddress = process.env.POLKAPULSE_CORE_ADDRESS;
    if (!proxyAddress) throw new Error("POLKAPULSE_CORE_ADDRESS not set in .env");

    const core     = await viem.getContractAt("IPolkaPulseCore", proxyAddress as `0x${string}`);
    const coreImpl = await viem.getContractAt("PolkaPulseCore", proxyAddress as `0x${string}`);

    // --- Check harvest readiness ---
    const ready = await core.read.harvestReady();
    console.log("Harvest ready:", ready);

    if (!ready) {
        console.log("Harvest not ready — fast-forwarding time on local fork...");
        if (testClient) {
            await testClient.increaseTime({ seconds: 3600 * 2 });
            await testClient.mine({ blocks: 1 });
        }
    }

    // --- Snapshot state before ---
    const totalDOTBefore = await core.read.totalDOT();
    const rateBefore     = await core.read.exchangeRate();

    console.log("\n=== BEFORE ===");
    console.log("totalDOT:     ", formatUnits(totalDOTBefore, 18), "DOT");
    console.log("exchangeRate: ", formatUnits(rateBefore, 18));

    // --- Execute yield loop ---
    console.log("\nExecuting yield loop...");
    const hash = await core.write.executeYieldLoop() as `0x${string}`;
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log("Tx hash:", receipt?.transactionHash);
    console.log("Gas used:", receipt?.gasUsed?.toString());

    // --- Parse events ---
    if (receipt?.logs) {
        for (const log of receipt.logs) {
            try {
                const parsed = coreImpl.abi && "parseEventLogs" in coreImpl
                    ? null
                    : null;
                // Simplified: log key event args if available
            } catch {
                // skip unparseable logs
            }
        }
    }

    // --- Snapshot state after ---
    const totalDOTAfter = await core.read.totalDOT();
    const rateAfter     = await core.read.exchangeRate();

    console.log("\n=== AFTER ===");
    console.log("totalDOT:     ", formatUnits(totalDOTAfter, 18), "DOT");
    console.log("exchangeRate: ", formatUnits(rateAfter, 18));

    // --- Invariant checks ---
    if (rateAfter < rateBefore) {
        throw new Error("INVARIANT VIOLATED: exchange rate decreased after yield loop!");
    }
    if (totalDOTAfter < totalDOTBefore) {
        throw new Error("INVARIANT VIOLATED: totalDOT decreased after yield loop!");
    }

    console.log("\n✅ Exchange rate is non-decreasing.");
    console.log("✅ totalDOT is non-decreasing.");
    console.log("✅ Yield loop simulation complete.");
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
