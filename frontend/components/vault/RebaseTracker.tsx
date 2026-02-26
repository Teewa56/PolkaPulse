"use client";
import { useContractEvents } from "wagmi";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ppDOTToken } from "@/lib/contracts";
import { formatDOT, formatRate, truncateAddress } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";

export function RebaseTracker() {
    const { data: events, isLoading } = useContractEvents({
        ...ppDOTToken,
        eventName: "Rebase",
        fromBlock: "earliest",
        query:     { refetchInterval: 12_000 },
    });

    const sorted = [...(events ?? [])].reverse().slice(0, 10);

    return (
        <Card>
        <CardHeader label="Rebase Events" right={<Badge color="green">Live</Badge>} />
        {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner /></div>
        ) : sorted.length === 0 ? (
            <div style={{ padding: 20, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
            No rebase events yet
            </div>
        ) : (
            sorted.map((ev, i) => {
            const { oldRate, newRate, yieldDot } = ev.args as { oldRate: bigint; newRate: bigint; yieldDot: bigint };
            return (
                <div key={`${ev.transactionHash}-${i}`} style={{
                display: "grid", gridTemplateColumns: "80px 1fr 1fr 1fr",
                alignItems: "center", padding: "10px 16px",
                borderBottom: i < sorted.length - 1 ? "1px solid var(--border)" : "none",
                background: i === 0 ? "rgba(0,255,136,0.03)" : "transparent",
                }}>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)" }}>
                    #{String(ev.blockNumber)}
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--green)" }}>
                    +{formatDOT(yieldDot, 4)} DOT
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--text)" }}>
                    {formatRate(oldRate, 6)} → {formatRate(newRate, 6)}
                </span>
                
                    href={`https://assethub-westend.subscan.io/tx/${ev.transactionHash}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)", textDecoration: "none", textAlign: "right" }}
                >
                    {truncateAddress(ev.transactionHash ?? "")} ↗
                </a>
                </div>
            );
            })
        )}
        </Card>
    );
}