"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", icon: "◈", label: "Dashboard" },
  { href: "/vault",     icon: "◉", label: "Vault"     },
  { href: "/coretime",  icon: "◎", label: "Coretime"  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside style={{
      width: 200, flexShrink: 0, borderRight: "1px solid var(--border)",
      background: "var(--surface)", paddingTop: 16,
      display: "flex", flexDirection: "column", gap: 2, padding: "16px 8px",
    }}>
      {LINKS.map(l => (
        <Link key={l.href} href={l.href} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 12px", borderRadius: 3, textDecoration: "none",
          fontFamily: "'IBM Plex Mono',monospace", fontSize: 12,
          background: pathname === l.href ? "rgba(230,0,122,0.1)" : "transparent",
          color:      pathname === l.href ? "var(--pink)" : "var(--muted)",
          border:     pathname === l.href ? "1px solid rgba(230,0,122,0.2)" : "1px solid transparent",
          transition: "all 0.15s",
        }}>
          <span style={{ fontSize: 14 }}>{l.icon}</span>
          {l.label}
        </Link>
      ))}
    </aside>
  );
}