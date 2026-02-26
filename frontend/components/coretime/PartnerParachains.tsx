"use client";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useCoretimeData } from "@/hooks/useCoretimeData";
import { coretimeArbitrage as coretimeContract } from "@/lib/contracts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { bpsToPercent } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";

const PARA_COLOR: Record<number, string> = { 2034: "#00D4FF", 2032: "#00FF88" };

export function PartnerParachains() {
  const { coretimeData, isLoading, refetch } = useCoretimeData();

  const { writeContractAsync, data: hash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash, query: { enabled: !!hash } });

  const handleTrigger = async () => {
    await writeContractAsync({ ...coretimeContract, functionName: "triggerEpoch", args: [] });
    refetch();
  };

  return (
    <Card>
      <CardHeader
        label="Partner Parachains"
        right={
          coretimeData.epochReady ? (
            <Button
              size="sm"
              onClick={handleTrigger}
              loading={isPending || isConfirming}
              style={{ width: "auto" }}
            >
              {isSuccess ? "✓ Triggered" : "Trigger Epoch"}
            </Button>
          ) : (
            <Badge color="muted">Epoch Pending</Badge>
          )
        }
      />

      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner /></div>
      ) : coretimeData.partners.length === 0 ? (
        <div style={{ padding: 20, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
          No partner parachains registered
        </div>
      ) : (
        coretimeData.partners.map((p, i) => {
          const color = PARA_COLOR[p.parachainId] ?? "#E6007A";
          return (
            <div key={p.parachainId} style={{
              display: "grid", gridTemplateColumns: "160px 1fr 1fr 1fr 60px",
              alignItems: "center", padding: "14px 16px", gap: 12,
              borderTop: "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block", boxShadow: `0 0 8px ${color}` }} />
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: "var(--text)" }}>{p.name}</span>
              </div>
              <div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", marginBottom: 2, letterSpacing: "0.08em", textTransform: "uppercase" }}>Para ID</div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color }}>{p.parachainId}</div>
              </div>
              <div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", marginBottom: 2, letterSpacing: "0.08em", textTransform: "uppercase" }}>Boosted APY</div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "var(--green)" }}>{bpsToPercent(p.boostedApyBps)}</div>
              </div>
              <div>
                <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: "var(--muted)", marginBottom: 4, letterSpacing: "0.08em", textTransform: "uppercase" }}>Allocation</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ height: 3, width: 56, background: "var(--bg)", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${p.allocationPct}%`, background: color, borderRadius: 2 }} />
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color }}>{p.allocationPct}%</span>
                </div>
              </div>
              <Badge color={p.isActive ? "green" : "muted"}>{p.isActive ? "active" : "inactive"}</Badge>
            </div>
          );
        })
      )}

      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)" }}>
          Partners receive Bulk Coretime NFTs in exchange for boosted yield commitments. Managed via Multisig + 48h Timelock.
        </span>
      </div>
    </Card>
  );
}