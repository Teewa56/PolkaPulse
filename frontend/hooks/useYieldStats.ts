import { useReadContracts } from "wagmi";
import { polkaPulseCore, rewardMonitor, ppDOTToken } from "@/lib/contracts";

export function useYieldStats() {
  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      { ...polkaPulseCore, functionName: "totalDOT"       },
      { ...polkaPulseCore, functionName: "exchangeRate"   },
      { ...polkaPulseCore, functionName: "harvestReady"   },
      { ...polkaPulseCore, functionName: "protocolFeeBps" },
      { ...rewardMonitor,  functionName: "pendingRewards" },
      { ...rewardMonitor,  functionName: "rewardThreshold"},
      { ...rewardMonitor,  functionName: "lastHarvestAt"  },
      { ...ppDOTToken,     functionName: "totalShares"    },
    ],
    query: { refetchInterval: 12_000 },
  });

  const totalDOT        = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const exchangeRate    = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const harvestReady    = (data?.[2]?.result as boolean | undefined) ?? false;
  const protocolFeeBps  = (data?.[3]?.result as number | undefined) ?? 0;
  const pendingRewards  = (data?.[4]?.result as bigint | undefined) ?? 0n;
  const rewardThreshold = (data?.[5]?.result as bigint | undefined) ?? 0n;
  const lastHarvestAt   = (data?.[6]?.result as bigint | undefined) ?? 0n;
  const totalShares     = (data?.[7]?.result as bigint | undefined) ?? 0n;

  // Derive approximate APY from exchange rate change
  // rate ticks up each rebase; without historical data we display the on-chain value
  const PRECISION = 10n ** 18n;
  const apyBps = exchangeRate > PRECISION
    ? Number(((exchangeRate - PRECISION) * 10_000n) / PRECISION)
    : 0;

  return {
    totalDOT,
    exchangeRate,
    harvestReady,
    protocolFeeBps,
    pendingRewards,
    rewardThreshold,
    lastHarvestAt,
    totalShares,
    apyBps,
    isLoading,
    error,
    refetch,
  };
}