interface BadgeProps {
  children: React.ReactNode;
  color?: "pink" | "cyan" | "green" | "amber" | "muted";
}

const colorMap = {
  pink:  { bg: "rgba(230,0,122,0.12)",  text: "#E6007A", border: "rgba(230,0,122,0.3)"  },
  cyan:  { bg: "rgba(0,212,255,0.1)",   text: "#00D4FF", border: "rgba(0,212,255,0.3)"  },
  green: { bg: "rgba(0,255,136,0.1)",   text: "#00FF88", border: "rgba(0,255,136,0.3)"  },
  amber: { bg: "rgba(255,184,0,0.1)",   text: "#FFB800", border: "rgba(255,184,0,0.3)"  },
  muted: { bg: "rgba(82,82,106,0.15)",  text: "#52526A", border: "rgba(82,82,106,0.3)"  },
};

export function Badge({ children, color = "pink" }: BadgeProps) {
  const c = colorMap[color];
  return (
    <span style={{
      fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, fontWeight: 500,
      padding: "2px 6px", borderRadius: 2,
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
      letterSpacing: "0.08em", textTransform: "uppercase",
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}