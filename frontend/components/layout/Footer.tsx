export function Footer() {
  return (
    <footer style={{
      borderTop: "1px solid var(--border)", padding: "12px 20px",
      display: "flex", justifyContent: "space-between", alignItems: "center",
      background: "var(--surface2)",
    }}>
      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)" }}>
        PolkaPulse · Asset Hub · pallet-revive
      </span>
      <div style={{ display: "flex", gap: 20 }}>
        {["Docs", "GitHub", "Audit"].map(l => (
          <a key={l} href="#" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: "var(--muted)", textDecoration: "none" }}>
            {l}
          </a>
        ))}
      </div>
    </footer>
  );
}