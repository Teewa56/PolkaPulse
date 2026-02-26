import { useReadContracts } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { coretimeArbitrage } from "@/lib/contracts";
import { EPOCH_INTERVAL_S, HYDRADX_PARA_ID, INTERLAY_PARA_ID } from "@/constants";
import type { CoretimeData, PartnerParachain } from "@/types/protocol";

const KNOWN_PARACHAINS: Record<number, string> = {
  2034: "HydraDX",
  2032: "Interlay",
  2030: "Bifrost",
  2035: "Phala",
};

export function useCoretimeData() {
    const { data, isLoading, refetch } = useReadContracts({
        contracts: [
        { ...coretimeArbitrage, functionName: "treasury"            },
        { ...coretimeArbitrage, functionName: "minPurchaseAmount"   },
        { ...coretimeArbitrage, functionName: "coretimeFractionBps" },
        { ...coretimeArbitrage, functionName: "currentEpoch"        },
        { ...coretimeArbitrage, functionName: "lastEpochAt"         },
        { ...coretimeArbitrage, functionName: "epochReady"          },
        { ...coretimeArbitrage, functionName: "getPartners"         },
        ],
        query: { refetchInterval: 15_000 },
    });

    const treasury            = (data?.[0]?.result as bigint   | undefined) ?? 0n;
    const minPurchaseAmount   = (data?.[1]?.result as bigint   | undefined) ?? 0n;
    const coretimeFractionBps = (data?.[2]?.result as number   | undefined) ?? 0;
    const currentEpoch        = (data?.[3]?.result as number   | undefined) ?? 0;
    const lastEpochAt         = (data?.[4]?.result as bigint   | undefined) ?? 0n;
    const epochReady          = (data?.[5]?.result as boolean  | undefined) ?? false;
    const partnerIds          = (data?.[6]?.result as readonly number[] | undefined) ?? [];

    // Fetch boosted APY for each partner
    const { data: partnerApyData } = useReadContracts({
        contracts: partnerIds.map(id => ({
        ...coretimeArbitrage,
        functionName: "partnerBoostedApyBps" as const,
        args: [id] as const,
        })),
        query: { enabled: partnerIds.length > 0 },
    });

    const partners: PartnerParachain[] = partnerIds.map((id, i) => {
        const bps = (partnerApyData?.[i]?.result as number | undefined) ?? 0;
        return {
        parachainId:   id,
        name:          KNOWN_PARACHAINS[id] ?? `Para ${id}`,
        isActive:      true,
        boostedApyBps: bps,
        // Allocation percentage: derived from relative boosted APY weight
        allocationPct: 0, // computed below
        };
    });

    // Compute allocation percentages by relative boosted APY
    const totalBps = partners.reduce((s, p) => s + p.boostedApyBps, 0);
    const partnersWithAlloc = partners.map(p => ({
        ...p,
        allocationPct: totalBps > 0 ? Math.round((p.boostedApyBps / totalBps) * 100) : 0,
    }));

    // Seconds until next epoch
    const nowSecs = Math.floor(Date.now() / 1000);
    const lastEpochSecs = Number(lastEpochAt);
    const nextEpochAt = lastEpochSecs + EPOCH_INTERVAL_S;
    const secondsUntilEpoch = Math.max(0, nextEpochAt - nowSecs);

    const coretimeData: CoretimeData = {
        treasury,
        minPurchaseAmount,
        coretimeFractionBps,
        currentEpoch,
        lastEpochAt,
        epochReady,
        partners: partnersWithAlloc,
    };

    return { coretimeData, secondsUntilEpoch, isLoading, refetch };
}