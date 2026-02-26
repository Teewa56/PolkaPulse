"use client";
import { useExchangeRate } from "@/hooks/useExchangeRate";
import { Card } from "@/components/ui/Card";
import { formatRate, formatDOTCompact } from "@/lib/utils";

export function ppDOTRate() {
    const { rate, totalDOT, totalShares, isLoading } = useExchangeRate();

    const PRECISION = 10n ** 18n;
    const gainPct = rate > PRECISION
        ? Number(((rate - PRECISION) * 10_000n) / PRECISION) / 100
        : 0;

    return (
        <Card glow style={{ position: "relative", overflow: "hidden" }}>
        <div className="scanline" style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
        <div style={{ padding: "28px 24px", textAlign: "center", position: "relative", zIndex: 1 }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 14 }}>
            ppDOT / DOT Exchange Rate
            </div>
            <div style={{
            fontFamily: "'DM Serif Display',serif", fontSize: 52, color: "var(--pink)",
            letterSpacing: "-0.02em", lineHeight: 1,
            textShadow: "0 0 40px rgba(230,0,122,0.5)",
            }}>
            {isLoading ? "Loading…" : formatRate(rate, 8)}
            </div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
            1 ppDOT redeems for {formatRate(rate, 8)} DOT · Rate is monotonically non-decreasing
            </div>
            <div style={{ display: "flex", gap: 24, justifyContent: "center", marginTop: 22 }}>
            {[
                { label: "All-time gain",   value: `+${gainPct.toFixed(2)}%`,              color: "var(--green)" },
                { label: "Total DOT",       value: formatDOTCompact(totalDOT) + " DOT",    color: "var(--text)"  },
                { label: "Total Shares",    value: formatDOTCompact(totalShares) + " ppDOT", color: "var(--cyan)" },
            ].map(({ label, value, color }) => (
                <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    {label}
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, color }}>
                    {isLoading ? "…" : value}
                </div>
                </div>
            ))}
            </div>
        </div>
        </Card>
    );
}