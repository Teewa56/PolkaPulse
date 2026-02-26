"use client";
import { useCoretimeData } from "@/hooks/useCoretimeData";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { bpsToPercent } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";

const PARA_COLOR: Record<number, string> = {
  2034: "#00D4FF",
  2032: "#00FF88",
};

export function AllocationChart() {
    const { coretimeData, isLoading } = useCoretimeData();

    return (
    <Card>
        <CardHeader label="Yield Allocation" right={<Badge color="cyan">PVM Optimized</Badge>} />
        <div style={{ padding: 16 }}>
        {isLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 16 }}><Spinner /></div>
        ) : coretimeData.partners.length === 0 ? (
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--muted)", textAlign: "center", padding: 16 }}>
            No active partners
            </div>
        ) : (
            coretimeData.partners.map(p => {
            const color = PARA_COLOR[p.parachainId] ?? "#E6007A";
            return (
                <div key={p.parachainId} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block", boxShadow: `0 0 6px ${color}` }} />
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--text)" }}>{p.name}</span>
                    <Badge color={p.parachainId === 2034 ? "cyan" : "green"}>Para {p.parachainId}</Badge>
                    </div>
                    <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color }}>{p.allocationPct}%</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--muted)" }}>{bpsToPercent(p.boostedApyBps)} APY</span>
                    </div>
                </div>
                <div style={{ height: 6, background: "var(--bg)", borderRadius: 3 }}>
                    <div style={{
                    height: "100%", width: `${p.allocationPct}%`, background: color,
                    borderRadius: 3, boxShadow: `0 0 8px ${color}60`, transition: "width 0.6s ease",
                    }} />
                </div>
                </div>
            );
            })
        )}

        {coretimeData.partners.length > 0 && (
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)" }}>Blended Net APY</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: "var(--pink)", fontWeight: 600 }}>
                {bpsToPercent(
                coretimeData.partners.reduce((s, p) => s + Math.round(p.boostedApyBps * p.allocationPct / 100), 0)
                )}
            </span>
            </div>
        )}
        </div>
    </Card>
    );
}