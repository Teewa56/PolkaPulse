import { useReadContracts } from "wagmi";
import { ppDOTToken, polkaPulseCore } from "@/lib/contracts";
import type { Address } from "viem";

export function useppDOTBalance(address: Address | undefined) {
  const enabled = !!address;

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...ppDOTToken,    functionName: "sharesOf",   args: [address!] },
      { ...ppDOTToken,    functionName: "balanceOf",  args: [address!] },
      { ...ppDOTToken,    functionName: "exchangeRate"                  },
    ],
    query: { enabled, refetchInterval: 8_000 },
  });

  const shares      = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const dotValue    = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const currentRate = (data?.[2]?.result as bigint | undefined) ?? 0n;

  // Estimate earned: dotValue − shares (if rate was 1:1 at entry, earned = dotValue - shares)
  // This is an approximation; a real dApp would store entry rate off-chain or in a subgraph
  const PRECISION = 10n ** 18n;
  const dotEarned = currentRate > PRECISION
    ? dotValue - shares  // simplified: shows value gained above 1:1
    : 0n;

  return { shares, dotValue, dotEarned, currentRate, isLoading, refetch };
}