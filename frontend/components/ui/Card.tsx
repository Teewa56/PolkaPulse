import { type ReactNode } from "react";
import clsx from "clsx";

interface CardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  style?: React.CSSProperties;
}

export function Card({ children, className, glow, style }: CardProps) {
  return (
    <div
      className={clsx(glow && "rate-glow", className)}
      style={{
        background: "var(--surface)",
        border:     "1px solid var(--border)",
        borderRadius: 4,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  label,
  right,
}: {
  label: string;
  right?: ReactNode;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 16px", borderBottom: "1px solid var(--border)",
      background: "var(--surface2)",
    }}>
      <span style={{
        fontFamily: "'IBM Plex Mono',monospace", fontSize: 10,
        color: "var(--muted)", letterSpacing: "0.12em", textTransform: "uppercase",
      }}>
        {label}
      </span>
      {right}
    </div>
  );
}