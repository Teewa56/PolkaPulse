"use client";
import { useCoretimeData } from "@/hooks/useCoretimeData";
import { formatDOT } from "@/lib/utils";

export function CoretimeStatus() {
  const { coretimeData, isLoading } = useCoretimeData();

  const stats = [
    { label: "Coretime Chain",  value: "Para 1005",                                          sub: "Polkadot Relay",     color: "var(--amber)" },
    { label: "Current Epoch",   value: `#${coretimeData.currentEpoch}`,                      sub: isLoading ? "…" : (coretimeData.epochReady ? "Trigger available" : "Running"), color: "var(--text)" },
    { label: "Treasury",        value: isLoading ? "…" : formatDOT(coretimeData.treasury, 2) + " DOT", sub: "Available for purchase", color: "var(--green)" },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3,1fr)",
      gap: 1, border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden",
    }}>
      {stats.map(({ label, value, sub, color }) => (
        <div key={label} style={{
          background: "var(--surface)", padding: "14px 16px",
          borderTop: color === "var(--amber)" ? "2px solid var(--amber)" : "2px solid transparent",
        }}>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
            {label}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 20, fontWeight: 500, color, marginBottom: 4 }}>
            {value}
          </div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)" }}>
            {sub}
          </div>
        </div>
      ))}
    </div>
  );
}