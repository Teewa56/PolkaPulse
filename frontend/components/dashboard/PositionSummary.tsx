"use client";
import { useAccount } from "wagmi";
import { useppDOTBalance } from "@/hooks/useppDOTBalance";
import { Card, CardHeader } from "@/components/ui/Card";
import { formatDOT, formatRate } from "@/lib/utils";

export function PositionSummary() {
  const { address, isConnected } = useAccount();
  const { shares, dotValue, dotEarned, currentRate, isLoading } = useppDOTBalance(address);

  if (!isConnected) return (
    <Card style={{ padding: 24, textAlign: "center" }}>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
        No position
      </div>
      <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted2)" }}>
        Connect wallet to view your position
      </div>
    </Card>
  );

  const fields = [
    { label: "ppDOT Balance",  value: formatDOT(shares, 6),          suffix: "ppDOT",       color: "var(--text)"  },
    { label: "DOT Value",      value: formatDOT(dotValue, 4),         suffix: "DOT",         color: "var(--text)"  },
    { label: "DOT Earned",     value: formatDOT(dotEarned > 0n ? dotEarned : 0n, 6), suffix: "DOT", color: "var(--green)" },
    { label: "Current Rate",   value: formatRate(currentRate, 8),     suffix: "DOT/ppDOT",   color: "var(--pink)"  },
  ];

  return (
    <Card>
      <CardHeader label="Your Position" right={
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green)", display: "inline-block", animation: "pulse 2s infinite", boxShadow: "0 0 6px var(--green)" }} />
      } />
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {fields.map(({ label, value, suffix, color }) => (
          <div key={label} style={{ background: "var(--bg)", borderRadius: 3, padding: "10px 12px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {label}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 15, color }}>
              {isLoading ? "…" : value}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted2)" }}>
              {suffix}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}