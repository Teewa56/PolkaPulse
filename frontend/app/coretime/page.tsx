import { CoretimeStatus }    from "@/components/coretime/CoretimeStatus";
import { EpochCountdown }    from "@/components/coretime/EpochCountdown";
import { PartnerParachains } from "@/components/coretime/PartnerParachains";
import { Navbar }            from "@/components/layout/Navbar";
import { Footer }            from "@/components/layout/Footer";

export default function CoretimePage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <div style={{ height: 52 }} />
      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <CoretimeStatus />
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 12 }}>
          <EpochCountdown />
          <PartnerParachains />
        </div>
      </main>
      <Footer />
    </div>
  );
}