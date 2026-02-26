"use client";
import { useState, useEffect } from "react";
import { useCoretimeData } from "@/hooks/useCoretimeData";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatCountdown, formatDOT } from "@/lib/utils";
import { EPOCH_INTERVAL_S } from "@/constants";
import { Spinner } from "@/components/ui/Spinner";

export function EpochCountdown() {
  const { coretimeData, secondsUntilEpoch, isLoading } = useCoretimeData();
  const [secs, setSecs] = useState(secondsUntilEpoch);

  useEffect(() => {
    setSecs(secondsUntilEpoch);
  }, [secondsUntilEpoch]);

  useEffect(() => {
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  const { h, m, s } = formatCountdown(secs);
  const elapsed    = EPOCH_INTERVAL_S - secs;
  const progressPct = ((elapsed / EPOCH_INTERVAL_S) * 100).toFixed(1);

  return (
    <Card>
      <CardHeader
        label={`Epoch #${coretimeData.currentEpoch}`}
        right={<Badge color={coretimeData.epochReady ? "green" : "amber"}>{coretimeData.epochReady ? "Ready" : "Active"}</Badge>}
      />
      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 24 }}><Spinner /></div>
      ) : (
        <div style={{ padding: "20px 16px" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
              {coretimeData.epochReady ? "Epoch Ready to Trigger" : "Next Coretime Purchase In"}
            </div>
            <div style={{
              fontFamily: "'DM Serif Display',serif", fontSize: 44, color: "var(--amber)",
              letterSpacing: "0.04em", textShadow: "0 0 30px rgba(255,184,0,0.4)",
            }}>
              {h}<span className="blink">:</span>{m}<span className="blink">:</span>{s}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)" }}>Epoch Progress</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--amber)" }}>{progressPct}%</span>
            </div>
            <div style={{ height: 4, background: "var(--bg)", borderRadius: 2 }}>
              <div style={{
                height: "100%", width: `${progressPct}%`, background: "var(--amber)",
                borderRadius: 2, boxShadow: "0 0 8px rgba(255,184,0,0.5)", transition: "width 1s linear",
              }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Treasury",     value: formatDOT(coretimeData.treasury, 2) + " DOT" },
              { label: "Min Purchase", value: formatDOT(coretimeData.minPurchaseAmount, 0) + " DOT" },
              { label: "Epoch",        value: `#${coretimeData.currentEpoch}` },
              { label: "Coretime %",   value: (coretimeData.coretimeFractionBps / 100).toFixed(1) + "% of yield" },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "var(--bg)", borderRadius: 3, padding: "8px 10px" }}>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", marginBottom: 3, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {label}
                </div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: "var(--amber)" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}