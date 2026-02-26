import { ethers } from "hardhat";

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
    const [keeper] = await ethers.getSigners();
    console.log("Simulating yield loop with keeper:", keeper.address);

    const proxyAddress = process.env.POLKAPULSE_CORE_ADDRESS;
    if (!proxyAddress) throw new Error("POLKAPULSE_CORE_ADDRESS not set in .env");

    const core     = await ethers.getContractAt("IPolkaPulseCore", proxyAddress);
    const coreImpl = await ethers.getContractAt("PolkaPulseCore", proxyAddress);

    // --- Check harvest readiness ---
    const ready = await core.harvestReady();
    console.log("Harvest ready:", ready);

    if (!ready) {
        console.log("Harvest not ready — fast-forwarding time on local fork...");
        await ethers.provider.send("evm_increaseTime", [3600 * 2]);
        await ethers.provider.send("evm_mine", []);
    }

    // --- Snapshot state before ---
    const totalDOTBefore = await core.totalDOT();
    const rateBefore     = await core.exchangeRate();

    console.log("\n=== BEFORE ===");
    console.log("totalDOT:     ", ethers.formatUnits(totalDOTBefore, 18), "DOT");
    console.log("exchangeRate: ", ethers.formatUnits(rateBefore, 18));

    // --- Execute yield loop ---
    console.log("\nExecuting yield loop...");
    const tx      = await core.executeYieldLoop();
    const receipt = await tx.wait();
    console.log("Tx hash:", receipt?.hash);
    console.log("Gas used:", receipt?.gasUsed.toString());

    // --- Parse events ---
    const parseLog = (log: any) => {
        try { return coreImpl.interface.parseLog(log); } catch { return null; }
    };

    const yieldEvent  = receipt?.logs.map(parseLog).find((e: any) => e?.name === "YieldLoopExecuted");
    const rebaseEvent = receipt?.logs.map(parseLog).find((e: any) => e?.name === "Rebased");

    if (yieldEvent) {
        console.log("\n=== YieldLoopExecuted ===");
        console.log("HydraDX amount:     ", ethers.formatUnits(yieldEvent.args.hydraDXAmount, 18), "DOT");
        console.log("Interlay amount:    ", ethers.formatUnits(yieldEvent.args.interlayAmount, 18), "DOT");
        console.log("Projected APY:      ", yieldEvent.args.projectedApyBps, "BPS");
        console.log("Expected yield DOT: ", ethers.formatUnits(yieldEvent.args.expectedYieldDot, 18), "DOT");
    }

    if (rebaseEvent) {
        console.log("\n=== Rebased ===");
        console.log("Old rate: ", ethers.formatUnits(rebaseEvent.args.oldRate, 18));
        console.log("New rate: ", ethers.formatUnits(rebaseEvent.args.newRate, 18));
        console.log("Yield:    ", ethers.formatUnits(rebaseEvent.args.yieldDot, 18), "DOT");
    }

    // --- Snapshot state after ---
    const totalDOTAfter = await core.totalDOT();
    const rateAfter     = await core.exchangeRate();

    console.log("\n=== AFTER ===");
    console.log("totalDOT:     ", ethers.formatUnits(totalDOTAfter, 18), "DOT");
    console.log("exchangeRate: ", ethers.formatUnits(rateAfter, 18));

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