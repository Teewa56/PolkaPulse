import { YieldStats }       from "@/components/dashboard/YieldStats";
import { DepositCard }      from "@/components/dashboard/DepositCard";
import { WithdrawCard }     from "@/components/dashboard/WithdrawCard";
import { PositionSummary }  from "@/components/dashboard/PositionSummary";
import { AllocationChart }  from "@/components/dashboard/AllocationChart";
import { Navbar }           from "@/components/layout/Navbar";
import { Footer }           from "@/components/layout/Footer";

export default function DashboardPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <div style={{ height: 52 }} />

      {/* Ticker */}
      <div style={{ height: 28, overflow: "hidden", borderBottom: "1px solid var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 48, whiteSpace: "nowrap", animation: "ticker 30s linear infinite" }}>
          {Array(2).fill(["ppDOT Vault", "HydraDX Integration", "Interlay Integration", "XCM v5", "Asset Hub", "Coretime Arbitrage", "pallet-revive"]).flat().map((t, i) => (
            <span key={i} style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)", letterSpacing: "0.08em" }}>
              <span style={{ color: "var(--pink)", marginRight: 4 }}>◈</span>{t}
            </span>
          ))}
        </div>
      </div>

      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <YieldStats />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <DepositCard />
          <WithdrawCard />
        </div>
        <PositionSummary />
        <AllocationChart />
      </main>
      <Footer />
    </div>
  );
}