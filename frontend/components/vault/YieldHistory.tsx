"use client";
import { useContractEvents } from "wagmi";
import { polkaPulseCore } from "@/lib/contracts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatDOT, bpsToPercent, truncateAddress } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export function YieldHistory() {
  const { data: events, isLoading } = useContractEvents({
    ...polkaPulseCore,
    eventName: "YieldLoopExecuted",
    fromBlock: "earliest",
    query:     { refetchInterval: 12_000 },
  });

  const sorted = [...(events ?? [])].reverse();
  const chartData = [...sorted].reverse().map((ev, i) => ({
    i,
    apy: Number((ev.args as any).projectedApyBps ?? 0) / 100,
  }));

  return (
    <Card>
      <CardHeader label="Yield Loop History" right={<Badge color="pink">On-Chain</Badge>} />

      {isLoading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: 20 }}><Spinner /></div>
      ) : (
        <>
          {chartData.length > 1 && (
            <div style={{ height: 120, padding: "8px 0 0" }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pinkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E6007A" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#E6007A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="apy" stroke="#E6007A" strokeWidth={1.5} fill="url(#pinkGrad)" dot={false} />
                  <XAxis dataKey="i" hide />
                  <YAxis hide domain={["auto", "auto"]} />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 3, padding: "5px 9px" }}>
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--pink)" }}>
                            {payload[0]?.value?.toFixed(2)}% APY
                          </span>
                        </div>
                      ) : null
                    }
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {sorted.length === 0 ? (
            <div style={{ padding: 20, fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
              No yield loops executed yet
            </div>
          ) : (
            sorted.slice(0, 8).map((ev, i) => {
              const a = ev.args as any;
              return (
                <div key={`${ev.transactionHash}-${i}`} style={{
                  display: "grid", gridTemplateColumns: "80px 1fr 1fr 80px",
                  alignItems: "center", padding: "9px 16px",
                  borderTop: "1px solid var(--border)",
                }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)" }}>
                    #{String(ev.blockNumber)}
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--green)" }}>
                    +{formatDOT(a.expectedYieldDot ?? 0n, 4)} DOT
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--cyan)" }}>
                    {bpsToPercent(a.projectedApyBps ?? 0)} APY
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
        </>
      )}
    </Card>
  );
}