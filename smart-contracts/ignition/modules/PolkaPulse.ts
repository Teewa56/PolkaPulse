import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseUnits } from "ethers";

// DEPLOYMENT ORDER (order-dependent):
//   1. PolkaPulseMultisig      — sets up M-of-N governance signers
//   2. PolkaPulseTimelock      — wires multisig as the sole proposer
//   3. ppDOT                   — receipt token
//   4. RewardMonitor           — staking reward poller
//   5. AtomicYieldExecutor     — XCM yield loop dispatcher
//   6. CoretimeArbitrage       — Coretime purchase engine
//   7. PolkaPulseCore (impl)   — UUPS implementation contract
//   8. PolkaPulseProxy         — Transparent proxy wrapping Core
//
// IMPORTANT:
//   PVM precompile addresses must be registered in the pallet-revive runtime
//   before deploying Solidity contracts. The precompile addresses are hardcoded
//   in AtomicYieldExecutor.sol and must match precompile_set.rs.

const PolkaPulseModule = buildModule("PolkaPulse", (m) => {

    // -------------------------------------------------------------------------
    // Parameters
    // -------------------------------------------------------------------------

    const deployer            = m.getAccount(0);
    const signer1             = m.getParameter("signer1");
    const signer2             = m.getParameter("signer2");
    const signer3             = m.getParameter("signer3");
    const multisigThreshold   = m.getParameter("multisigThreshold", 2);
    const stashAccount        = m.getParameter("stashAccount");
    const rewardThreshold     = m.getParameter("rewardThreshold", parseUnits("10", 10));
    const hydraDXSovereign    = m.getParameter("hydraDXSovereign");
    const interlaySovereign   = m.getParameter("interlaySovereign");
    const protocolFeeBps      = m.getParameter("protocolFeeBps", 200);
    const minPurchaseAmount   = m.getParameter("minPurchaseAmount", parseUnits("100", 10));
    const coretimeFractionBps = m.getParameter("coretimeFractionBps", 500);

    // -------------------------------------------------------------------------
    // 1. Multisig
    // -------------------------------------------------------------------------

    const multisig = m.contract("PolkaPulseMultisig", [
        [signer1, signer2, signer3],
        multisigThreshold,
    ]);

    // -------------------------------------------------------------------------
    // 2. Timelock
    // -------------------------------------------------------------------------

    const timelock = m.contract("PolkaPulseTimelock", [multisig]);

    // -------------------------------------------------------------------------
    // 3. ppDOT — placeholder core address, real one is the proxy post-deploy
    // -------------------------------------------------------------------------

    const ppdot = m.contract("ppDOT", [deployer]);

    // -------------------------------------------------------------------------
    // 4. RewardMonitor
    // -------------------------------------------------------------------------

    const rewardMonitor = m.contract("RewardMonitor", [
        deployer,
        timelock,
        stashAccount,
        rewardThreshold,
    ]);

    // -------------------------------------------------------------------------
    // 5. AtomicYieldExecutor
    // -------------------------------------------------------------------------

    const yieldExecutor = m.contract("AtomicYieldExecutor", [
        deployer,
        timelock,
        hydraDXSovereign,
        interlaySovereign,
    ]);

    // -------------------------------------------------------------------------
    // 6. CoretimeArbitrage
    // -------------------------------------------------------------------------

    const coretimeArbitrage = m.contract("CoretimeArbitrage", [
        deployer,
        timelock,
        minPurchaseAmount,
        coretimeFractionBps,
    ]);

    // -------------------------------------------------------------------------
    // 7. PolkaPulseCore implementation
    // -------------------------------------------------------------------------

    const coreImpl = m.contract("PolkaPulseCore");

    const initData = m.encodeFunctionCall(coreImpl, "initialize", [
        timelock,
        ppdot,
        rewardMonitor,
        yieldExecutor,
        coretimeArbitrage,
        protocolFeeBps,
    ]);

    // -------------------------------------------------------------------------
    // 8. Proxy
    // -------------------------------------------------------------------------

    const proxy = m.contract("PolkaPulseProxy", [
        coreImpl,
        timelock,
        initData,
    ]);

    return {
        multisig,
        timelock,
        ppdot,
        rewardMonitor,
        yieldExecutor,
        coretimeArbitrage,
        coreImpl,
        proxy,
    };
});

export default PolkaPulseModule;