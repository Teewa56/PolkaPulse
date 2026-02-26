import { parseUnits } from "viem";

// ─── Chain ────────────────────────────────────────────────────────────────────
export const ASSET_HUB_CHAIN_ID   = Number(process.env.NEXT_PUBLIC_CHAIN_ID!);
export const ASSET_HUB_RPC        = process.env.NEXT_PUBLIC_ASSET_HUB_RPC!;

// ─── Contracts ────────────────────────────────────────────────────────────────
export const POLKAPULSE_CORE_ADDRESS      = (process.env.NEXT_PUBLIC_POLKAPULSE_CORE_ADDRESS!) as `0x${string}`;
export const PPDOT_TOKEN_ADDRESS          = (process.env.NEXT_PUBLIC_PPDOT_TOKEN_ADDRESS!) as `0x${string}`;
export const CORETIME_ARBITRAGE_ADDRESS   = (process.env.NEXT_PUBLIC_CORETIME_ARBITRAGE_ADDRESS!) as `0x${string}`;
export const REWARD_MONITOR_ADDRESS       = (process.env.NEXT_PUBLIC_REWARD_MONITOR_ADDRESS!) as `0x${string}`;

// ─── Precompiles (pallet-revive fixed addresses) ──────────────────────────────
export const STAKING_PRECOMPILE_ADDRESS   = "0x0000000000000000000000000000000000000800" as `0x${string}`;
export const XCM_PRECOMPILE_ADDRESS       = "0x0000000000000000000000000000000000000808" as `0x${string}`;
export const MATH_LIB_PRECOMPILE_ADDRESS  = "0x0000000000000000000000000000000000001001" as `0x${string}`;
export const YIELD_OPTIMIZER_ADDRESS      = "0x0000000000000000000000000000000000001002" as `0x${string}`;

// ─── Parachains ───────────────────────────────────────────────────────────────
export const HYDRADX_PARA_ID   = 2034;
export const INTERLAY_PARA_ID  = 2032;
export const CORETIME_PARA_ID  = 1005;

// ─── Token ────────────────────────────────────────────────────────────────────
export const DOT_DECIMALS      = 18;          // Solidity / EVM representation
export const DOT_PLANCK        = 10;          // Native DOT (relay chain)
export const PRECISION         = parseUnits("1", 18);

// ─── Protocol ────────────────────────────────────────────────────────────────
export const MIN_DEPOSIT        = parseUnits("0.001", 18);   // 0.001 DOT
export const EPOCH_INTERVAL_S   = 7 * 24 * 60 * 60;         // 7 days in seconds
export const BPS_DENOMINATOR    = 10_000n;