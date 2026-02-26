"use client";
import { useYieldStats } from "@/hooks/useYieldStats";
import { formatDOTCompact, bpsToPercent, formatDOT } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";

export function YieldStats() {
    const { totalDOT, exchangeRate, apyBps, protocolFeeBps, pendingRewards, isLoading } = useYieldStats();

    if (isLoading) return (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
        <Spinner />
        </div>
    );

    const stats = [
        { label: "Total Value Locked",  value: formatDOTCompact(totalDOT) + " DOT",    accent: false },
        { label: "Protocol Net APY",    value: bpsToPercent(apyBps),                   accent: true  },
        { label: "Pending Rewards",     value: formatDOT(pendingRewards, 4) + " DOT",  accent: false },
        { label: "Protocol Fee",        value: bpsToPercent(protocolFeeBps),            accent: false },
    ];

    return (
        <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)",
        gap: 1, border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden",
        }}>
        {stats.map(({ label, value, accent }) => (
            <div key={label} style={{
            background: "var(--surface)", padding: "14px 16px",
            borderTop: accent ? "2px solid var(--pink)" : "2px solid transparent",
            }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                {label}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, fontWeight: 500, color: accent ? "var(--pink)" : "var(--text)" }}>
                {value}
            </div>
            </div>
        ))}
        </div>
    );
}