import {
  POLKAPULSE_CORE_ADDRESS,
  PPDOT_TOKEN_ADDRESS,
  CORETIME_ARBITRAGE_ADDRESS,
  REWARD_MONITOR_ADDRESS,
} from "@/constants";
import {
  POLKAPULSE_CORE_ABI,
  PPDOT_ABI,
  CORETIME_ARBITRAGE_ABI,
  REWARD_MONITOR_ABI,
} from "@/types/contracts";

export const polkaPulseCore = {
  address: POLKAPULSE_CORE_ADDRESS,
  abi:     POLKAPULSE_CORE_ABI,
} as const;

export const ppDOTToken = {
  address: PPDOT_TOKEN_ADDRESS,
  abi:     PPDOT_ABI,
} as const;

export const coretimeArbitrage = {
  address: CORETIME_ARBITRAGE_ADDRESS,
  abi:     CORETIME_ARBITRAGE_ABI,
} as const;

export const rewardMonitor = {
  address: REWARD_MONITOR_ADDRESS,
  abi:     REWARD_MONITOR_ABI,
} as const;