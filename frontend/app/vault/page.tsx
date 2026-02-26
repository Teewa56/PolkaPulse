import { ppDOTRate }     from "@/components/vault/ppDOTRate";
import { YieldHistory }  from "@/components/vault/YieldHistory";
import { RebaseTracker } from "@/components/vault/RebaseTracker";
import { Navbar }        from "@/components/layout/Navbar";
import { Footer }        from "@/components/layout/Footer";

export default function VaultPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <Navbar />
      <div style={{ height: 52 }} />
      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", width: "100%", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <ppDOTRate />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <YieldHistory />
          <RebaseTracker />
        </div>
      </main>
      <Footer />
    </div>
  );
}