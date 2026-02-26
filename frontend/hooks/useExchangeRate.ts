import { useReadContracts } from "wagmi";
import { polkaPulseCore, ppDOTToken } from "@/lib/contracts";
import { POLKAPULSE_CORE_ADDRESS, PPDOT_TOKEN_ADDRESS } from "@/constants";

export function useExchangeRate() {
  const { data, isLoading, error, refetch } = useReadContracts({
    contracts: [
      { ...polkaPulseCore, functionName: "exchangeRate" },
      { ...ppDOTToken,     functionName: "exchangeRate" },
      { ...polkaPulseCore, functionName: "totalDOT"     },
      { ...ppDOTToken,     functionName: "totalSupply"  },
      { ...ppDOTToken,     functionName: "totalShares"  },
    ],
    query: { refetchInterval: 6_000 },
  });

  const exchangeRate  = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const ppdotRate     = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const totalDOT      = (data?.[2]?.result as bigint | undefined) ?? 0n;
  const totalSupply   = (data?.[3]?.result as bigint | undefined) ?? 0n;
  const totalShares   = (data?.[4]?.result as bigint | undefined) ?? 0n;

  // Use the ppDOT contract rate as the canonical source
  const rate = ppdotRate > 0n ? ppdotRate : exchangeRate;

  return { rate, totalDOT, totalSupply, totalShares, isLoading, error, refetch };
}