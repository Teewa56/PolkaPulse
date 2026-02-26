import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with:", deployer.address);
    console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "DOT");

    const addresses: Record<string, string> = {};

    const SIGNERS = [
        process.env.SIGNER_1 || deployer.address,
        process.env.SIGNER_2 || deployer.address,
        process.env.SIGNER_3 || deployer.address,
    ];
    const THRESHOLD           = 2;
    const STASH_ACCOUNT       = process.env.STASH_ACCOUNT || ethers.ZeroHash;
    const REWARD_THRESHOLD    = ethers.parseUnits("10", 10);   // 10 DOT
    const HYDRADX_SOVEREIGN   = process.env.HYDRADX_SOVEREIGN  || ethers.ZeroHash;
    const INTERLAY_SOVEREIGN  = process.env.INTERLAY_SOVEREIGN || ethers.ZeroHash;
    const PROTOCOL_FEE_BPS    = 200;   // 2%
    const MIN_PURCHASE_AMOUNT = ethers.parseUnits("100", 10);  // 100 DOT
    const CORETIME_FRACTION   = 500;   // 5%

    // -------------------------------------------------------------------------
    // 1. PolkaPulseMultisig
    // -------------------------------------------------------------------------

    console.log("\n[1/8] Deploying PolkaPulseMultisig...");
    const Multisig  = await ethers.getContractFactory("PolkaPulseMultisig");
    const multisig  = await Multisig.deploy(SIGNERS, THRESHOLD);
    await multisig.waitForDeployment();
    addresses.multisig = await multisig.getAddress();
    console.log("  PolkaPulseMultisig:", addresses.multisig);

    // -------------------------------------------------------------------------
    // 2. PolkaPulseTimelock
    // -------------------------------------------------------------------------

    console.log("\n[2/8] Deploying PolkaPulseTimelock...");
    const Timelock  = await ethers.getContractFactory("PolkaPulseTimelock");
    const timelock  = await Timelock.deploy(addresses.multisig);
    await timelock.waitForDeployment();
    addresses.timelock = await timelock.getAddress();
    console.log("  PolkaPulseTimelock:", addresses.timelock);
    console.log("  MIN_DELAY:", (await timelock.MIN_DELAY()).toString(), "seconds (48h)");

    // -------------------------------------------------------------------------
    // 3. ppDOT
    // -------------------------------------------------------------------------

    console.log("\n[3/8] Deploying ppDOT...");
    const PPDot = await ethers.getContractFactory("ppDOT");
    // Temporary core = deployer. Updated after proxy deployment.
    const ppdot = await PPDot.deploy(deployer.address);
    await ppdot.waitForDeployment();
    addresses.ppdot = await ppdot.getAddress();
    console.log("  ppDOT:", addresses.ppdot);

    // -------------------------------------------------------------------------
    // 4. RewardMonitor
    // -------------------------------------------------------------------------

    console.log("\n[4/8] Deploying RewardMonitor...");
    const RewardMonitor = await ethers.getContractFactory("RewardMonitor");
    const rewardMonitor = await RewardMonitor.deploy(
        deployer.address,       // core placeholder
        addresses.timelock,
        STASH_ACCOUNT,
        REWARD_THRESHOLD,
    );
    await rewardMonitor.waitForDeployment();
    addresses.rewardMonitor = await rewardMonitor.getAddress();
    console.log("  RewardMonitor:", addresses.rewardMonitor);

    // -------------------------------------------------------------------------
    // 5. AtomicYieldExecutor
    // -------------------------------------------------------------------------

    console.log("\n[5/8] Deploying AtomicYieldExecutor...");
    const Executor     = await ethers.getContractFactory("AtomicYieldExecutor");
    const yieldExecutor = await Executor.deploy(
        deployer.address,
        addresses.timelock,
        HYDRADX_SOVEREIGN,
        INTERLAY_SOVEREIGN,
    );
    await yieldExecutor.waitForDeployment();
    addresses.yieldExecutor = await yieldExecutor.getAddress();
    console.log("  AtomicYieldExecutor:", addresses.yieldExecutor);

    // -------------------------------------------------------------------------
    // 6. CoretimeArbitrage
    // -------------------------------------------------------------------------

    console.log("\n[6/8] Deploying CoretimeArbitrage...");
    const Coretime        = await ethers.getContractFactory("CoretimeArbitrage");
    const coretimeArbitrage = await Coretime.deploy(
        deployer.address,
        addresses.timelock,
        MIN_PURCHASE_AMOUNT,
        CORETIME_FRACTION,
    );
    await coretimeArbitrage.waitForDeployment();
    addresses.coretimeArbitrage = await coretimeArbitrage.getAddress();
    console.log("  CoretimeArbitrage:", addresses.coretimeArbitrage);

    // -------------------------------------------------------------------------
    // 7. PolkaPulseCore (implementation)
    // -------------------------------------------------------------------------

    console.log("\n[7/8] Deploying PolkaPulseCore (implementation)...");
    const Core     = await ethers.getContractFactory("PolkaPulseCore");
    const coreImpl = await Core.deploy();
    await coreImpl.waitForDeployment();
    addresses.coreImpl = await coreImpl.getAddress();
    console.log("  PolkaPulseCore impl:", addresses.coreImpl);

    // Build initialize() calldata for the proxy constructor to delegatecall
    const initData = coreImpl.interface.encodeFunctionData("initialize", [
        addresses.timelock,
        addresses.ppdot,
        addresses.rewardMonitor,
        addresses.yieldExecutor,
        addresses.coretimeArbitrage,
        PROTOCOL_FEE_BPS,
    ]);

    // -------------------------------------------------------------------------
    // 8. PolkaPulseProxy
    // -------------------------------------------------------------------------

    console.log("\n[8/8] Deploying PolkaPulseProxy...");
    const Proxy = await ethers.getContractFactory("PolkaPulseProxy");
    const proxy = await Proxy.deploy(
        addresses.coreImpl,
        addresses.timelock,  // EIP-1967 admin = Timelock
        initData,            // runs initialize() via delegatecall in constructor
    );
    await proxy.waitForDeployment();
    addresses.proxy = await proxy.getAddress();
    console.log("  PolkaPulseProxy:", addresses.proxy);

    // -------------------------------------------------------------------------
    // Post-deploy verification
    // -------------------------------------------------------------------------

    console.log("\n======= DEPLOYMENT COMPLETE =======");
    console.log("Network:", (await ethers.provider.getNetwork()).name);
    console.log("\nAddresses:");
    for (const [name, addr] of Object.entries(addresses)) {
        console.log(`  ${name.padEnd(22)}: ${addr}`);
    }

    // Verify the proxy implementation slot is correct
    const proxyContract = await ethers.getContractAt("PolkaPulseProxy", addresses.proxy);
    const implSlot = await proxyContract.implementation();
    console.log("\nProxy implementation slot:", implSlot);
    console.log("Expected:                 ", addresses.coreImpl);
    console.log("Match:", implSlot.toLowerCase() === addresses.coreImpl.toLowerCase() ? "✅" : "❌ MISMATCH");

    // -------------------------------------------------------------------------
    // Write addresses to file for frontend and scripts to consume
    // -------------------------------------------------------------------------

    const outputPath = path.join(__dirname, "../deployed-addresses.json");
    fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
    console.log("\nAddresses written to:", outputPath);

    console.log("\n======= NEXT STEPS =======");
    console.log("1. Copy deployed-addresses.json values into frontend/.env.local");
    console.log("2. Update NEXT_PUBLIC_POLKAPULSE_CORE_ADDRESS with the proxy address");
    console.log("3. Propose multisig tx to update sub-contract core addresses from deployer to proxy");
    console.log("4. Run: npx hardhat run scripts/simulate-yield-loop.ts --network localhost");
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});