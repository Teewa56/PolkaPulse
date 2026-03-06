import { network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { parseUnits, formatUnits, encodeFunctionData, zeroHash } from "viem";

async function main() {
    const { viem } = await network.connect();
    const [deployer] = await viem.getWalletClients();
    const publicClient = await viem.getPublicClient();

    if (!deployer) throw new Error("No deployer wallet");
    console.log("Deploying with:", deployer.account.address);
    const balance = await publicClient.getBalance({ address: deployer.account.address });
    console.log("Balance:", formatUnits(balance, 18), "DOT");

    const addresses: Record<string, string> = {};

    const SIGNERS = [
        (process.env.SIGNER_1 || deployer.account.address) as `0x${string}`,
        (process.env.SIGNER_2 || deployer.account.address) as `0x${string}`,
        (process.env.SIGNER_3 || deployer.account.address) as `0x${string}`,
    ];
    const THRESHOLD           = 2;
    const STASH_ACCOUNT       = (process.env.STASH_ACCOUNT || zeroHash) as `0x${string}`;
    const REWARD_THRESHOLD    = parseUnits("10", 10);
    const HYDRADX_SOVEREIGN   = (process.env.HYDRADX_SOVEREIGN  || zeroHash) as `0x${string}`;
    const INTERLAY_SOVEREIGN  = (process.env.INTERLAY_SOVEREIGN || zeroHash) as `0x${string}`;
    const PROTOCOL_FEE_BPS    = 200;
    const MIN_PURCHASE_AMOUNT = parseUnits("100", 10);
    const CORETIME_FRACTION   = 500;
    const MIN_DELAY           = 48 * 3600;

    // -------------------------------------------------------------------------
    // 1. PolkaPulseMultisig
    // -------------------------------------------------------------------------

    console.log("\n[1/8] Deploying PolkaPulseMultisig...");
    const multisig = await viem.deployContract("PolkaPulseMultisig", [SIGNERS, THRESHOLD]);
    addresses.multisig = multisig.address;
    console.log("  PolkaPulseMultisig:", addresses.multisig);

    // -------------------------------------------------------------------------
    // 2. PolkaPulseTimelock
    // -------------------------------------------------------------------------

    console.log("\n[2/8] Deploying PolkaPulseTimelock...");
    const timelock = await viem.deployContract("PolkaPulseTimelock", [
        BigInt(MIN_DELAY),
        [addresses.multisig as `0x${string}`],
        [addresses.multisig as `0x${string}`],
        "0x0000000000000000000000000000000000000000" as `0x${string}`,
    ]);
    addresses.timelock = timelock.address;
    console.log("  PolkaPulseTimelock:", addresses.timelock);
    const minDelay = await timelock.read.MIN_DELAY();
    console.log("  MIN_DELAY:", minDelay.toString(), "seconds (48h)");

    // -------------------------------------------------------------------------
    // 3. ppDOT
    // -------------------------------------------------------------------------

    console.log("\n[3/8] Deploying ppDOT...");
    const ppdot = await viem.deployContract("ppDOT", [deployer.account.address]);
    addresses.ppdot = ppdot.address;
    console.log("  ppDOT:", addresses.ppdot);

    // -------------------------------------------------------------------------
    // 4. RewardMonitor
    // -------------------------------------------------------------------------

    console.log("\n[4/8] Deploying RewardMonitor...");
    const rewardMonitor = await viem.deployContract("RewardMonitor", [
        deployer.account.address,
        addresses.timelock as `0x${string}`,
        STASH_ACCOUNT,
        REWARD_THRESHOLD,
    ]);
    addresses.rewardMonitor = rewardMonitor.address;
    console.log("  RewardMonitor:", addresses.rewardMonitor);

    // -------------------------------------------------------------------------
    // 5. AtomicYieldExecutor
    // -------------------------------------------------------------------------

    console.log("\n[5/8] Deploying AtomicYieldExecutor...");
    const yieldExecutor = await viem.deployContract("AtomicYieldExecutor", [
        deployer.account.address,
        addresses.timelock as `0x${string}`,
        HYDRADX_SOVEREIGN,
        INTERLAY_SOVEREIGN,
    ]);
    addresses.yieldExecutor = yieldExecutor.address;
    console.log("  AtomicYieldExecutor:", addresses.yieldExecutor);

    // -------------------------------------------------------------------------
    // 6. CoretimeArbitrage
    // -------------------------------------------------------------------------

    console.log("\n[6/8] Deploying CoretimeArbitrage...");
    const coretimeArbitrage = await viem.deployContract("CoretimeArbitrage", [
        deployer.account.address,
        addresses.timelock as `0x${string}`,
        MIN_PURCHASE_AMOUNT,
        CORETIME_FRACTION,
    ]);
    addresses.coretimeArbitrage = coretimeArbitrage.address;
    console.log("  CoretimeArbitrage:", addresses.coretimeArbitrage);

    // -------------------------------------------------------------------------
    // 7. PolkaPulseCore (implementation)
    // -------------------------------------------------------------------------

    console.log("\n[7/8] Deploying PolkaPulseCore (implementation)...");
    const coreImpl = await viem.deployContract("PolkaPulseCore");
    addresses.coreImpl = coreImpl.address;
    console.log("  PolkaPulseCore impl:", addresses.coreImpl);

    // Build initialize() calldata for the proxy constructor
    const initData = encodeFunctionData({
        abi: coreImpl.abi,
        functionName: "initialize",
        args: [
            addresses.timelock as `0x${string}`,      // admin
            addresses.timelock as `0x${string}`,      // upgrader
            deployer.account.address,                 // keeper
            addresses.timelock as `0x${string}`,     // pauser
            addresses.ppdot as `0x${string}`,
            addresses.rewardMonitor as `0x${string}`,
            addresses.yieldExecutor as `0x${string}`,
            addresses.coretimeArbitrage as `0x${string}`,
            REWARD_THRESHOLD,                         // harvestThreshold
            PROTOCOL_FEE_BPS,
            deployer.account.address,                 // feeRecipient
        ],
    });

    // -------------------------------------------------------------------------
    // 8. PolkaPulseProxy
    // -------------------------------------------------------------------------

    console.log("\n[8/8] Deploying PolkaPulseProxy...");
    const proxy = await viem.deployContract("PolkaPulseProxy", [
        addresses.coreImpl as `0x${string}`,
        initData,
    ]);
    addresses.proxy = proxy.address;
    console.log("  PolkaPulseProxy:", addresses.proxy);

    // -------------------------------------------------------------------------
    // Post-deploy verification
    // -------------------------------------------------------------------------

    console.log("\n======= DEPLOYMENT COMPLETE =======");
    console.log("Network:", network.name);
    console.log("\nAddresses:");
    for (const [name, addr] of Object.entries(addresses)) {
        console.log(`  ${name.padEnd(22)}: ${addr}`);
    }

    const proxyContract = await viem.getContractAt("PolkaPulseProxy", addresses.proxy as `0x${string}`);
    const implSlot = await proxyContract.read.implementation();
    console.log("\nProxy implementation slot:", implSlot);
    console.log("Expected:                 ", addresses.coreImpl);
    console.log("Match:", implSlot.toLowerCase() === addresses.coreImpl.toLowerCase() ? "✅" : "❌ MISMATCH");

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
